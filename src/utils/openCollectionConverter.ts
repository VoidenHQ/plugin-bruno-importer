import yaml from 'js-yaml';
import type { OpenCollection, OcItem, OcHttpRequest, OcGraphQLRequest, OcGrpcRequest, OcWebSocketRequest, OcAuth, OcAssertion, OcScript, OcVariable, OcMultipartFormEntry } from './opencollectionTypes';
import { isOcFolder, isOcHttpRequest, isOcGraphQLRequest, isOcGrpcRequest, isOcWebSocketRequest, looksLikeOpenCollection, looksLikeStandaloneOcItem } from './opencollectionTypes';
import { getVoidenApiHelpers } from './useVoidenApiHelpers';
import {
  makeUid,
  buildAuthBlockFromRows,
  buildOAuth1Block,
  buildOAuth2Block,
  buildAssertionsTableFromRows,
  buildScriptBlock,
  buildMultipartRow,
  buildWebSocketRequestBlock,
  buildGrpcRequestBlock,
  normalizeGrpcCallType,
  ASSERT_OP_MAP,
  ASSERT_NO_EXPECTED,
  type NormalizedAssertionRow,
} from './blockBuilders';

export { looksLikeOpenCollection, looksLikeStandaloneOcItem };

/**
 * Sanitize file/folder names to be filesystem-safe — identical logic to the
 * other Voiden importers.
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

function convertColonPathParams(url: string): string {
  return url.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, '{$1}');
}

function stripQueryString(url: string): string {
  const qIdx = url.indexOf('?');
  return qIdx === -1 ? url : url.slice(0, qIdx);
}

/**
 * Convert OpenCollection's `auth` field into a Voiden `auth` block.
 * `'inherit'` maps straight to Voiden's own `inherit` authType (it fills the
 * same slot per the base skill's singleton-auth rule), `'none'`/undefined
 * produce no block at all. `wsse` is skipped — Voiden's auth block has no
 * wsse slot.
 */
function buildAuthFromOc(auth: OcAuth | undefined): any | null {
  if (!auth || auth === 'none') return null;
  if (auth === 'inherit') {
    return { type: 'auth', attrs: { uid: makeUid(), authType: 'inherit' }, content: [] };
  }

  if (auth.type === 'oauth1') {
    return buildOAuth1Block({
      consumerKey: auth.consumerKey,
      consumerSecret: auth.consumerSecret,
      accessToken: auth.accessToken,
      accessTokenSecret: auth.accessTokenSecret,
      signatureMethod: auth.signatureMethod,
    });
  }
  if (auth.type === 'oauth2') {
    const creds = 'credentials' in auth ? auth.credentials : undefined;
    if (auth.flow === 'resource_owner_password_credentials') {
      return buildOAuth2Block({
        grantType: 'password',
        tokenUrl: auth.accessTokenUrl,
        clientId: creds?.clientId,
        clientSecret: (creds as OcOAuth2CredentialsWithSecret | undefined)?.clientSecret,
        username: auth.resourceOwner?.username,
        password: auth.resourceOwner?.password,
        scope: auth.scope,
      });
    }
    if (auth.flow === 'authorization_code') {
      return buildOAuth2Block({
        grantType: 'authorization_code',
        authUrl: auth.authorizationUrl,
        tokenUrl: auth.accessTokenUrl,
        clientId: creds?.clientId,
        clientSecret: (creds as OcOAuth2CredentialsWithSecret | undefined)?.clientSecret,
        scope: auth.scope,
        callbackUrl: auth.callbackUrl,
        state: auth.state,
      });
    }
    if (auth.flow === 'client_credentials') {
      return buildOAuth2Block({
        grantType: 'client_credentials',
        tokenUrl: auth.accessTokenUrl,
        clientId: creds?.clientId,
        clientSecret: (creds as OcOAuth2CredentialsWithSecret | undefined)?.clientSecret,
        scope: auth.scope,
      });
    }
    if (auth.flow === 'implicit') {
      return buildOAuth2Block({
        grantType: 'implicit',
        authUrl: auth.authorizationUrl,
        clientId: auth.credentials?.clientId,
        scope: auth.scope,
        callbackUrl: auth.callbackUrl,
        state: auth.state,
      });
    }
    return null;
  }

  const rows: [string, string][] = [];
  switch (auth.type) {
    case 'basic':
      if (auth.username !== undefined) rows.push(['username', auth.username]);
      if (auth.password !== undefined) rows.push(['password', auth.password]);
      return buildAuthBlockFromRows('basic', rows);
    case 'bearer':
      if (auth.token !== undefined) rows.push(['token', auth.token]);
      return buildAuthBlockFromRows('bearer', rows);
    case 'apikey':
      if (auth.key !== undefined) rows.push(['key', auth.key]);
      if (auth.value !== undefined) rows.push(['value', auth.value]);
      rows.push(['add_to', auth.placement || 'header']);
      return buildAuthBlockFromRows('apiKey', rows);
    case 'digest':
      if (auth.username !== undefined) rows.push(['username', auth.username]);
      if (auth.password !== undefined) rows.push(['password', auth.password]);
      return buildAuthBlockFromRows('digest', rows);
    case 'awsv4':
      if (auth.accessKeyId !== undefined) rows.push(['access_key', auth.accessKeyId]);
      if (auth.secretAccessKey !== undefined) rows.push(['secret_key', auth.secretAccessKey]);
      rows.push(['region', auth.region || 'us-east-1']);
      rows.push(['service', auth.service || 'execute-api']);
      if (auth.sessionToken) rows.push(['session_token', auth.sessionToken]);
      return buildAuthBlockFromRows('awsSignature', rows);
    case 'ntlm':
      if (auth.username !== undefined) rows.push(['username', auth.username]);
      if (auth.password !== undefined) rows.push(['password', auth.password]);
      if (auth.domain) rows.push(['domain', auth.domain]);
      return buildAuthBlockFromRows('ntlm', rows);
    default:
      // wsse or anything else unrecognized — skip rather than guess at a shape
      return null;
  }
}
// client_credentials/authorization_code flows carry clientSecret; implicit doesn't.
type OcOAuth2CredentialsWithSecret = { clientId?: string; clientSecret?: string };

