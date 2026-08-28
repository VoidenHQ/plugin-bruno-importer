/**
 * Bruno (.bru) request JSON shape, as produced by `@usebruno/lang`'s
 * `bruToJsonV2(content)`. Verified empirically against real .bru fixtures
 * (RealWorld/Conduit's Bruno collection, plus hand-written probes covering
 * params/auth/multipart/urlencoded) — @usebruno/lang ships no .d.ts, so this
 * is the ground truth, not a guess from the docs.
 */

export interface BruMeta {
  name: string;
  type: string; // "http" | "graphql" | "grpc" | "ws" — only "http" is handled by this importer
  seq: string; // numeric, but always a string
}

export interface BruHttp {
  method: string; // lowercase — "get", "post", ...
  url: string; // raw, unprocessed — still has ?query and :param segments in it
  body: string; // body mode: "none" | "json" | "text" | "xml" | "sparql" | "graphql" | "formUrlEncoded" | "multipartForm" | "file"
  auth: string; // auth mode: "none" | "inherit" | "basic" | "bearer" | "apikey" | "awsv4" | "digest" | "ntlm" | "wsse" | "oauth2"
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
}

export interface BruAuth {
  basic?: { username: string; password: string };
  bearer?: { token: string };
  apikey?: { key: string; value: string; placement: string };
  awsv4?: { accessKeyId: string; secretAccessKey: string; sessionToken?: string; service: string; region: string };
  digest?: { username: string; password: string };
  ntlm?: { username: string; password: string; domain?: string };
  wsse?: { username: string; password: string };
  oauth2?: Record<string, unknown>;
}

export interface BruVar {
  name: string;
  value: string;
  enabled: boolean;
  local?: boolean;
}

export interface BruJson {
  meta: BruMeta;
  http: BruHttp;
  params?: BruParam[];
  headers?: BruHeader[];
  body?: BruBody;
  auth?: BruAuth;
  vars?: { req?: BruVar[]; res?: BruVar[] };
  script?: { req?: string; res?: string };
  assertions?: BruAssertion[];
  tests?: string;
  docs?: string;
}

/**
 * A Bruno request file always has a `meta {}` block with `type: http` and a
 * matching HTTP-method block (`get {}` / `post {}` / ...). `folder.bru` and
 * `bruno.json` never satisfy both, so this doubles as the "is this actually
 * a single request, not a collection-level file" check.
 */
export function looksLikeBruRequestFile(content: string): boolean {
  const hasMeta = /(^|\n)\s*meta\s*\{/.test(content);
  const hasHttpMethod = /(^|\n)\s*(get|post|put|patch|delete|head|options)\s*\{/.test(content);
  return hasMeta && hasHttpMethod;
}
