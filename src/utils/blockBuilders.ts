/**
 * Shared raw-ProseMirror block builders used by both Bruno importer paths —
 * the classic per-file `.bru` converter and the OpenCollection YAML
 * converter. Auth/assertions/scripts have no VoidenApiHelpers-exposed
 * builder (see useVoidenApiHelpers.ts), so both paths hand-roll the same
 * table/cell shapes postman-import's buildAuthBlock already established as
 * correct — factored out here since the two source formats produce
 * differently-shaped *inputs* but need identically-shaped *outputs*.
 */

export const makeUid = () => crypto.randomUUID();

/** Build a tableCell node. `content` is the cell's paragraph content. */
export function makeTableCell(content: any[]) {
  return {
    type: 'tableCell',
    attrs: { colspan: 1, rowspan: 1, colwidth: null },
    content: [{ type: 'paragraph', content }],
  };
}

// Never a literal "" here — an empty ProseMirror text node/cell gets the
// whole block silently discarded when opened in the editor (see the base
// skill's "never write an empty string" rule). Use "n/a" for cells with
// nothing to say.
export function makeTextCell(text?: string) {
  const value = text && text.length > 0 ? text : 'n/a';
  return makeTableCell([{ type: 'text', text: value }]);
}

/** Build a raw ProseMirror `table` node from arbitrary-width rows. */
export function buildTableContent(rows: Array<{ disabled?: boolean; cells: string[] }>) {
  return [
    {
      type: 'table',
      content: rows.map((r) => ({
        type: 'tableRow',
        attrs: { disabled: !!r.disabled },
        content: r.cells.map((c) => makeTextCell(c)),
      })),
    },
  ];
}

/** Build a Voiden `auth` block from an already-normalized (authType, rows) pair. */
export function buildAuthBlockFromRows(authType: string, rows: [string, string][]): any | null {
  if (rows.length === 0) return null;
  return {
    type: 'auth',
    attrs: { uid: makeUid(), authType },
    content: buildTableContent(rows.map(([k, v]) => ({ cells: [k, v] }))),
  };
}

// Shared assert-operator vocabulary — both `.bru`'s `assert{}` block and
// OpenCollection's `runtime.assertions[]` use a "field/expression + operator
// + expected value" shape, and Voiden's assertions-table operator names are
// the same target either way.
export const ASSERT_OP_MAP: Record<string, string> = {
  eq: 'equals',
  neq: 'not-equals',
  contains: 'contains',
  notContains: 'not-contains',
  isDefined: 'exists',
  isUndefined: 'not-exists',
  gt: 'greater-than',
  gte: 'greater-equal',
  lt: 'less-than',
  lte: 'less-equal',
  isEmpty: 'is-empty',
  isNotEmpty: 'not-empty',
  isTruthy: 'is-truthy',
  isFalsy: 'is-falsy',
  matches: 'matches',
};
export const ASSERT_NO_EXPECTED = new Set(['isDefined', 'isUndefined', 'isEmpty', 'isNotEmpty', 'isTruthy', 'isFalsy']);

export interface NormalizedAssertionRow {
  description: string;
  field: string;
  op: string | undefined; // mapped Voiden operator, or undefined if unrecognized
  expected: string | null;
  disabled: boolean;
  supported: boolean; // false => import disabled with raw expression preserved
}

/** Build a Voiden `assertions-table` block from pre-normalized rows. */
export function buildAssertionsTableFromRows(rows: NormalizedAssertionRow[]): any | null {
  if (rows.length === 0) return null;
  return {
    type: 'assertions-table',
    attrs: { uid: makeUid() },
    content: buildTableContent(
      rows.map((r) => ({
        disabled: r.disabled || !r.supported,
        cells: [r.description, r.field, r.supported && r.op ? r.op : 'equals', r.expected || 'n/a'],
      })),
    ),
  };
}

/**
 * Fold arbitrary script text + rendered pseudocode lines (from a vars/
 * variables block) into one commented pre_script/post_script block. Neither
 * source format's scripting API (Bruno's bru.*, or whatever a raw variables
 * list implies) translates safely to Voiden's voiden.* API automatically —
 * preserved for manual review, never left live.
 */
export function buildScriptBlock(type: 'pre_script' | 'post_script', extraLines: string[], scriptText: string | undefined): any | null {
  const scriptLines = scriptText ? scriptText.split(/\r?\n/) : [];
  const allLines = [...extraLines, ...scriptLines];
  if (!allLines.some((line) => line.trim() !== '')) return null;

  const header = [
    '// Imported from a Bruno script/vars block.',
    '// Commented out: Voiden scripts use the voiden.* API, not bru.*.',
    '// Review and adapt this logic (see the voiden-scripting skill for',
    '// voiden.variables.set()/get()), then uncomment.',
    '',
  ];
  const commented = allLines.map((line) => (line.trim() === '' ? '' : `// ${line}`));

  return {
    type,
    attrs: { uid: makeUid(), language: 'javascript', body: [...header, ...commented].join('\n') },
  };
}

export interface NormalizedMultipartField {
  name: string;
  value: string | string[];
  enabled: boolean;
  type: 'text' | 'file';
}

/**
 * Build a single multipart-table row, resolving file fields to a fileLink
 * node when the file exists on this machine.
 */
export async function buildMultipartRow(field: NormalizedMultipartField): Promise<any> {
  const keyCell = makeTextCell(field.name);

  if (field.type === 'file') {
    const src = Array.isArray(field.value) ? field.value[0] : field.value;
    if (src) {
      try {
        const result = await (window as any).electron?.files?.hash?.(src);
        if (result?.exists) {
          const filename = src.split(/[\\/]/).pop() ?? src;
          return {
            type: 'tableRow',
            attrs: { disabled: !field.enabled },
            content: [keyCell, makeTableCell([{ type: 'fileLink', attrs: { filePath: src, filename, isExternal: true } }])],
          };
        }
      } catch { /* best-effort existence check */ }
    }
    return { type: 'tableRow', attrs: { disabled: !field.enabled }, content: [keyCell, makeTextCell(src)] };
  }

  return { type: 'tableRow', attrs: { disabled: !field.enabled }, content: [keyCell, makeTextCell(String(field.value ?? ''))] };
}