// OpenCollection's assertion `expression` isn't confirmed (by an actual
// populated example) to always carry a "res."-style prefix the way the
// classic .bru `assert{}` block's `name` field does — this best-effort
// mapping strips a leading "res." when present and otherwise uses the
// expression as-is, flagging anything that doesn't map cleanly as disabled
// rather than silently guessing wrong. See this file's skill.md note.
function normalizeOcAssertion(a: OcAssertion): NormalizedAssertionRow {
  const isResponseField = a.expression.startsWith('res.');
  const field = isResponseField ? a.expression.slice(4) : a.expression;
  const mappedOp = ASSERT_OP_MAP[a.operator];
  return {
    description: `Bruno: ${a.expression}: ${a.operator}${a.value ? ' ' + a.value : ''}`,
    field,
    op: mappedOp,
    expected: ASSERT_NO_EXPECTED.has(a.operator) ? null : (a.value ?? null),
    disabled: !!a.disabled,
    supported: isResponseField && !!mappedOp,
  };
}

function buildScriptsFromOc(scripts: OcScript[] | undefined, variables: OcVariable[] | undefined): { pre: any | null; post: any | null } {
  const before = (scripts ?? []).filter((s) => s.type === 'before-request').map((s) => s.code);
  const after = (scripts ?? []).filter((s) => s.type === 'after-response').map((s) => s.code);
  const tests = (scripts ?? []).filter((s) => s.type === 'tests').map((s) => `// --- tests ---\n${s.code}`);
  const varLines = (variables ?? [])
    .filter((v) => v.disabled !== true)
    .map((v) => `bru.setVar(${JSON.stringify(v.name)}, ${JSON.stringify(v.value ?? '')});`);

  const pre = buildScriptBlock('pre_script', varLines, before.join('\n\n') || undefined);
  const post = buildScriptBlock('post_script', [], [...after, ...tests].join('\n\n') || undefined);
  return { pre, post };
}

async function buildMultipartTable(entries: OcMultipartFormEntry[], helpers: ReturnType<typeof getVoidenApiHelpers>): Promise<any> {
  const active = entries.filter((f) => f.disabled !== true);
  if (active.some((f) => f.type === 'file')) {
    const rows = await Promise.all(
      active.map((f) => buildMultipartRow({ name: f.name, value: f.value, enabled: true, type: f.type })),
    );
    return { type: 'multipart-table', attrs: { uid: makeUid() }, content: [{ type: 'table', content: rows }] };
  }
  return helpers.createMultipartTableNode(active.map((f) => [f.name, String(f.value ?? '')] as [string, string]));
}

