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
export function buildAuthBlockFromRows(authType: string, rows: [string, string][], extraAttrs?: Record<string, unknown>): any | null {
  if (rows.length === 0) return null;
  return {
    type: 'auth',
    attrs: { uid: makeUid(), authType, ...extraAttrs },
    content: buildTableContent(rows.map(([k, v]) => ({ cells: [k, v] }))),
  };
}

/**
 * Build a Voiden `oauth1` auth block. Voiden's documented oauth1 shape
 * (voiden-advanced-auth's skill.md) only has these 5 fields — Bruno's own
 * oauth1 config carries more (callback_url, verifier, realm, private_key,
 * ...) but Voiden's auth block has nowhere to put them, so they're dropped
 * rather than invented a home for.
 */
export function buildOAuth1Block(fields: { consumerKey?: string; consumerSecret?: string; accessToken?: string; accessTokenSecret?: string; signatureMethod?: string }): any | null {
  const rows: [string, string][] = [];
  if (fields.consumerKey) rows.push(['consumer_key', fields.consumerKey]);
  if (fields.consumerSecret) rows.push(['consumer_secret', fields.consumerSecret]);
  if (fields.accessToken) rows.push(['access_token', fields.accessToken]);
  if (fields.accessTokenSecret) rows.push(['token_secret', fields.accessTokenSecret]);
  rows.push(['signature_method', fields.signatureMethod || 'HMAC-SHA1']);
  return buildAuthBlockFromRows('oauth1', rows);
}

// Voiden's oauth2 auth block needs both a `table` (rows shown in the editor)
// AND an `oauth2Config` JSON-string attr carrying the same values keyed by
// grantType-specific field names (see voiden-advanced-auth's skill.md) — the
// two are redundant by design, so every field goes into both.
export interface NormalizedOAuth2Fields {
  grantType: 'password' | 'authorization_code' | 'client_credentials' | 'implicit';
  authUrl?: string;
  tokenUrl?: string;
  clientId?: string;
  clientSecret?: string;
  username?: string;
  password?: string;
  scope?: string;
  callbackUrl?: string;
  state?: string;
  addTokenTo?: string; // "header" | "query" — Voiden's default is "header"
  headerPrefix?: string; // Voiden's default is "Bearer"
  autoRefresh?: boolean;
}

export function buildOAuth2Block(f: NormalizedOAuth2Fields): any | null {
  const rows: [string, string][] = [];
  const config: Record<string, unknown> = { grantType: f.grantType };

  if (f.grantType === 'authorization_code' || f.grantType === 'implicit') {
    if (f.authUrl) rows.push(['auth_url', f.authUrl]);
    config.authUrl = f.authUrl || '';
  }
  if (f.grantType !== 'implicit') {
    if (f.tokenUrl) rows.push(['token_url', f.tokenUrl]);
    config.tokenUrl = f.tokenUrl || '';
  }
  if (f.clientId) rows.push(['client_id', f.clientId]);
  config.clientId = f.clientId || '';
  if (f.grantType !== 'implicit') {
    if (f.clientSecret) rows.push(['client_secret', f.clientSecret]);
    config.clientSecret = f.clientSecret || '';
  }
  if (f.grantType === 'password') {
    if (f.username) rows.push(['username', f.username]);
    if (f.password) rows.push(['password', f.password]);
  }
  if (f.scope) rows.push(['scope', f.scope]);
  config.scope = f.scope || '';
  if (f.grantType === 'authorization_code' || f.grantType === 'implicit') {
    if (f.callbackUrl) rows.push(['callback_url', f.callbackUrl]);
    config.callbackUrl = f.callbackUrl || '';
    if (f.state) rows.push(['state', f.state]);
  }
  config.addTokenTo = f.addTokenTo || 'header';
  config.headerPrefix = f.headerPrefix || 'Bearer';
  if (f.grantType === 'authorization_code') config.autoRefresh = f.autoRefresh ?? false;

  return buildAuthBlockFromRows('oauth2', rows, { oauth2Config: JSON.stringify(config) });
}

// gRPC streaming-type spellings differ across sources — Voiden's socket
// block (`proto.callType`) uses underscored names; OpenCollection's
// GrpcMethodType and (unconfirmed) classic .bru's `methodType` use hyphens.
// Normalize defensively rather than assume one spelling.
export function normalizeGrpcCallType(methodType: string | undefined): string {
  const norm = (methodType || 'unary').replace(/-/g, '_');
  const valid = new Set(['unary', 'client_streaming', 'server_streaming', 'bidirectional_streaming']);
  if (valid.has(norm)) return norm;
  if (norm === 'bidi_streaming') return 'bidirectional_streaming';
  return 'unary';
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

/**
 * Build a WebSocket `socket-request` block (smethod + surl only) — see
 * voiden-sockets-grpcs's skill.md. Voiden's `messages-node` is a live,
 * UI-managed connection viewer with no field for a pre-authored message to
 * send, so a source format's stored message content (Bruno's `body:ws`,
 * OpenCollection's `websocket.message`) has nowhere to go — callers should
 * surface that gap rather than silently drop it without explanation.
 */
export function buildWebSocketRequestBlock(url: string): any {
  const useTls = url.startsWith('wss://');
  const method = useTls ? 'WSS' : 'WS';
  return {
    type: 'socket-request',
    attrs: { uid: makeUid() },
    content: [
      { type: 'smethod', attrs: { uid: makeUid(), method, visible: true }, content: method },
      { type: 'surl', attrs: { uid: makeUid() }, content: url },
    ],
  };
}

/**
 * Build a gRPC `socket-request` block (smethod + surl + proto). `services`
 * is deliberately left `[]` — the app populates it itself the first time it
 * reads the file at `filePath` (see voiden-sockets-grpcs's skill.md); a
 * source format's stored request message/metadata (Bruno's `body:grpc`/
 * `metadata{}`, OpenCollection's `grpc.message`/`grpc.metadata`) has no
 * Voiden field to land in either — headless gRPC execution only verifies
 * the channel connects, it doesn't send a request body.
 */
export function buildGrpcRequestBlock(url: string, protoPath: string | undefined, selectedMethod: string | undefined, callType: string): any {
  const useTls = url.startsWith('grpcs://');
  const method = useTls ? 'GRPCS' : 'GRPC';
  const fileName = protoPath ? protoPath.split(/[\\/]/).pop() : undefined;
  // Service and method are usually combined as "pkg.Service/Method" — split
  // if possible so `selectedService`/`selectedMethod` at least start
  // populated instead of empty; the app re-derives the real tree from the
  // proto file itself once it can read it.
  let selectedService: string | undefined;
  let methodOnly = selectedMethod;
  if (selectedMethod?.includes('/')) {
    const [svc, m] = selectedMethod.split('/');
    selectedService = svc;
    methodOnly = m;
  }
  return {
    type: 'socket-request',
    attrs: { uid: makeUid() },
    content: [
      { type: 'smethod', attrs: { uid: makeUid(), method, visible: true }, content: method },
      { type: 'surl', attrs: { uid: makeUid() }, content: url },
      {
        type: 'proto',
        attrs: {
          uid: makeUid(),
          fileName: fileName || '',
          filePath: protoPath || '',
          packageName: '',
          services: [],
          selectedService: selectedService || '',
          selectedMethod: methodOnly || '',
          callType,
        },
      },
    ],
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
