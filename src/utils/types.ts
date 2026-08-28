/**
 * Bruno (.bru) request JSON shape, as produced by `@usebruno/lang`'s
 * `bruToJsonV2(content)`. Verified empirically against real .bru fixtures
 * (RealWorld/Conduit's Bruno collection, hand-written probes covering
 * params/auth/multipart/urlencoded, and — for grpc/ws/oauth1/oauth2 — direct
 * inspection of @usebruno/lang's own grammar/serializer source, since these
 * are rarer shapes not present in the sample fixtures) — @usebruno/lang
 * ships no .d.ts, so this is the ground truth, not a guess from the docs.
 */

export interface BruMeta {
  name: string;
  type: string; // "http" | "graphql" | "grpc" | "ws"
  seq: string; // numeric, but always a string
}

export interface BruHttp {
  method: string; // lowercase — "get", "post", ...
  url: string; // raw, unprocessed — still has ?query and :param segments in it
  body: string; // body mode: "none" | "json" | "text" | "xml" | "sparql" | "graphql" | "formUrlEncoded" | "multipartForm" | "file"
  auth: string; // auth mode: "none" | "inherit" | "basic" | "bearer" | "apikey" | "awsv4" | "digest" | "ntlm" | "wsse" | "oauth1" | "oauth2"
}

/** `grpc {}` top-level block — present only for meta.type: "grpc". */
export interface BruGrpc {
  url: string;
  method?: string; // service/method label, e.g. "user.UserService/GetUser" — free text, not grammar-validated
  body?: string; // "grpc" when a body:grpc{} block is present
  protoPath?: string; // relative path to the .proto file, as written in the .bru file
  auth?: string;
  methodType?: string; // observed: "unary" — streaming variants' exact on-disk spelling unconfirmed, normalize defensively
}

/** `ws {}` top-level block — present only for meta.type: "ws". */
export interface BruWs {
  url: string;
  body?: string; // "ws" when a body:ws{} block is present
  auth?: string;
  methodType?: string;
}

export interface BruParam {
  name: string;
  value: string;
  enabled: boolean;
  type: 'query' | 'path';
}

export interface BruHeader {
  name: string;
  value: string;
  enabled: boolean;
}

/** `metadata {}` block — gRPC's equivalent of headers. No Voiden target exists today (see converter.ts). */
export interface BruMetadataEntry {
  name: string;
  value: string;
  enabled: boolean;
}

export interface BruAssertion {
  name: string; // e.g. "res.status", "res.body.article.slug"
  value: string; // "<operator> <expected>", e.g. "eq 201"
  enabled: boolean;
}

export interface BruMultipartField {
  name: string;
  value: string | string[]; // string for text fields, string[] (file paths) for type "file"
  enabled: boolean;
  type: 'text' | 'file';
  contentType?: string;
}

export interface BruBody {
  json?: string;
  text?: string;
  xml?: string;
  sparql?: string;
  graphql?: { query: string; variables?: string };
  formUrlEncoded?: BruHeader[];
  multipartForm?: BruMultipartField[];
  file?: { filePath: string; selected: boolean }[];
  // gRPC/WS message payloads — mode/grpc/ws — have no Voiden target (see
  // converter.ts's convertBruGrpcRequestToVoidenSchema); modeled here only
  // so parseBruContent doesn't choke on their presence.
  mode?: string;
  grpc?: { name: string; content: string }[];
  ws?: { name: string; type: string; content: string; selected: boolean }[];
}

export interface BruOAuth1 {
  consumerKey?: string;
  consumerSecret?: string;
  accessToken?: string;
  accessTokenSecret?: string;
  signatureMethod?: string;
}

// oauth2's shape is grant-type-discriminated in the exact same 4 flows
// Voiden's own oauth2 auth type documents — field names verified against
// @usebruno/lang's authOAuth2 handler.
export type BruOAuth2 =
  | { grantType: 'password'; accessTokenUrl?: string; clientId?: string; clientSecret?: string; username?: string; password?: string; scope?: string }
  | { grantType: 'authorization_code'; authorizationUrl?: string; accessTokenUrl?: string; clientId?: string; clientSecret?: string; scope?: string; callbackUrl?: string; state?: string }
  | { grantType: 'client_credentials'; accessTokenUrl?: string; clientId?: string; clientSecret?: string; scope?: string }
  | { grantType: 'implicit'; authorizationUrl?: string; clientId?: string; scope?: string; callbackUrl?: string; state?: string };

export interface BruAuth {
  basic?: { username: string; password: string };
  bearer?: { token: string };
  apikey?: { key: string; value: string; placement: string };
  awsv4?: { accessKeyId: string; secretAccessKey: string; sessionToken?: string; service: string; region: string };
  digest?: { username: string; password: string };
  ntlm?: { username: string; password: string; domain?: string };
  wsse?: { username: string; password: string };
  oauth1?: BruOAuth1;
  oauth2?: BruOAuth2;
}

export interface BruVar {
  name: string;
  value: string;
  enabled: boolean;
  local?: boolean;
}

export interface BruJson {
  meta: BruMeta;
  http?: BruHttp;
  grpc?: BruGrpc;
  ws?: BruWs;
  params?: BruParam[];
  headers?: BruHeader[];
  metadata?: BruMetadataEntry[];
  body?: BruBody;
  auth?: BruAuth;
  vars?: { req?: BruVar[]; res?: BruVar[] };
  script?: { req?: string; res?: string };
  assertions?: BruAssertion[];
  tests?: string;
  docs?: string;
}

/**
 * A Bruno *request* file always has a `meta {}` block plus a matching
 * protocol block: `get{}`/`post{}`/... (http or graphql — graphql requests
 * still use an http-style method block), `grpc{}`, or `ws{}`. `folder.bru`
 * and `bruno.json` never satisfy this, and neither does an *environment*
 * file (see looksLikeBruEnvironmentFile below) — those have no `meta{}` at
 * all — so this doubles as the "is this a single request file" check.
 */
export function looksLikeBruRequestFile(content: string): boolean {
  const hasMeta = /(^|\n)\s*meta\s*\{/.test(content);
  const hasProtocolBlock = /(^|\n)\s*(get|post|put|patch|delete|head|options|grpc|ws)\s*\{/.test(content);
  return hasMeta && hasProtocolBlock;
}

/**
 * A Bruno environment file (`environments/<name>.bru`) has `vars {}` and/or
 * `vars:secret [...]` blocks and, unlike a request file, no `meta {}` block
 * at all. Verified via `bruToEnvJsonV2` — see openCollectionConverter.ts's
 * sibling environment handling for the .void-side mapping.
 */
export function looksLikeBruEnvironmentFile(content: string): boolean {
  const hasMeta = /(^|\n)\s*meta\s*\{/.test(content);
  const hasVars = /(^|\n)\s*vars(:secret)?\s*[{[]/.test(content);
  return !hasMeta && hasVars;
}