function detectGraphqlOperationType(query: string): 'query' | 'mutation' | 'subscription' {
  const match = query.match(/\b(query|mutation|subscription)\b/);
  return (match?.[1] as 'query' | 'mutation' | 'subscription') || 'query';
}

/**
 * Convert one OpenCollection `http`-type item into a Voiden .void file's
 * content. Block order matches the classic .bru path's skill.md-documented
 * canonical order.
 */
export const convertOcHttpRequestToVoidenSchema = async (item: OcHttpRequest): Promise<string> => {
  const name = item.info?.name || 'Bruno Request';
  try {
    const helpers = getVoidenApiHelpers();
    const blocks: any[] = [];
    const http = item.http;
    const url = convertColonPathParams(stripQueryString(http.url ?? ''));

    // 1. Request block
    blocks.push({
      type: 'request',
      content: [
        helpers.createMethodNode((http.method || 'GET').toUpperCase()),
        helpers.createUrlNode(url),
      ],
    });

    // 2. Auth
    const authBlock = buildAuthFromOc(http.auth);
    if (authBlock) blocks.push(authBlock);

    // 3. Headers
    const activeHeaders = (http.headers ?? []).filter((h) => h.disabled !== true);
    if (activeHeaders.length > 0) {
      blocks.push(helpers.createHeadersTableNode(activeHeaders.map((h) => [h.name, h.value] as [string, string])));
    }

    // 4. Path parameters
    const pathParams = (http.params ?? []).filter((p) => p.type === 'path');
    if (pathParams.length > 0) {
      blocks.push(helpers.createPathParamsTableNode(pathParams.map((p) => [p.name, p.value] as [string, string])));
    }

    // 5. Query parameters
    const queryParams = (http.params ?? []).filter((p) => p.type === 'query' && p.disabled !== true);
    if (queryParams.length > 0) {
      blocks.push(helpers.createQueryTableNode(queryParams.map((p) => [p.name, p.value] as [string, string])));
    }

    // 6. Body
    const body = http.body;
    if (body) {
      if (body.type === 'json') {
        blocks.push(helpers.createJsonBodyNode(body.data, 'json'));
      } else if (body.type === 'xml') {
        blocks.push(helpers.createXMLBodyNode(body.data, 'xml'));
      } else if (body.type === 'text' || body.type === 'sparql') {
        // No native SPARQL block — best-effort as plain text
        blocks.push(helpers.createJsonBodyNode(body.data, 'text'));
      } else if (body.type === 'form-urlencoded') {
        const active = body.data.filter((f) => f.disabled !== true);
        if (active.length > 0) {
          blocks.push(helpers.createUrlTableNode(active.map((f) => [f.name, f.value] as [string, string])));
        }
      } else if (body.type === 'multipart-form') {
        if (body.data.length > 0) blocks.push(await buildMultipartTable(body.data, helpers));
      } else if (body.type === 'file') {
        blocks.push({ type: 'restFile', attrs: { uid: makeUid(), fieldName: 'file' } });
      }
    }

    // 7. Assertions — declarative, safe to map directly (see normalizeOcAssertion)
    const assertRows = (item.runtime?.assertions ?? []).map(normalizeOcAssertion);
    const assertionsBlock = buildAssertionsTableFromRows(assertRows);
    if (assertionsBlock) blocks.push(assertionsBlock);

    // 8. Scripts + variables — commented out for manual review
    const { pre, post } = buildScriptsFromOc(item.runtime?.scripts, item.runtime?.variables);
    if (pre) blocks.push(pre);
    if (post) blocks.push(post);

    let content = helpers.convertBlocksToVoidFile(name, blocks);
    if (item.docs) content += `\n${item.docs}\n`;
    return content;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to convert "${name}": ${detail}`);
  }
};

/**
 * Convert an OpenCollection `graphql`-type item — same gqlquery/gqlvariables
 * container shape as the classic .bru path's GraphQL handling. The request
 * block is omitted; the endpoint lives in gqlurl instead.
 */
export const convertOcGraphQLRequestToVoidenSchema = async (item: OcGraphQLRequest): Promise<string> => {
  const name = item.info?.name || 'Bruno Request';
  try {
    const helpers = getVoidenApiHelpers();
    const blocks: any[] = [];
    const gql = item.graphql;
    const url = convertColonPathParams(stripQueryString(gql.url ?? ''));

    const authBlock = buildAuthFromOc(gql.auth);
    if (authBlock) blocks.push(authBlock);

    const activeHeaders = (gql.headers ?? []).filter((h) => h.disabled !== true);
    if (activeHeaders.length > 0) {
      blocks.push(helpers.createHeadersTableNode(activeHeaders.map((h) => [h.name, h.value] as [string, string])));
    }

    if (gql.body?.query) {
      const query = gql.body.query.replace(/\r\n/g, '\n');
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
      if (gql.body.variables) {
        blocks.push({ type: 'gqlvariables', attrs: { uid: makeUid(), body: gql.body.variables.replace(/\r\n/g, '\n') } });
      }
    }

    const assertRows = (item.runtime?.assertions ?? []).map(normalizeOcAssertion);
    const assertionsBlock = buildAssertionsTableFromRows(assertRows);
    if (assertionsBlock) blocks.push(assertionsBlock);

    const { pre, post } = buildScriptsFromOc(item.runtime?.scripts, item.runtime?.variables);
    if (pre) blocks.push(pre);
    if (post) blocks.push(post);

    let content = helpers.convertBlocksToVoidFile(name, blocks);
    if (item.docs) content += `\n${item.docs}\n`;
    return content;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to convert "${name}": ${detail}`);
  }
};

