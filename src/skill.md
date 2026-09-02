## Extension: Bruno Collection Importer

Bruno exports come in **four structurally different shapes**, and this extension's button handles each differently:

1. **Classic `.bru` request files** — Bruno's native on-disk format: `bruno.json` plus a folder tree of individual `.bru` files, one request per file. Covers `http`, `graphql`, `grpc`, and `ws` typed requests (`meta.type`). Opening one and clicking **Import into Voiden** converts it to exactly one `.void` file.
2. **Bruno environment files** (`environments/<name>.bru`) — no `meta{}` block, just `vars{}`/`vars:secret[]`. Opening one and clicking **Import into Voiden** merges its variables into Voiden's own environment YAML tree, as its own named environment.
3. **OpenCollection YAML/JSON export** — the output of Bruno 3.0+'s **Export Collection** button (this is what most users actually reach for today, not a manual `.bru` folder copy). It's a *whole collection* — folders and requests together — serialized as **one YAML or JSON file**, structurally closer to a Postman/Insomnia export than to Bruno's own per-file layout. Opening this file and clicking **Import into Voiden** walks the whole tree and produces many `.void` files + folders in one go. Detect it by a top-level `opencollection: <version>` key (e.g. `opencollection: 1.0.0`) — a plain `.bru` file never has one.
4. **A single request from Bruno 3.0+'s *directory-based* OpenCollection layout** — the same underlying format as #3, but laid out as a folder tree instead of exported as one whole-collection file: one root `opencollection.yml` (carrying the marker from #3) plus individual per-request YAML files that do **not** carry that marker themselves. Each request file is just `info`/`http` (or `graphql`/`grpc`/`websocket`) directly at the top level — e.g.:
   ```yaml
   info:
     name: Get user
     type: http
     seq: 1
   http:
     method: GET
     url: https://api.github.com/users/usebruno
     auth: inherit
   ```
   Detect this shape by its *absence* of both an `opencollection:` key (rules out #3) and an `items`/`meta{}`+protocol-block pair (rules out #1) — just `info.type` (`http`/`graphql`/`grpc`/`websocket`, or omitted, which defaults to `http`) sitting alongside a matching `http`/`graphql`/`grpc`/`websocket` key. **Map it using the exact same field table as #3's "Mapping an OpenCollection item to Voiden blocks" below** — this is structurally one node of that tree, just living in its own file. Opening one and clicking **Import into Voiden** converts it to exactly one `.void` file, same as #1.

**This skill is not about the button's output** — it teaches an agent how to **generate `.void` files directly from any of these raw formats**, e.g. when asked to "convert this Bruno collection/export into Voiden requests." Read `voiden-rest-api`'s skill alongside this one for full block syntax, `voiden-advanced-auth`'s skill for the `auth` block, `voiden-graphql`'s skill for `gqlquery`/`gqlvariables`, `voiden-sockets-grpcs`'s skill for `socket-request`/`proto`, and `simple-assertions`'s skill for `assertions-table`.

### What has no Voiden target — don't force one

Bruno's gRPC and WebSocket requests carry a pre-authored request payload (`.bru`'s `body:grpc{}`/`body:ws{}`, OpenCollection's `grpc.message`/`websocket.message`) and gRPC carries custom metadata (`.bru`'s `metadata{}`, OpenCollection's `grpc.metadata`). **Neither has anywhere to go in a `.void` file** — Voiden's `socket-request` block for these protocols only ever holds connection info (`smethod`/`surl`/`proto`), and its `messages-node`/`grpc-messages-node` are live, UI-populated records of an actual run, not fields you fill in ahead of time (see `voiden-sockets-grpcs`'s skill). Import the connection details (url, proto file, streaming type) and leave the payload for the person to send interactively from the app — don't stuff it into a script or comment pretending it's wired up.

### Default generation strategy: one file per resource, not per request

Regardless of which format you're reading, don't default to one `.void` file per request. Instead: **for a group of sibling requests that operate on the same resource** — a folder of `.bru` files named `create-x.bru`/`get-x.bru`/`update-x.bru`/`delete-x.bru` (or numbered `seq`-ordered flows like `01-setup...bru`/`02-create...bru`), or an OpenCollection folder item containing several `http`-type child items — **generate ONE `.void` file for that group**, with each request becoming its own section via a `request-separator` (base skill's Multi-Request Files feature), not a separate file. Only fall back to one file per request when a request stands alone with no siblings worth grouping. Order sections by `meta.seq` (`.bru`) or `info.seq` (OpenCollection) when present — that's Bruno's own intended execution order.

**A classic `.bru` collection is a folder tree, not one file — you must go discover its siblings, they won't come to you.** This is the one place Bruno genuinely differs from Postman/Insomnia in a way that changes how you should work, not just what you map: a Postman or Insomnia export is a *single JSON/YAML file* whose whole collection tree — every folder, every sibling request — is right there the moment you read it, so "these four requests are a CRUD group" is obvious from one read. Bruno's classic format has no such single file: each request is its own `.bru` file, and its siblings are simply other files sitting in the same directory (with `bruno.json` marking the collection root, and a `meta.seq` field in each file giving execution order). If you're asked to convert a Bruno collection and you only look at the one `.bru` file you were pointed to, **you will never see its siblings and will wrongly default to one file per request** — this is a real, observed failure mode, not a hypothetical. Before generating anything from a classic `.bru` file: **list the full contents of its containing folder (and any subfolders) and read every `.bru` file you find there** — that's the actual scope of "the collection," and only after seeing that full set can you correctly decide the resource-level grouping. **The same discovery step applies to the directory-based OpenCollection variant (#4 above)** — a standalone per-request YAML file has exactly the same "siblings are just other files in the same folder" shape as classic `.bru`, so list that folder too before deciding groupings; only the *whole-collection* OpenCollection export (#3) is exempt, since that format is already single-file and its whole tree is visible from the one read, structurally identical to Postman/Insomnia in this respect.

```markdown
---
version: __VOIDEN_APP_VERSION__
generatedBy: Voiden app
note: This file is auto-generated by the Voiden app
generatedAt: 2025-01-15T10:30:00.000Z
---

# Article CRUD

```void
---
type: request-separator
attrs:
  uid: "c3d4e5f6-a7b8-4c9d-e0f1-a2b3c4d5e6f7"
  colorIndex: 0
  label: "Create Article"
---
```

```void
---
type: request
attrs:
  uid: "a1b2c3d4-e5f6-4789-ab01-cd23ef456789"
content:
  - type: method
    attrs: { uid: "...", method: POST, visible: true }
    content: POST
  - type: url
    attrs: { uid: "..." }
    content: "{{BASE_URL}}/api/articles"
---
```

```void
---
type: json_body
attrs:
  uid: "..."
  body: |
    { "article": { "title": "Test Article", "body": "..." } }
---
```

```void
---
type: runtime-variables
attrs:
  uid: "..."
content:
  - type: table
    rows:
      - attrs: { disabled: false }
        row: [slug, "{{$res.body.article.slug}}", "Captured for the sections below"]
---
```

```void
---
type: request-separator
attrs:
  uid: "f6a7b8c9-d0e1-4f2a-b3c4-d5e6f7a8b9c0"
  colorIndex: 1
  label: "Get Article"
---
```

Add this section's `request` block the same shape as `Create Article`'s above (method `GET`, url `{{BASE_URL}}/api/articles/{{process.slug}}`) — the exact `request`/`method`/`url` structure isn't repeated a second time here on purpose: it's a core block owned by the base skill, not something this plugin skill redefines, so there's exactly one place that shape can drift out of sync instead of two.
```

Keep going with the same pattern for `Update Article` (PUT/PATCH) and `Delete Article` (DELETE) sections. Section `label`s name the operation — don't add a redundant `## Create Article` heading (see "Placement" below).

**Chaining sections together:** a section's response can feed the ones after it via a `runtime-variables` block (shown above) or a `post_script` calling `voiden.variables.set()`. Referencing a captured value always requires the `process.` prefix — `{{process.slug}}`, never `{{slug}}` — see the base skill's "runtime-variables" section for the full capture-expression table. A `.bru` file's own `vars:post-response` block (see mapping below) is usually the exact signal for what to capture — e.g. `slug: res.body.article.slug` in the Create request's `vars:post-response` means later sections need `{{process.slug}}`.

### Mapping a `.bru` request to Voiden blocks

Parse each `.bru` file's blocks directly (or via `@usebruno/lang`'s `bruToJsonV2` if running in a JS context). Field names for the rarer grpc/ws/oauth1/oauth2 shapes below were verified directly against `@usebruno/lang`'s own grammar/serializer source (`bruToJson.js`/`jsonToBru.js`) — not sample fixtures, since real-world examples of these are scarce.

**`http`/`graphql`-typed requests** (`meta.type: "http"` or `"graphql"` — a graphql request still uses an http-style method block, just with `body: graphql`):

| Bruno block | Voiden block | Notes |
|---|---|---|
| `get{}`/`post{}`/`put{}`/... block's `url` | `request` (method + url) | The block name itself is the method. Convert `:id` segments to `{id}` and strip the `?query` portion (query params come from `params:query` instead). Skip this block entirely for a `body:graphql` request — the endpoint lives in `gqlurl` instead. |
| `auth:basic{}` / `auth:bearer{}` / `auth:apikey{}` / `auth:digest{}` / `auth:awsv4{}` / `auth:ntlm{}` | `auth` | Each block's fields map directly (e.g. `auth:bearer{ token }` → `auth` block's `token` row). |
| `auth:oauth1{}` | `auth` (`authType: oauth1`) | Bruno's oauth1 config has more fields (`callback_url`, `verifier`, `realm`, `private_key`, ...) than Voiden's auth block documents — only `consumer_key`/`consumer_secret`/`access_token`/`token_secret`/`signature_method` carry over; the rest have nowhere to go. |
| `auth:oauth2{}` | `auth` (`authType: oauth2`) | Grant-type discriminated (`grant_type: password\|authorization_code\|client_credentials\|implicit`) — the same 4 flows Voiden's own oauth2 documents, with near-identical field names once snake_cased (`access_token_url`→`token_url`, `authorization_url`→`auth_url`, etc.). Populate both the row table and the `oauth2Config` JSON attr — see `voiden-advanced-auth`'s skill for the exact per-flow shape. |
| `auth:wsse{}` | *(no mapping)* | Voiden's auth block has no wsse slot — leave to convert by hand. |
| `headers{}` (rows not prefixed `~`) | `headers-table` | A `~` prefix means disabled — carry that into `disabled: true`, don't drop the row. |
| `params:path{}` | `path-table` | Bruno gives the definitive path-param list directly — no need to scan the URL for `:name` segments the way Postman/Insomnia require. |
| `params:query{}` (rows not prefixed `~`) | `query-table` | |
| `body:json{}` | `json_body` | |
| `body:xml{}` | `xml_body` | |
| `body:text{}` | `json_body` with a text content type | |
| `body:sparql{}` | `json_body` with a text content type | Best-effort only — no native SPARQL block exists. |
| `body:form-urlencoded{}` | `url-table` | |
| `body:multipart-form{}` | `multipart-table` | A field written as `name: @file(/path)` becomes a `fileLink` attachment if it still exists on disk. |
| `body:graphql{}` | `gqlquery` + `gqlvariables` | Same container shape as the Postman mapping — `gqlbody.body` gets the query text (detect `query`/`mutation`/`subscription` from it), a second `gqlvariables` block if variables are present. |
| `assert{}` | `assertions-table` | **This one is safe to translate directly** — unlike scripts, `assert{}` is a declarative `res.<field>: <op> <expected>` table, not arbitrary JS. Strip the `res.` prefix for the field column; map the operator (`eq`→`equals`, `neq`→`not-equals`, `contains`→`contains`, `notContains`→`not-contains`, `isDefined`→`exists`, `isUndefined`→`not-exists`, `gt`/`gte`/`lt`/`lte`→`greater-than`/`greater-equal`/`less-than`/`less-equal`, `isEmpty`/`isNotEmpty`→`is-empty`/`not-empty`, `isTruthy`/`isFalsy`→`is-truthy`/`is-falsy`, `matches`→`matches`; see `simple-assertions`'s skill for the full Voiden operator list). An assertion on `req.*` (not `res.*`) or using an operator outside this list has no clean Voiden equivalent — still include the row, but `disabled: true` with the original Bruno expression kept in the description, rather than silently dropping it. |
| `script:pre-request{}` / `vars:pre-request{}` | `pre_script` | **Translate when every line is a recognized safe pattern, otherwise comment out in full** — see "Translating bru.*/expect scripts" below. `vars:pre-request` entries render as `bru.setVar(name, value);` pseudocode before translation, so they get the same treatment as a real `bru.setVar` call. |
| `script:post-response{}` / `vars:post-response{}` | `post_script` | Same policy. A `vars:post-response` entry that resolves to a live `voiden.variables.set(...)` call is already the chaining wiring "Chaining sections" above describes manually adding — when translation succeeds, that wiring is already there. |

**`grpc`-typed requests** (`meta.type: "grpc"`):

| Bruno block | Voiden block | Notes |
|---|---|---|
| `grpc{}`'s `url` | `socket-request` > `smethod` (`GRPCS` if `grpcs://`, else `GRPC`) + `surl` | |
| `grpc.protoPath` | `proto.filePath`/`proto.fileName` (basename) | `proto.services` stays `[]` — the app populates it once it can read the file itself. |
| `grpc.method` (e.g. `"user.UserService/GetUser"`) | `proto.selectedService` + `proto.selectedMethod` | Split on `/` when present. |
| `grpc.methodType` | `proto.callType` | Normalize hyphens to underscores (`server-streaming`→`server_streaming`); `bidi-streaming`→`bidirectional_streaming` specifically (Voiden spells it out in full, Bruno abbreviates). Default `unary` if absent/unrecognized. |
| `metadata{}`, `body:grpc{}` | *(no mapping — see "What has no Voiden target" above)* | |

**`ws`-typed requests** (`meta.type: "ws"`):

| Bruno block | Voiden block | Notes |
|---|---|---|
| `ws{}`'s `url` | `socket-request` > `smethod` (`WSS` if `wss://`, else `WS`) + `surl` | |
| `body:ws{}` | *(no mapping — see "What has no Voiden target" above)* | |

### Translating `bru.*`/`expect` scripts into live `voiden.*` code

Bruno scripts use the `bru.*`/`req.*`/`res.*` API; Voiden scripts use the `voiden.*`/`vd.*` object — not source-compatible, so a blanket "just copy the script" isn't safe. But a real, useful subset maps directly, and translating those live is worth doing — **as long as it's all-or-nothing per script**: translate the whole thing only if *every* line resolves to a recognized pattern below; if even one line doesn't, leave the *entire* script commented exactly as before. Never a half-translated, half-commented script. Every generated `pre_script`/`post_script` block from this importer uses `attrs.language: javascript` — Bruno's `bru.*`/`req.*`/`res.*` scripts are always JS, so there's no Python/Shell target to consider here.

#### The full `voiden.*` surface a translated script can use

This is the complete API — not a subset — so you have full context for what a translated line is allowed to become, and what's available if you're hand-writing additional assertions beyond what the original script had. Read `voiden-scripting`'s own skill for Python/Shell equivalents; only the JavaScript form is relevant here.

| Object | Member | Read/Write | Description |
|---|---|---|---|
| `voiden.request` | `.url` | rw | Request URL (pre_script only) |
| | `.method` | rw | HTTP method |
| | `.headers` | rw | Assign `{key,value}`, an array of them, or a `{Name:val}` map to **replace all** |
| | `.headers.push({key,value,enabled?})` | append | Add one header without replacing existing ones |
| | `.body` | rw | Request body — must be a string |
| | `.queryParams` | rw | Assign to **replace all**; `{key,value,enabled?}[]` |
| | `.queryParams.push({key,value,enabled?})` | append | Add one query param |
| | `.pathParams` | rw | Assign to **replace all**; `{key,value,enabled?}[]` |
| | `.pathParams.push({key,value,enabled?})` | append | Add one path param |
| `voiden.response` | `.status` | rw (post_script) | HTTP status code, number |
| | `.statusText` | rw (post_script) | HTTP status text string |
| | `.body` | rw (post_script) | Already parsed if JSON, otherwise a string |
| | `.headers` | read-only | `Record<string,string>` |
| | `.cookies` | read-only | `Record<string,{value:string,...}>` |
| | `.time` | read-only | Response time, ms |
| | `.size` | read-only | Response size, bytes |
| `voiden.env.get(key)` | — | read-only | Active environment value |
| `voiden.variables.get(key)` | — | read | Runtime variable (synchronous) |
| `voiden.variables.set(key, value)` | — | write | Persists across requests — use `{{process.key}}` (not `{{key}}`) to read it outside a script |
| `voiden.log(...args)` | — | — | Logs at `log` level |
| `voiden.log(level, ...args)` | — | — | `level` one of `log`/`info`/`debug`/`warn`/`error` |
| `voiden.assert(actual, operator, expected, message?)` | — | — | Records one structured assertion — see the full operator table below |
| `voiden.cancel()` | — | — | Cancels the pending request — pre_script only |

There is no `voiden.request.cookies`, no outbound-fetch primitive (`bru.sendRequest`/`bru.runRequest`'s equivalent doesn't exist), no runner-flow-control object, and no `unset`/`remove`/`clear` operations on variables or headers — only get/set and push. Keep this in mind when deciding whether a `bru.*`/`req.*`/`res.*` call has a real target: if it isn't in the table above, it doesn't exist in `voiden.*`, full stop.

#### voiden.assert — every operator, and which Chai matcher(s) reach it

| Operator group | Semantics | Chai matcher(s) that translate to it |
|---|---|---|
| `"=="` / `"eq"` / `"equal"` | Loose equality (`actual == expected`) | `.to.eql(y)` |
| `"==="` | Strict equality (`actual === expected`) | `.to.equal(y)`, `.to.be.null` (against literal `null`), `.to.be.undefined` (against literal `undefined`) |
| `"!="` / `"!=="` / `"neq"` / `"notequal"` | Not equal / strict not equal | `.to.not.eql(y)` → `"!="`; `.to.not.equal(y)` → `"!=="`; `.to.not.be.null` → `"!=="` against `null`; `.to.not.be.undefined` → `"!=="` against `undefined` |
| `">"` / `"greater"` / `"greaterthan"` | Numeric greater than | `.to.be.above(y)` / `.to.be.greaterThan(y)` |
| `">="` / `"gte"` | Greater than or equal | `.to.be.at.least(y)` / `.to.be.gte(y)`; also the lower bound of `.to.be.within(min,max)` / `.to.be.closeTo(expected,delta)` |
| `"<"` / `"less"` / `"lessthan"` | Numeric less than | `.to.be.below(y)` / `.to.be.lessThan(y)` |
| `"<="` / `"lte"` | Less than or equal | `.to.be.at.most(y)` / `.to.be.lte(y)`; also the upper bound of `.to.be.within(min,max)` / `.to.be.closeTo(expected,delta)` |
| `"contains"` / `"includes"` | `actual.includes(String(expected))` if `actual` is a string; `actual.includes(expected)` if `actual` is an array | `.to.include(y)` / `.to.contain(y)`; also `.to.be.oneOf([...])`, reversed — the options array is passed as `actual`, the checked value as `expected` |
| `"matches"` / `"regex"` | `new RegExp(String(expected)).test(String(actual))` — `expected` must be the regex's **plain source text**, no `/.../ ` delimiters and no flags | `.to.match(/pattern/)` — **only** when the argument is a literal, flag-less regex |
| `"truthy"` | `Boolean(actual)` | `.to.be.true` / `.to.be.ok`; also `.to.have.property(key)` (approximated) |
| `"falsy"` | `!actual` | `.to.be.false`; also `.to.not.have.property(key)` (approximated) |

Two matchers have no single operator and expand into **two** `voiden.assert` calls instead: `.to.be.within(min, max)` → `>=` min **and** `<=` max; `.to.be.closeTo(expected, delta)` → `>=` (expected − delta) **and** `<=` (expected + delta), with the arithmetic written into the generated code itself.

#### Safe to translate: variables & field access

| Bruno | Voiden | Notes |
|---|---|---|
| `bru.setVar`/`getVar` | `voiden.variables.set`/`get` | |
| `bru.getEnvVar` | `voiden.env.get` | `bru.setEnvVar` has no clean target (`voiden.env` is read-only) — approximated onto `voiden.variables.set` rather than left unrecognized, since dropping the whole script over one setter is a worse outcome than a labeled approximation. |
| `req.getUrl()`/`setUrl(v)`, `.getMethod()`/`setMethod(v)`, `.getBody()`/`setBody(v)` (pre-request) | `voiden.request.url`/`= v`, `.method`/`= v`, `.body`/`= v` | Method-based per Bruno's own JS reference. |
| `req.getHeader(n)`/`setHeader(n,v)` | `voiden.request.headers[n]` / `.push(...)` | The `push` target takes a `{key,value}` object, not Bruno's `(name, value)` pair — this is an approximate shape match, not identical calling convention. |
| `res.status`/`.getStatus()`, `.body`/`.getBody()`, `.getHeader(n)`, `.responseTime`/`.getResponseTime()` | `voiden.response.status`, `.body`, `.headers[n]`, `.time` | Both property and method forms are real Bruno syntax; both translate. |
| `console.log(...)` | `voiden.log(...)` | |

#### Safe to translate: assertions

| Bruno | Voiden | Notes |
|---|---|---|
| `test(name, function(){ ... })` wrapper | *(dropped — assertions become flat top-level `voiden.assert` calls)* | Bruno also allows bare top-level `expect(...)` with no `test()` wrapper at all (confirmed in the RealWorld/Conduit fixture) — translated the same way either way. The wrapper's `name` string isn't discarded when present, though — it's threaded through as the `message` argument on every `voiden.assert` call generated from statements inside that block. A bare `expect(...)` with no enclosing `test()` gets no message argument. |
| `expect(x).to.eql(y)` / `.equal(y)` / `.not.eql(y)` / `.not.equal(y)` | `voiden.assert(x, "==", y)` / `"==="` / `"!="` / `"!=="` | |
| `expect(x).to.be.above/below/at.least/at.most(y)` | `voiden.assert(x, ">"/"<"/">="/"<=", y)` | Also `.greaterThan`/`.lessThan`/`.gte`/`.lte` spellings. |
| `expect(x).to.be.within(min, max)` | `voiden.assert(x, ">=", min)` **and** `voiden.assert(x, "<=", max)` (two calls) | The negated form (`.to.not.within(...)`) does **not** translate — that's an OR of two conditions, which two independent `voiden.assert` calls can't express. |
| `expect(x).to.be.closeTo(expected, delta)` | `voiden.assert(x, ">=", expected-delta)` **and** `voiden.assert(x, "<=", expected+delta)` (two calls) | Same two-call shape as `.within`. |
| `expect(x).to.include/contain(y)` | `voiden.assert(x, "contains", y)` | |
| `expect(x).to.be.true/.ok` / `.to.be.false` | `voiden.assert(x, "truthy")` / `voiden.assert(x, "falsy")` | |
| `expect(x).to.be.null` / `.to.not.be.null` | `voiden.assert(x, "===", null)` / `voiden.assert(x, "!==", null)` | Strict — matches Chai's own strict `null` check exactly. |
| `expect(x).to.be.undefined` / `.to.not.be.undefined` | `voiden.assert(x, "===", undefined)` / `voiden.assert(x, "!==", undefined)` | |
| `expect(x).to.exist` / `.to.not.exist` | `voiden.assert(x, "!=", null)` / `voiden.assert(x, "==", null)` | Chai's `.exist` means "not null AND not undefined" — expressed exactly with **loose** `!=`/`==` against `null`. |
| `expect(x).to.be.a("string"\|"number"\|"boolean"\|"function"\|"undefined"\|"bigint"\|"symbol")` | `voiden.assert(typeof (x), "==", "typename")` | Only this exact allowlist of `typeof`-safe type names translates — `"array"`/`"object"`/`"null"`/`"date"` etc. do **not**, because `typeof` can't distinguish them. |
| `expect(x).to.have.lengthOf(n)` | `voiden.assert((x).length, "==", n)` | Exact for both strings and arrays. |
| `expect(x).to.be.oneOf([...])` | `voiden.assert([...], "contains", x)` | Sides swap — the options array becomes `actual`, the checked value becomes `expected`. |
| `expect(x).to.(not.)have.property(key)` | `voiden.assert((x)[key], "truthy")` / `voiden.assert((x)[key], "falsy")` | Approximated via truthiness of the bracket access, since there's no dedicated "has property" operator. Not exact — a property present but holding a falsy value (`0`, `""`, `false`) reads as "missing" — but right for the common case of checking a key exists on a JSON body. |
| `expect(x).to.match(/pattern/)` | `voiden.assert(x, "matches", "pattern")` | Only when the argument is a **literal, flag-less** regex — the delimiters and any flags get stripped when translating. |

**Never translate, always leave commented** — with the specific reason:

| Pattern | Why it doesn't translate |
|---|---|
| `.to.match(/pattern/i)` or any flagged regex, or `.to.match(aVariable)` | `voiden.assert`'s `"matches"` operator can't carry regex flags through, and a non-literal argument's `String(...)` form might include `/.../ ` delimiters that would corrupt the pattern. |
| `.to.not.be.within(...)` / `.to.not.match(...)` | Negating a range or regex check is an OR of two conditions — two independent `voiden.assert` calls can only express AND, not OR. |
| `.to.be.a("array")` / `.to.be.an("object")` / `.to.be.a("date")` | `typeof` can't distinguish arrays, plain objects, dates, or `null` from each other or from a generic object. |
| `.to.have.property("key", value)` (the two-argument form checking both existence *and* value) | Only the one-argument existence-check form translates; the truthy/falsy approximation doesn't capture an exact-value check. |
| `.to.have.keys(...)` / `.to.have.all.keys(...)` / `.to.have.members([...])` / `.to.include.members([...])` | Set-equality/membership across multiple values at once — no `voiden.assert` operator expresses this. |
| Bruno's own `jsonBody`/`jsonSchema` post-response assertions, `.to.throw(...)`, `.to.be.instanceOf(...)`, `.to.respondTo(...)`, `.to.satisfy(fn)`, `.to.change/increase/decrease(...)`, `.to.be.empty` | No `voiden.assert` equivalent, or the semantics can't be reduced to a single flat assertion (see the Postman/Insomnia skills' equivalent tables for the same reasoning per-matcher — it's identical since all three embed the same Chai library). |
| `bru.sendRequest`/`bru.runRequest`/`bru.runner.*` | No outbound-fetch or runner-flow-control primitive in `voiden.*` scripting. |
| A bare `res.body`/`req.getBody()` wrapped in `JSON.parse(...)` | Voiden's `voiden.response.body`/`voiden.request.body` are already parsed if JSON, so re-parsing would throw at runtime — this needs a human to resolve the mismatch. |
| Any control flow (`if`/`for`/`while`/`switch`), custom helper functions, or anything else not in a table above | Out of scope for a line-by-line mechanical translator — this isn't a JS parser. |

A `bru.*`/`req.*`/`res.*` call nested *inside* an assertion's expression (e.g. `expect(x).to.eql(bru.getVar("y"))` — a real pattern from the RealWorld/Conduit fixture) is fine — substitutions apply anywhere in an expression. But the reverse check matters too: if a captured expression still contains an untranslated call after substitution, that line — and therefore the whole script — must fall back to commented, not ship with a leftover reference inside otherwise-live code.

A plain `require('moment')`/`require('lodash')`-style call (Bruno itself bundles a set of npm packages for this) is **not** a reason to fall back — Voiden's JavaScript scripting engine runs each script in a real Node.js subprocess rooted at the active project directory, so `require(...)` resolves exactly as it would in any Node script, against that project's own `node_modules`. Leave it as-is when translating the rest of the script live; whether that specific package is actually installed is a normal runtime concern for the user, not a translation-safety one.

### Mapping a Bruno environment file to Voiden

An `environments/<name>.bru` file has no `meta{}` block — just `vars {}` (public) and/or `vars:secret [...]` (an array of *names*, no values — meant to be filled in locally). Parse with `@usebruno/lang`'s `bruToEnvJsonV2`, which returns a flat `{variables: [{name, value, enabled, secret}]}`. The environment's own name comes from its **filename**, not its content (e.g. `environments/Production.bru` → environment name `Production`).

Map into the base skill's Environment Variables YAML tree as one node named after the environment (this is exactly what `importBruEnvironment` does via Voiden's own `electron.env.extendEnvs` — the same call `postman-import` and `insomnia-importer`'s environment handling both use, so all three tools land on one canonical import shape): a flat `variables: {name: value}` map. `vars:secret` entries (empty value, meant to be filled in locally) go through the same node as everything else — there's no separate private-file target here, and Bruno's secret entries never carry a real value to protect anyway. Skip disabled (`enabled: false`) variables — Voiden's env YAML has no per-variable enabled flag to preserve that state in. Importing merges into the existing tree rather than overwriting it, so bringing in one Bruno environment never destroys others already in the project.

### Mapping an OpenCollection item to Voiden blocks

An OpenCollection export is a tree under `items[]` — each item is a folder (`info.type: "folder"`, itself holding a nested `items[]`) or a request of type `http`, `graphql`, `grpc`, or `websocket`. Standalone `app`/`script` items are out of scope (skip them, same "don't guess" policy as the `.bru` mapping's unsupported cases). Field names verified against the [OpenCollection type definitions](https://github.com/opencollection-dev/opencollection/tree/main/packages/oc-types/src) directly — the spec/schema *documentation* sites are JS-rendered viewers with no fetchable raw schema, so don't trust a scrape of those pages over this table.

**`http`-type items** (also covers `graphql`-type items — same fields, just under a `graphql` key instead of `http`, and body is `{query, variables}` instead of the `OcBody` union below):

| OpenCollection field | Voiden block | Notes |
|---|---|---|
| `http.method` + `http.url` | `request` (method + url) | Convert `:id` segments to `{id}` and strip the `?query` portion (query params come from `http.params` instead). Skipped for a `graphql`-type item — the endpoint lives in `gqlurl` instead. |
| `http.auth` | `auth` | The literal string `"inherit"` maps straight to Voiden's own `inherit` authType (same slot, per the base skill's singleton-auth rule); `"none"`/absent produces no auth block at all. Otherwise it's an object like `{type: "bearer", token}` — map each type's fields directly (`basic`/`bearer`/`apikey`/`digest`/`awsv4`/`ntlm`/`oauth1`/`oauth2`). `wsse` has no mapping — Voiden's auth block has no wsse slot. |
| `http.auth` where `type: "oauth1"` | `auth` (`authType: oauth1`) | Fields (`consumerKey`/`consumerSecret`/`accessToken`/`accessTokenSecret`/`signatureMethod`) map directly onto Voiden's 5 documented oauth1 fields. |
| `http.auth` where `type: "oauth2"` | `auth` (`authType: oauth2`) | Discriminated by `flow` (`client_credentials`/`resource_owner_password_credentials`/`authorization_code`/`implicit`) — maps onto Voiden's 4 oauth2 grant types (`resource_owner_password_credentials`→Voiden's `password`). `credentials.clientId`/`clientSecret` and (for `authorization_code`/`implicit`) `authorizationUrl`/`accessTokenUrl`/`callbackUrl`/`state` carry over; populate both the row table and `oauth2Config` — see `voiden-advanced-auth`'s skill. |
| `http.headers[]` (where `disabled` is not `true`) | `headers-table` | Row: `[name, value]`. |
| `http.params[]` where `type: "path"` | `path-table` | OpenCollection gives the definitive path-param list directly, same as classic `.bru`'s `params:path`. |
| `http.params[]` where `type: "query"` and `disabled` is not `true` | `query-table` | |
| `http.body` where `type: "json"` | `json_body` | Body value is under `data`, e.g. `body: {type: "json", data: "..."}`. |
| `http.body` where `type: "xml"` | `xml_body` | |
| `http.body` where `type: "text"` or `"sparql"` | `json_body` with a text content type | `sparql` is best-effort only — no native SPARQL block exists. |
| `http.body` where `type: "form-urlencoded"` | `url-table` | From `body.data[]` (where `disabled` is not `true`). |
| `http.body` where `type: "multipart-form"` | `multipart-table` | From `body.data[]`; a `type: "file"` entry's `value` path becomes a `fileLink` attachment if it still exists on disk. |
| `http.body` where `type: "file"` | `restFile` | Placeholder only — Voiden can't embed binary content. |
| `graphql.body.query` / `graphql.body.variables` | `gqlquery` + `gqlvariables` | Same container shape as the `.bru`/Postman mapping. |
| `runtime.assertions[]` (`{expression, operator, value, disabled}`) | `assertions-table` | Declarative, safe to map directly like `.bru`'s `assert{}` — same operator table (`eq`→`equals`, `neq`→`not-equals`, etc.), strip a leading `res.` from `expression` for the field column. **Caveat**: unlike the `.bru` mapping (verified by actually running `bruToJsonV2` against real files), no real populated example of this field was available to confirm `expression` always carries the `res.`/`req.` prefix convention — treat this mapping as best-effort and double-check a converted assertion's field/operator against the source before trusting it blindly. |
| `runtime.scripts[]` (`{type: "before-request"\|"after-response"\|"tests", code}`) | `pre_script` (from `before-request`) / `post_script` (from `after-response` + `tests`, concatenated) | Same translate-or-comment policy as the `.bru` path — see "Translating bru.*/expect scripts" below (OpenCollection's script code uses the identical bare `expect()`/`test()` syntax, so the same rules apply verbatim). |
| `runtime.variables[]` (`{name, value, disabled}`) | folded into `pre_script`'s comment as `bru.setVar(name, value);` pseudocode | No capture-expression/scope field here (unlike `.bru`'s `vars:post-response`), so these read as static per-request overrides, not response captures — nothing to promote into `runtime-variables` automatically. |

**`grpc`-type items**:

| OpenCollection field | Voiden block | Notes |
|---|---|---|
| `grpc.url` | `socket-request` > `smethod` (`GRPCS` if `grpcs://`, else `GRPC`) + `surl` | |
| `grpc.protoFilePath` | `proto.filePath`/`proto.fileName` (basename) | `proto.services` stays `[]` for the app to populate. |
| `grpc.method` (e.g. `"user.UserService/GetUser"`) | `proto.selectedService` + `proto.selectedMethod` | Split on `/` when present. |
| `grpc.methodType` (`unary`\|`client-streaming`\|`server-streaming`\|`bidi-streaming`) | `proto.callType` | Normalize hyphens to underscores; `bidi-streaming`→`bidirectional_streaming` specifically. |
| `grpc.metadata[]`, `grpc.message` | *(no mapping — see "What has no Voiden target" above)* | |

**`websocket`-type items**:

| OpenCollection field | Voiden block | Notes |
|---|---|---|
| `websocket.url` | `socket-request` > `smethod` (`WSS` if `wss://`, else `WS`) + `surl` | |
| `websocket.headers[]`, `websocket.message` | *(no mapping — see "What has no Voiden target" above)* | Unlike `.bru`'s ws requests, OpenCollection's websocket items do carry a `headers[]` field, but `socket-request` has no headers-table slot to put it in either way. |

### Placing a section's documentation

A heading meant to describe an upcoming section (e.g. `## Create Article`) must go **after** that section's `request-separator`, never before — content before a separator belongs to the section that *precedes* it. Default to the separator's own `label` for naming the section; only add prose after it for something the label can't convey (auth requirements, expected status codes).
