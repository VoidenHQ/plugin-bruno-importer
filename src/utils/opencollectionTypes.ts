/**
 * OpenCollection YAML format (Bruno 3.0+'s "Export Collection" output) —
 * trimmed to the fields this importer actually handles. Field names verified
 * against the authoritative TypeScript source at
 * https://github.com/opencollection-dev/opencollection/tree/main/packages/oc-types/src
 * (the spec.opencollection.com/schema.opencollection.com pages themselves
 * are JS-rendered viewers with no fetchable raw schema, so the source
 * package is the actual ground truth here, not the docs site).
 *
 * This is a DIFFERENT, newer format than the classic `.bru` DSL text file
 * (see types.ts / converter.ts) — a whole collection (folders + requests)
 * serialized as ONE YAML file, closer in shape to a Postman/Insomnia export
 * than to Bruno's traditional one-file-per-request layout.
 */

export interface OcHeader {
  name: string;
  value: string;
  disabled?: boolean;
}

export interface OcParam {
  name: string;
  value: string;
  type: 'query' | 'path';
  disabled?: boolean;
}

export interface OcRawBody {
  type: 'json' | 'text' | 'xml' | 'sparql';
  data: string;
}

export interface OcFormUrlEncodedEntry {
  name: string;
  value: string;
  disabled?: boolean;
}

export interface OcFormUrlEncodedBody {
  type: 'form-urlencoded';
  data: OcFormUrlEncodedEntry[];
}

export interface OcMultipartFormEntry {
  name: string;
  type: 'text' | 'file';
  value: string | string[];
  disabled?: boolean;
  contentType?: string;
}

export interface OcMultipartFormBody {
  type: 'multipart-form';
  data: OcMultipartFormEntry[];
}

export interface OcFileBody {
  type: 'file';
  data: { filePath: string; contentType: string; selected: boolean }[];
}

export type OcBody = OcRawBody | OcFormUrlEncodedBody | OcMultipartFormBody | OcFileBody;

// oauth1/oauth2 are deliberately not modeled here — same reasoning as the
// classic .bru path: too many shapes (4 oauth2 flows alone), and rarely
// carry a resolved token worth copying. Skipped rather than guessed at.
export type OcAuth =
  | 'inherit'
  | 'none'
  | { type: 'basic'; username?: string; password?: string }
  | { type: 'bearer'; token?: string }
  | { type: 'apikey'; key?: string; value?: string; placement?: 'header' | 'query' }
  | { type: 'awsv4'; accessKeyId?: string; secretAccessKey?: string; sessionToken?: string; service?: string; region?: string }
  | { type: 'digest'; username?: string; password?: string }
  | { type: 'ntlm'; username?: string; password?: string; domain?: string }
  | { type: 'wsse'; username?: string; password?: string }
  | { type: 'oauth1' | 'oauth2'; [key: string]: unknown };

export interface OcScript {
  type: 'before-request' | 'after-response' | 'tests' | 'hooks' | string;
  code: string;
}

export interface OcVariable {
  name: string;
  value?: unknown;
  disabled?: boolean;
}

export interface OcAssertion {
  expression: string;
  operator: string;
  value?: string;
  disabled?: boolean;
}

export interface OcHttpRequestInfo {
  name?: string;
  type?: 'http';
  seq?: number;
}

export interface OcHttpRequestDetails {
  method?: string;
  url?: string;
  headers?: OcHeader[];
  params?: OcParam[];
  body?: OcBody;
  auth?: OcAuth;
}

export interface OcHttpRequestRuntime {
  variables?: OcVariable[];
  scripts?: OcScript[];
  assertions?: OcAssertion[];
}

/** An HTTP request item — the only item type this importer converts. */
export interface OcHttpRequest {
  info?: OcHttpRequestInfo;
  http: OcHttpRequestDetails;
  runtime?: OcHttpRequestRuntime;
  docs?: string;
}

export interface OcFolderInfo {
  name?: string;
  type?: 'folder';
  seq?: number;
}

export interface OcFolder {
  info: OcFolderInfo;
  items?: OcItem[];
}

// GraphQL/gRPC/WebSocket items, and the standalone `app`/`script` item
// types, are out of scope for now — same "skip rather than guess" policy
// as the classic .bru importer's unsupported auth/body types.
export type OcItem = OcHttpRequest | OcFolder | { info?: { type?: string } };

export interface OpenCollection {
  opencollection?: string;
  info?: { name?: string };
  items?: OcItem[];
}

export function isOcFolder(item: OcItem): item is OcFolder {
  return (item as OcFolder).info?.type === 'folder';
}

export function isOcHttpRequest(item: OcItem): item is OcHttpRequest {
  const info = (item as OcHttpRequest).info;
  return (info?.type === 'http' || info?.type === undefined) && !!(item as OcHttpRequest).http;
}

/**
 * A raw .bru request file and an OpenCollection YAML/JSON export both land
 * in this plugin's editor-action predicate — this is how they're told
 * apart. Bruno's OpenCollection root always carries a top-level
 * `opencollection: <version>` key; a per-request `.bru` file never has one
 * (its own YAML variant, if this collection format is used per-file instead
 * of as one whole-collection export, has `info`/`http` at the top level
 * with no `opencollection` key at all).
 */
export function looksLikeOpenCollection(content: string): boolean {
  return /(^|\n)\s*opencollection\s*:\s*['"]?[\d.]/.test(content);
}