/**
 * Convert an OpenCollection `grpc`-type item into a socket-request block.
 * Only what the app can actually use is carried over — url, proto file
 * path, and streaming type. `metadata` and a stored request `message` have
 * no Voiden field to land in (see buildGrpcRequestBlock in
 * blockBuilders.ts) and are silently omitted, not guessed at.
 */
export const convertOcGrpcRequestToVoidenSchema = async (item: OcGrpcRequest): Promise<string> => {
  const name = item.info?.name || 'Bruno Request';
  try {
    const helpers = getVoidenApiHelpers();
    const grpc = item.grpc;
    const block = buildGrpcRequestBlock(grpc.url ?? '', grpc.protoFilePath, grpc.method, normalizeGrpcCallType(grpc.methodType));
    let content = helpers.convertBlocksToVoidFile(name, [block]);
    if (item.docs) content += `\n${item.docs}\n`;
    return content;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to convert "${name}": ${detail}`);
  }
};

/**
 * Convert an OpenCollection `websocket`-type item into a socket-request
 * block (smethod + surl only). A stored `message` payload has no Voiden
 * field — `messages-node` is a live, UI-managed connection viewer, not a
 * place to pre-author a message to send (see buildWebSocketRequestBlock).
 */
export const convertOcWebSocketRequestToVoidenSchema = async (item: OcWebSocketRequest): Promise<string> => {
  const name = item.info?.name || 'Bruno Request';
  try {
    const helpers = getVoidenApiHelpers();
    const block = buildWebSocketRequestBlock(item.websocket.url ?? '');
    let content = helpers.convertBlocksToVoidFile(name, [block]);
    if (item.docs) content += `\n${item.docs}\n`;
    return content;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to convert "${name}": ${detail}`);
  }
};

export function parseOpenCollection(raw: string): OpenCollection {
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = yaml.load(raw);
  }
  if (!parsed || typeof parsed.opencollection !== 'string') {
    throw new Error('Unrecognized OpenCollection format (expected a top-level "opencollection" version key)');
  }
  return parsed as OpenCollection;
}

/** Dispatches to the right converter based on the item's actual type, or null for unsupported item types. */
function convertOcItem(item: OcItem): Promise<string> | null {
  if (isOcHttpRequest(item)) return convertOcHttpRequestToVoidenSchema(item);
  if (isOcGraphQLRequest(item)) return convertOcGraphQLRequestToVoidenSchema(item);
  if (isOcGrpcRequest(item)) return convertOcGrpcRequestToVoidenSchema(item);
  if (isOcWebSocketRequest(item)) return convertOcWebSocketRequestToVoidenSchema(item);
  return null; // app/script items — out of scope
}

function isConvertibleRequest(item: OcItem): boolean {
  return isOcHttpRequest(item) || isOcGraphQLRequest(item) || isOcGrpcRequest(item) || isOcWebSocketRequest(item);
}

function countOcRequests(items: OcItem[]): number {
  let count = 0;
  for (const item of items) {
    if (isOcFolder(item)) count += countOcRequests(item.items ?? []);
    else if (isConvertibleRequest(item)) count += 1;
    // standalone app/script items are skipped, not counted
  }
  return count;
}

