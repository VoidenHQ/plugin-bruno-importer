import yaml from 'js-yaml';

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

export interface OcAuthOAuth1 {
  type: 'oauth1';
  consumerKey?: string;
  consumerSecret?: string;
  accessToken?: string;
  accessTokenSecret?: string;
  signatureMethod?: 'HMAC-SHA1' | 'HMAC-SHA256' | 'HMAC-SHA512' | 'RSA-SHA1' | 'RSA-SHA256' | 'RSA-SHA512' | 'PLAINTEXT';
}

interface OcOAuth2Credentials {
  clientId?: string;
  clientSecret?: string;
}

// The 4 oauth2 grant-type flows, field names verified against oc-types'
// auth-oauth2.ts — matches Voiden's own oauth2 auth block's 4 grant types
// almost field-for-field (see blockBuilders.ts's buildOAuth2Block).
export type OcAuthOAuth2 =
  | { type: 'oauth2'; flow: 'client_credentials'; accessTokenUrl?: string; credentials?: OcOAuth2Credentials; scope?: string }
  | { type: 'oauth2'; flow: 'resource_owner_password_credentials'; accessTokenUrl?: string; credentials?: OcOAuth2Credentials; resourceOwner?: { username?: string; password?: string }; scope?: string }
  | { type: 'oauth2'; flow: 'authorization_code'; authorizationUrl?: string; accessTokenUrl?: string; callbackUrl?: string; credentials?: OcOAuth2Credentials; scope?: string; state?: string }
  | { type: 'oauth2'; flow: 'implicit'; authorizationUrl?: string; callbackUrl?: string; credentials?: { clientId?: string }; scope?: string; state?: string };

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
  | OcAuthOAuth1
  | OcAuthOAuth2;

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

export interface OcHttpRequest {
  info?: OcHttpRequestInfo;
  http: OcHttpRequestDetails;
  runtime?: OcHttpRequestRuntime;
  docs?: string;
}

export interface OcGraphQLRequestInfo {
  name?: string;
  type: 'graphql';
  seq?: number;
}

export interface OcGraphQLRequestDetails {
  url?: string;
  headers?: OcHeader[];
  params?: OcParam[];
  body?: { query?: string; variables?: string };
  auth?: OcAuth;
}

export interface OcGraphQLRequest {
  info: OcGraphQLRequestInfo;
  graphql: OcGraphQLRequestDetails;
  runtime?: OcHttpRequestRuntime;
  docs?: string;
}

export interface OcGrpcRequestInfo {
  name?: string;
  type: 'grpc';
  seq?: number;
}

// GrpcMethodType uses hyphens (client-streaming, server-streaming,
// bidi-streaming) — different spelling from Voiden's own underscored
// callType, hence normalizeGrpcCallType in blockBuilders.ts.
export interface OcGrpcRequestDetails {
  url?: string;
  method?: string;
  methodType?: 'unary' | 'client-streaming' | 'server-streaming' | 'bidi-streaming';
  protoFilePath?: string;
  metadata?: { name: string; value: string; disabled?: boolean }[];
  auth?: OcAuth;
}

export interface OcGrpcRequest {
  info: OcGrpcRequestInfo;
  grpc: OcGrpcRequestDetails;
  docs?: string;
}

export interface OcWebSocketRequestInfo {
  name?: string;
  type: 'websocket';
  seq?: number;
}

export interface OcWebSocketRequestDetails {
  url?: string;
  headers?: OcHeader[];
  auth?: OcAuth;
}

export interface OcWebSocketRequest {
  info: OcWebSocketRequestInfo;
  websocket: OcWebSocketRequestDetails;
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

// The standalone `app`/`script` item types are out of scope — same "skip
// rather than guess" policy as the classic .bru importer's unsupported
// auth/body types.
export type OcItem = OcHttpRequest | OcGraphQLRequest | OcGrpcRequest | OcWebSocketRequest | OcFolder | { info?: { type?: string } };

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

export function isOcGraphQLRequest(item: OcItem): item is OcGraphQLRequest {
  return (item as OcGraphQLRequest).info?.type === 'graphql' && !!(item as OcGraphQLRequest).graphql;
}

export function isOcGrpcRequest(item: OcItem): item is OcGrpcRequest {
  return (item as OcGrpcRequest).info?.type === 'grpc' && !!(item as OcGrpcRequest).grpc;
}

export function isOcWebSocketRequest(item: OcItem): item is OcWebSocketRequest {
  return (item as OcWebSocketRequest).info?.type === 'websocket' && !!(item as OcWebSocketRequest).websocket;
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

/**
 * The directory-based OpenCollection variant this file's own comment above
 * used to only describe, never detect (a real, confirmed gap — Bruno 3.0+
 * can lay a collection out as a folder tree of individual per-request YAML
 * files plus one root `opencollection.yml`, instead of exporting everything
 * as one whole-collection file). An individual request file in that layout
 * has no `opencollection:` marker of its own — just `info`/`http` (or
 * `graphql`/`grpc`/`websocket`) directly at the top level, identical in
 * shape to one node of a whole-collection export's `items[]` array. Reuses
 * the exact same per-item type guards a whole-collection import already
 * dispatches on, so a standalone file recognized here converts through the
 * identical, already-correct per-item converters.
 */
export function looksLikeStandaloneOcItem(content: string): boolean {
  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch {
    try {
      parsed = yaml.load(content);
    } catch {
      return false;
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
  // A whole-collection root (has its own "opencollection" key) or a folder
  // item (has "items") isn't a standalone request — let the existing
  // looksLikeOpenCollection() check own those instead.
  if (typeof parsed.opencollection === 'string' || Array.isArray(parsed.items)) return false;
  return isOcHttpRequest(parsed) || isOcGraphQLRequest(parsed) || isOcGrpcRequest(parsed) || isOcWebSocketRequest(parsed);
}
