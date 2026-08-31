import { bruToJsonV2, bruToEnvJsonV2 } from '@usebruno/lang';
import type { BruJson, BruAuth, BruAssertion, BruVar, BruMultipartField } from './types';
import { getVoidenApiHelpers } from './useVoidenApiHelpers';
import { buildOAuth1Block, buildOAuth2Block, buildWebSocketRequestBlock, buildGrpcRequestBlock, normalizeGrpcCallType, buildScriptBlock } from './blockBuilders';

/**
 * Sanitize file names to be filesystem-safe — identical logic to
 * postman-import/insomnia-importer's sanitizeName, kept consistent on
 * purpose so the three importers behave the same way for shared file names.
 */
export function sanitizeName(name: string): string {
  return name
    .trim()
    .replace(/\/+/g, '-')
    .replace(/[^a-zA-Z0-9-\s]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

const makeUid = () => crypto.randomUUID();

// Bruno's own path-param syntax is identical to Postman's — :id — even though
// Bruno's params:path block already tells us the param list explicitly (see
// buildPathAndQueryBlocks below), the URL string itself still needs the
// same {id}-style rewrite for display in the url block.
function convertColonPathParams(url: string): string {
  return url.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, '{$1}');
}

function stripQueryString(url: string): string {
  const qIdx = url.indexOf('?');
  return qIdx === -1 ? url : url.slice(0, qIdx);
}

/** Build a tableCell node. `content` is the cell's paragraph content. */
function makeTableCell(content: any[]) {
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
function makeTextCell(text?: string) {
  const value = text && text.length > 0 ? text : 'n/a';
  return makeTableCell([{ type: 'text', text: value }]);
}

/**
 * Build a raw ProseMirror `table` node from arbitrary-width rows. Needed for
 * `auth` and `assertions-table` since, unlike headers/query/path tables,
 * neither is exposed as a helper on VoidenApiHelpers — every other importer
 * (see postman-import's buildAuthBlock) hand-rolls these the same way.
 */
function buildTableContent(rows: Array<{ disabled?: boolean; cells: string[] }>) {
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

/**
 * Convert Bruno's `auth { <type>: {...} }` config into a Voiden `auth` block.
 * Bruno's shape is already a plain object per type (no Postman-style
 * array-of-{key,value} pairs to unpack), so this is mostly a direct field
 * mapping. `wsse` is skipped rather than guessed at — Voiden's auth block
 * has no wsse slot (see voiden-advanced-auth's skill for the full
 * supported-type list).
 */
function buildAuthBlock(auth: BruAuth | undefined, mode: string): any | null {
  if (!auth || mode === 'none' || mode === 'inherit') return null;

  if (mode === 'oauth1' && auth.oauth1) {
    return buildOAuth1Block({
      consumerKey: auth.oauth1.consumerKey,
      consumerSecret: auth.oauth1.consumerSecret,
      accessToken: auth.oauth1.accessToken,
      accessTokenSecret: auth.oauth1.accessTokenSecret,
      signatureMethod: auth.oauth1.signatureMethod,
    });
  }
  if (mode === 'oauth2' && auth.oauth2) {
    const o = auth.oauth2;
    return buildOAuth2Block({
      grantType: o.grantType,
      authUrl: 'authorizationUrl' in o ? o.authorizationUrl : undefined,
      tokenUrl: 'accessTokenUrl' in o ? o.accessTokenUrl : undefined,
      clientId: o.clientId,
      clientSecret: 'clientSecret' in o ? o.clientSecret : undefined,
      username: 'username' in o ? o.username : undefined,
      password: 'password' in o ? o.password : undefined,
      scope: o.scope,
      callbackUrl: 'callbackUrl' in o ? o.callbackUrl : undefined,
      state: 'state' in o ? o.state : undefined,
    });
  }

  const rows: [string, string][] = [];
  let authType: string;

  switch (mode) {
    case 'basic': {
      authType = 'basic';
      if (auth.basic?.username !== undefined) rows.push(['username', auth.basic.username]);
      if (auth.basic?.password !== undefined) rows.push(['password', auth.basic.password]);
      break;
    }
    case 'bearer': {
      authType = 'bearer';
      if (auth.bearer?.token !== undefined) rows.push(['token', auth.bearer.token]);
      break;
    }
    case 'apikey': {
      authType = 'apiKey';
      if (auth.apikey?.key !== undefined) rows.push(['key', auth.apikey.key]);
      if (auth.apikey?.value !== undefined) rows.push(['value', auth.apikey.value]);
      rows.push(['add_to', auth.apikey?.placement || 'header']);
      break;
    }
    case 'digest': {
      authType = 'digest';
      if (auth.digest?.username !== undefined) rows.push(['username', auth.digest.username]);
      if (auth.digest?.password !== undefined) rows.push(['password', auth.digest.password]);
      break;
    }
    case 'awsv4': {
      authType = 'awsSignature';
      if (auth.awsv4?.accessKeyId !== undefined) rows.push(['access_key', auth.awsv4.accessKeyId]);
      if (auth.awsv4?.secretAccessKey !== undefined) rows.push(['secret_key', auth.awsv4.secretAccessKey]);
      rows.push(['region', auth.awsv4?.region || 'us-east-1']);
      rows.push(['service', auth.awsv4?.service || 'execute-api']);
      if (auth.awsv4?.sessionToken) rows.push(['session_token', auth.awsv4.sessionToken]);
      break;
    }
    case 'ntlm': {
      authType = 'ntlm';
      if (auth.ntlm?.username !== undefined) rows.push(['username', auth.ntlm.username]);
      if (auth.ntlm?.password !== undefined) rows.push(['password', auth.ntlm.password]);
      if (auth.ntlm?.domain) rows.push(['domain', auth.ntlm.domain]);
      break;
    }
    default:
      // wsse or anything else unrecognized — skip rather than guess at a shape
      return null;
  }

  if (rows.length === 0) return null;

  return {
    type: 'auth',
    attrs: { uid: makeUid(), authType },
    content: buildTableContent(rows.map(([k, v]) => ({ cells: [k, v] }))),
  };
}

// Bruno assert `name` values are always "res.<field>" — assertions against
// the request itself (req.*) aren't expressible in Voiden's response-only
// assertions-table, so those (and anything not "res.*") are imported
// disabled with the raw expression preserved rather than dropped.
const BRU_ASSERT_OP_MAP: Record<string, string> = {
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
const BRU_ASSERT_NO_EXPECTED = new Set(['isDefined', 'isUndefined', 'isEmpty', 'isNotEmpty', 'isTruthy', 'isFalsy']);

function parseBruAssertValue(raw: string): { op: string; expected: string | null } {
  const trimmed = raw.trim();
  const spaceIdx = trimmed.indexOf(' ');
  if (spaceIdx === -1) return { op: trimmed, expected: null };
  return { op: trimmed.slice(0, spaceIdx), expected: trimmed.slice(spaceIdx + 1).trim() };
}

/**
 * Convert Bruno's declarative `assert {}` block into a live `assertions-table`
 * block (simple-assertions plugin). Unlike script:pre-request/post-response,
 * this is a structured name/value table, not arbitrary JS, so it's safe to
 * translate directly rather than only preserving it as a comment — the same
 * reasoning that makes headers/query/path tables safe to convert outright.
 * An entry using an operator or target this map doesn't cover is still
 * imported (nothing is silently dropped) but disabled, with the original
 * Bruno expression kept in the description column for manual translation.
 */
function buildAssertionsTable(assertions: BruAssertion[] | undefined): any | null {
  if (!assertions || assertions.length === 0) return null;

  const rows = assertions.map((a) => {
    const isResponseField = a.name.startsWith('res.');
    const field = isResponseField ? a.name.slice(4) : a.name;
    const { op, expected } = parseBruAssertValue(a.value);
    const mappedOp = BRU_ASSERT_OP_MAP[op];
    const description = `Bruno: ${a.name}: ${a.value}`;

    if (isResponseField && mappedOp) {
      return {
        disabled: !a.enabled,
        cells: [description, field, mappedOp, BRU_ASSERT_NO_EXPECTED.has(op) ? 'n/a' : (expected || 'n/a')],
      };
    }
    // Unsupported operator or a req.* target — keep visible but disabled
    return { disabled: true, cells: [description, field, 'equals', expected || 'n/a'] };
  });

  return {
    type: 'assertions-table',
    attrs: { uid: makeUid() },
    content: buildTableContent(rows),
  };
}

/**
 * Bruno's script:pre-request/post-response blocks use the bru.* API, and
 * vars:pre-request/post-response are Bruno-native variable assignments.
 * Renders vars as bru.setVar(...) pseudocode (so it goes through the same
 * translation as a real bru.setVar call) and delegates to blockBuilders.ts's
 * shared buildScriptBlock — the one place this logic lives, used by both
 * this classic .bru path and the OpenCollection path. (This file used to
 * have its own separate, never-updated copy of this function — a real bug
 * caught by end-to-end testing: it kept every classic-.bru-path script
 * fully commented even after scriptTranslator.ts shipped, since only the
 * shared copy had been wired up.)
 */
function buildScriptBlockFromVars(type: 'pre_script' | 'post_script', script: string | undefined, vars: BruVar[] | undefined): any | null {
  const varLines = (vars ?? [])
    .filter((v) => v.enabled !== false)
    .map((v) => `bru.setVar("${v.name}", ${v.value});`);
  return buildScriptBlock(type, varLines, script);
}

/**
 * Build a single multipart-table row, resolving file fields to a fileLink
 * node when the file exists on this machine — same approach as
 * postman-import's buildMultipartRow, since Bruno's file field paths almost
 * always point at the exporting user's filesystem too.
 */
async function buildMultipartRow(field: BruMultipartField): Promise<any> {
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

function detectGraphqlOperationType(query: string): 'query' | 'mutation' | 'subscription' {
  const match = query.match(/\b(query|mutation|subscription)\b/);
  return (match?.[1] as 'query' | 'mutation' | 'subscription') || 'query';
}

/**
 * Convert a parsed Bruno request (bruToJsonV2 output) into a Voiden .void
 * file's content. Block order follows the base skill's documented canonical
 * order — method/url → auth → headers-table → query-table → path-table →
 * body → assertions → scripts — rather than postman-import's slightly
 * different historical ordering.
 */
export const convertBruRequestToVoidenSchema = async (data: BruJson): Promise<string> => {
  try {
    const helpers = getVoidenApiHelpers();

    // gRPC/WS requests produce a wholly different block (socket-request,
    // not request+headers+body) — see buildGrpcRequestBlock/
    // buildWebSocketRequestBlock in blockBuilders.ts for exactly what does
    // and doesn't carry over (metadata and a stored request message have no
    // Voiden target today).
    if (data.meta.type === 'grpc' && data.grpc) {
      const url = data.grpc.url ?? '';
      const block = buildGrpcRequestBlock(url, data.grpc.protoPath, data.grpc.method, normalizeGrpcCallType(data.grpc.methodType));
      let content = helpers.convertBlocksToVoidFile(data.meta.name, [block]);
      if (data.docs) content += `\n${data.docs}\n`;
      return content;
    }
    if (data.meta.type === 'ws' && data.ws) {
      const url = data.ws.url ?? '';
      const block = buildWebSocketRequestBlock(url);
      let content = helpers.convertBlocksToVoidFile(data.meta.name, [block]);
      if (data.docs) content += `\n${data.docs}\n`;
      return content;
    }

    const blocks: any[] = [];

    const http = data.http!;
    const bodyMode = http.body;
    const body = data.body ?? {};
    const isGraphQL = bodyMode === 'graphql' && !!body.graphql?.query;
    const url = convertColonPathParams(stripQueryString(http.url ?? ''));

    // 1. Request block (method + url) — skipped for GraphQL, same as postman-import
    if (!isGraphQL) {
      blocks.push({
        type: 'request',
        content: [
          helpers.createMethodNode((http.method || 'get').toUpperCase()),
          helpers.createUrlNode(url),
        ],
      });
    }

    // 2. Auth
    const authBlock = buildAuthBlock(data.auth, http.auth);
    if (authBlock) blocks.push(authBlock);

    // 3. Headers
    const activeHeaders = (data.headers ?? []).filter((h) => h.enabled !== false);
    if (activeHeaders.length > 0) {
      blocks.push(helpers.createHeadersTableNode(activeHeaders.map((h) => [h.name, h.value] as [string, string])));
    }

    // 4. Path parameters — Bruno's params:path already gives the definitive
    // list, unlike Postman/Insomnia where it has to be inferred from :name
    // segments in the URL.
    const pathParams = (data.params ?? []).filter((p) => p.type === 'path');
    if (pathParams.length > 0) {
      blocks.push(helpers.createPathParamsTableNode(pathParams.map((p) => [p.name, p.value] as [string, string])));
    }

    // 5. Query parameters
    const queryParams = (data.params ?? []).filter((p) => p.type === 'query' && p.enabled !== false);
    if (queryParams.length > 0) {
      blocks.push(helpers.createQueryTableNode(queryParams.map((p) => [p.name, p.value] as [string, string])));
    }

    // 6. Body
    if (bodyMode === 'json' && body.json) {
      blocks.push(helpers.createJsonBodyNode(body.json, 'json'));
    } else if (bodyMode === 'xml' && body.xml) {
      blocks.push(helpers.createXMLBodyNode(body.xml, 'xml'));
    } else if (bodyMode === 'text' && body.text) {
      blocks.push(helpers.createJsonBodyNode(body.text, 'text'));
    } else if (bodyMode === 'sparql' && body.sparql) {
      // No native SPARQL block in Voiden — best-effort as plain text (see skill.md caveats)
      blocks.push(helpers.createJsonBodyNode(body.sparql, 'text'));
    } else if (bodyMode === 'formUrlEncoded' && body.formUrlEncoded && body.formUrlEncoded.length > 0) {
      const active = body.formUrlEncoded.filter((f) => f.enabled !== false);
      if (active.length > 0) {
        blocks.push(helpers.createUrlTableNode(active.map((f) => [f.name, f.value] as [string, string])));
      }
    } else if (bodyMode === 'multipartForm' && body.multipartForm && body.multipartForm.length > 0) {
      const active = body.multipartForm.filter((f) => f.enabled !== false);
      if (active.length > 0) {
        if (active.some((f) => f.type === 'file')) {
          const rows = await Promise.all(active.map(buildMultipartRow));
          blocks.push({ type: 'multipart-table', attrs: { uid: makeUid() }, content: [{ type: 'table', content: rows }] });
        } else {
          blocks.push(helpers.createMultipartTableNode(active.map((f) => [f.name, String(f.value ?? '')] as [string, string])));
        }
      }
    } else if (bodyMode === 'file' && body.file && body.file.length > 0) {
      blocks.push({ type: 'restFile', attrs: { uid: makeUid(), fieldName: 'file' } });
    } else if (isGraphQL) {
      // GraphQL body — container format matching postman-import's handling:
      // gqlquery > [gqlurl, gqlbody]. The URL lives in gqlurl, not a request block.
      const query = body.graphql!.query.replace(/\r\n/g, '\n');
      blocks.push({
        type: 'gqlquery',
        attrs: { uid: makeUid() },
        content: [
          { type: 'gqlurl', attrs: { uid: makeUid() }, content: [{ type: 'text', text: url }] },
          {
            type: 'gqlbody',
            attrs: {
              uid: makeUid(),
              body: query,
              operationType: detectGraphqlOperationType(query),
              schemaUrl: null,
              schemaFileName: null,
              schemaFilePath: null,
            },
          },
        ],
      });
      if (body.graphql!.variables) {
        blocks.push({ type: 'gqlvariables', attrs: { uid: makeUid(), body: body.graphql!.variables.replace(/\r\n/g, '\n') } });
      }
    }

    // 7. Assertions — declarative assert{} block, safe to map directly (see buildAssertionsTable)
    const assertionsBlock = buildAssertionsTable(data.assertions);
    if (assertionsBlock) blocks.push(assertionsBlock);

    // 8. Scripts + vars — commented out for manual review (see buildScriptBlock)
    const preScriptBlock = buildScriptBlockFromVars('pre_script', data.script?.req, data.vars?.req);
    if (preScriptBlock) blocks.push(preScriptBlock);
    const postScriptBlock = buildScriptBlockFromVars('post_script', data.script?.res, data.vars?.res);
    if (postScriptBlock) blocks.push(postScriptBlock);

    return helpers.convertBlocksToVoidFile(data.meta.name, blocks);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    const locator = data.http ? `${data.http.method} ${data.http.url}` : data.grpc?.url ?? data.ws?.url ?? 'unknown target';
    throw new Error(`Failed to convert "${data.meta?.name ?? 'request'}" (${locator}): ${detail}`);
  }
};

/**
 * Parse raw .bru text via @usebruno/lang and validate it's a single request
 * of a supported type (http, graphql — which reuses the http block, grpc,
 * or ws), not a collection-level file like bruno.json/folder.bru (which
 * never produce a `meta` block at all).
 */
export function parseBruContent(raw: string): BruJson {
  const data = bruToJsonV2(raw) as BruJson;
  if (!data?.meta) {
    throw new Error('Unrecognized Bruno request format (expected a .bru file with a meta{} block)');
  }
  const type = data.meta.type;
  if (type === 'http' || type === 'graphql') {
    if (!data.http) throw new Error(`meta.type is "${type}" but no HTTP method block was found`);
  } else if (type === 'grpc') {
    if (!data.grpc) throw new Error('meta.type is "grpc" but no grpc{} block was found');
  } else if (type === 'ws') {
    if (!data.ws) throw new Error('meta.type is "ws" but no ws{} block was found');
  } else {
    throw new Error(`Unsupported Bruno request type "${type}" — only http, graphql, grpc, and ws requests are supported today`);
  }
  return data;
}

export const importBruRequest = async (
  content: string,
  activeProject: string,
): Promise<{ success: true; path: string }> => {
  if (!activeProject) {
    throw new Error('No active project found');
  }

  const data = parseBruContent(content);
  let fileContent = await convertBruRequestToVoidenSchema(data);
  if (data.docs) {
    fileContent += `\n${data.docs}\n`;
  }

  const fileName = sanitizeName(data.meta.name || 'Bruno Request');
  const result = await (window as any).electron?.files?.createVoid(activeProject, fileName);
  if (!result?.path) {
    throw new Error('Failed to create .void file');
  }
  await (window as any).electron?.files?.write(result.path, fileContent);

  return { success: true, path: result.path };
};

// ---------------------------------------------------------------------------
// Environment files (environments/<name>.bru)
// ---------------------------------------------------------------------------

interface BruEnvVariable {
  name: string;
  value: string;
  enabled: boolean;
  secret: boolean;
}

/**
 * Parse a Bruno environment file via @usebruno/lang's bruToEnvJsonV2 (a
 * different function from bruToJsonV2 — request files and environment files
 * use different grammars). Unlike a request file, there's no name field in
 * the content itself; the environment's name is its filename, so callers
 * must supply it separately.
 */
export function parseBruEnvironment(raw: string): BruEnvVariable[] {
  const result = bruToEnvJsonV2(raw) as { variables?: BruEnvVariable[] };
  if (!Array.isArray(result?.variables)) {
    throw new Error('Unrecognized Bruno environment format (expected vars{}/vars:secret[] blocks)');
  }
  return result.variables;
}

/**
 * Import a Bruno environment via Voiden's own `electron.env.extendEnvs` IPC
 * (the same one postman-import and insomnia-importer's environment handling
 * both use) — it resolves the active project/profile, creates or extends
 * the named environment node, and merges into the existing env-public.yaml
 * tree without disturbing other environments already in the project. See
 * the base voiden skill's "Environment Variables" section for the YAML
 * shape this writes into.
 *
 * Disabled vars are skipped, not imported disabled — Voiden's env YAML has
 * no per-variable enabled/disabled flag to preserve that state in. Secret
 * vars (Bruno's `vars:secret`, which carry no value — just a name to fill
 * in locally) go through the same call as everything else: `extendEnvs` has
 * no separate "private file" target, and Bruno's secret entries never carry
 * a real value to begin with, so there's nothing sensitive to protect by
 * routing them differently.
 */
export const importBruEnvironment = async (
  content: string,
  envName: string,
  activeProject: string,
): Promise<{ success: true; imported: number }> => {
  if (!activeProject) {
    throw new Error('No active project found');
  }

  const variables = parseBruEnvironment(content)
    .filter((v) => v.enabled !== false)
    .map((v) => ({ key: v.name, value: v.value ?? '' }));

  if (variables.length > 0) {
    await (window as any).electron?.env?.extendEnvs(`${envName} environment`, variables, envName);
  }

  return { success: true, imported: variables.length };
};