async function createSingleFile(item: OcItem, currentPath: string, fileName: string) {
  const convertPromise = convertOcItem(item);
  if (!convertPromise) return;
  const content = await convertPromise;
  const result = await (window as any).electron?.files?.createVoid(currentPath, fileName);
  if (result?.path) {
    await (window as any).electron?.files?.write(result.path, content);
  }
}

function getItemName(item: OcItem): string {
  return (item as { info?: { name?: string } }).info?.name || 'Bruno Request';
}

/**
 * Imports a single OpenCollection-shaped request file that lives outside a
 * whole-collection export — Bruno 3.0+'s directory-based layout, where each
 * request is its own `info`/`http` (or `graphql`/`grpc`/`websocket`) YAML
 * file with no `opencollection:` marker of its own (see
 * looksLikeStandaloneOcItem's doc comment). Reuses convertOcItem() — the
 * exact same per-item converter a whole-collection import dispatches
 * through — so this produces an identical result to what that item would
 * get if it were one node inside a full collection export instead.
 */
export const importStandaloneOcItem = async (
  content: string,
  activeProject: string,
): Promise<{ success: true; path: string }> => {
  if (!activeProject) {
    throw new Error('No active project found');
  }

  let item: OcItem;
  try {
    item = JSON.parse(content);
  } catch {
    item = yaml.load(content) as OcItem;
  }

  const convertPromise = convertOcItem(item);
  if (!convertPromise) {
    throw new Error('Unrecognized Bruno request file (expected an http/graphql/grpc/websocket item)');
  }
  const fileContent = await convertPromise;

  const fileName = sanitizeName(getItemName(item));
  const result = await (window as any).electron?.files?.createVoid(activeProject, fileName);
  if (!result?.path) {
    throw new Error('Failed to create .void file');
  }
  await (window as any).electron?.files?.write(result.path, fileContent);

  return { success: true, path: result.path };
};

async function walkOcItems(
  items: OcItem[],
  currentPath: string,
  onProgress: ((current: number, total: number) => void) | undefined,
  progressState: { current: number; total: number },
  onError: ((itemName: string, error: unknown) => void) | undefined,
  signal: { cancelled: boolean } | undefined,
) {
  for (const item of items) {
    if (signal?.cancelled) return;

    if (isOcFolder(item)) {
      const folderName = sanitizeName(item.info?.name || 'Folder');
      const actualFolderName = await (window as any).electron?.files?.createDirectory(currentPath, folderName);
      const folderPath = `${currentPath}/${actualFolderName}`;
      await walkOcItems(item.items ?? [], folderPath, onProgress, progressState, onError, signal);
    } else if (isConvertibleRequest(item)) {
      const name = getItemName(item);
      try {
        await createSingleFile(item, currentPath, sanitizeName(name));
      } catch (error) {
        onError?.(name, error);
        progressState.current += 1;
        onProgress?.(progressState.current, progressState.total);
        continue;
      }
      progressState.current += 1;
      onProgress?.(progressState.current, progressState.total);
    }
    // else: standalone app/script item — skipped silently, matching the
    // "skip rather than guess" policy documented in skill.md

    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/**
 * Import a whole OpenCollection YAML/JSON export — unlike the classic `.bru`
 * path (one file → one request), this walks the full `items[]` tree and can
 * produce many `.void` files + folders, the same shape as the Postman/
 * Insomnia importers.
 */
export const importOpenCollection = async (
  content: string,
  activeProject: string,
  onProgress?: (current: number, total: number) => void,
  onError?: (itemName: string, error: unknown) => void,
  signal?: { cancelled: boolean },
) => {
  if (!activeProject) {
    throw new Error('No active project found');
  }

  const collection = parseOpenCollection(content);
  const items = collection.items ?? [];
  const totalItems = countOcRequests(items);
  const progressState = { current: 0, total: totalItems };

  const rootFolderName = sanitizeName(collection.info?.name || 'Bruno Collection');
  const actualRootFolderName = await (window as any).electron?.files?.createDirectory(activeProject, rootFolderName);
  const rootPath = `${activeProject}/${actualRootFolderName}`;

  await walkOcItems(items, rootPath, onProgress, progressState, onError, signal);

  return { success: true, message: 'Collection imported successfully' };
};
