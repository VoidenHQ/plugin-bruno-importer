# Bruno Collection Importer — Voiden Plugin

A [Voiden](https://voiden.md) plugin that imports **Bruno (usebruno.com)** exports directly into your Voiden workspace. It handles three different Bruno file shapes:

1. **A single classic `.bru` request file** — Bruno's native on-disk format, one request per file. Covers HTTP, GraphQL, gRPC, and WebSocket requests. Import produces one `.void` file.
2. **A Bruno environment file** (`environments/<name>.bru`) — imports its variables into Voiden's own `env-public.yaml`/`env-private.yaml` tree, merged with any existing environments.
3. **A whole OpenCollection YAML/JSON export** — the output of Bruno 3.0+'s **Export Collection** button (this is what most users reach for today). It's an entire folder/request tree in one file, closer in shape to a Postman/Insomnia export. Import walks the tree and produces many `.void` files + matching folders.

## What it does

- Parses a classic `.bru` file with [`@usebruno/lang`](https://www.npmjs.com/package/@usebruno/lang) (the official Bruno parser — `bruToJsonV2`/`bruToEnvJsonV2`), or an OpenCollection YAML/JSON export with `js-yaml`
- Converts method/url, headers, query/path params, and body (JSON/XML/text/form-urlencoded/multipart/file/GraphQL, depending on format) into the matching `.void` block types
- Converts a gRPC request into a `socket-request` block wired to its `.proto` file, method, and streaming type; a WebSocket request into a `socket-request` block (url + protocol) — request metadata and any pre-authored message payload have no Voiden equivalent and aren't carried over (Voiden's socket blocks are connection info only; sending/recording messages happens live in the app)
- Converts a declarative assertion block (`.bru`'s `assert {}`, or OpenCollection's `runtime.assertions[]`) into a live `assertions-table` block
- Converts auth (basic/bearer/apikey/digest/awsv4/ntlm/oauth1/oauth2 — all 4 oauth2 grant types, plus `inherit`) into a native `auth` block
- Imports a Bruno environment's variables into Voiden's environment YAML tree — secrets go to the private file
- Imports pre-request/post-response scripts and variables as commented-out `pre_script`/`post_script` blocks for manual review — neither format's scripting API translates safely to Voiden's automatically
- Sanitizes output file/folder names for filesystem compatibility

## Which format am I looking at?

Bruno's on-disk classic format is `bruno.json` plus a folder tree of individual `.bru` files. An environment file lives under `environments/` and has no `meta{}` block — just `vars{}`/`vars:secret[]`. An OpenCollection export (from **Export Collection** in the Bruno app) is a single `.yml`/`.yaml`/`.json` file with a top-level `opencollection: <version>` key. This plugin's button auto-detects which of the three you've opened.

`src/skill.md` teaches an AI agent a different path from the button — generating `.void` files directly from any of these raw formats, by default grouping CRUD-shaped sibling requests into one multi-section file instead of one file per request.

## Supported body types

| Format's body type | Voiden block |
|---|---|
| `.bru` `body:json` / OpenCollection `{type: "json"}` | `json_body` |
| `.bru` `body:xml` / OpenCollection `{type: "xml"}` | `xml_body` |
| `.bru` `body:text` / OpenCollection `{type: "text"}` | `json_body` (text content type) |
| `.bru` `body:sparql` / OpenCollection `{type: "sparql"}` | `json_body` (text content type) — best-effort, no native SPARQL block |
| `.bru` `body:form-urlencoded` / OpenCollection `{type: "form-urlencoded"}` | `url-table` |
| `.bru` `body:multipart-form` / OpenCollection `{type: "multipart-form"}` | `multipart-table` (file fields resolved as `fileLink` when the file exists locally) |
| `.bru` `body:file` / OpenCollection `{type: "file"}` | `restFile` placeholder |
| `.bru`'s graphql-typed requests / OpenCollection's `graphql` item type | `gqlquery` / `gqlvariables` |
| `.bru`'s grpc-typed requests / OpenCollection's `grpc` item type | `socket-request` (connection only — see above) |
| `.bru`'s ws-typed requests / OpenCollection's `websocket` item type | `socket-request` (connection only — see above) |

## Requirements

- Voiden `>=2.0.0`
- `voiden-rest-api` extension (must be loaded before this plugin)
- `simple-assertions` extension (optional — needed to render the `assertions-table` block)
- `voiden-graphql` extension (optional — needed to render `gqlquery`/`gqlvariables`)
- `voiden-sockets-grpcs` extension (optional — needed to render `socket-request`/`proto`)
- `voiden-advanced-auth` extension (optional — needed to render OAuth1/OAuth2 `auth` blocks)

## Usage

1. Open a Bruno `.bru` request/environment file, or a whole OpenCollection `.yml`/`.yaml`/`.json` export, in Voiden.
2. At the top right corner, you'll see **Import into Voiden**.
3. For a `.bru` request file: the plugin creates one `.void` file with the same name as the request, in your active project. For an environment file: it merges the variables into `.voiden/env-public.yaml`/`env-private.yaml`. For an OpenCollection export: the plugin recreates the folder/request tree under your active project, with progress tracking since it can produce many files.

## Building

```bash
npm install
npm run build
npm run zip   # produces dist/bruno-importer.zip — install via Extensions → ⋯ → Install from file
```
