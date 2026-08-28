# Bruno Collection Importer — Voiden Plugin

A [Voiden](https://voiden.md) plugin that imports **Bruno (usebruno.com)** exports directly into your Voiden workspace. It handles two different Bruno export shapes:

1. **A single classic `.bru` request file** — Bruno's native on-disk format, one request per file. Import produces one `.void` file.
2. **A whole OpenCollection YAML/JSON export** — the output of Bruno 3.0+'s **Export Collection** button (this is what most users reach for today). It's an entire folder/request tree in one file, closer in shape to a Postman/Insomnia export. Import walks the tree and produces many `.void` files + matching folders.

## What it does

- Parses a classic `.bru` file with [`@usebruno/lang`](https://www.npmjs.com/package/@usebruno/lang) (the official Bruno parser — `bruToJsonV2`), or an OpenCollection YAML/JSON export with `js-yaml`
- Converts method/url, headers, query/path params, and body (JSON/XML/text/form-urlencoded/multipart/file/GraphQL, depending on format) into the matching `.void` block types
- Converts a declarative assertion block (`.bru`'s `assert {}`, or OpenCollection's `runtime.assertions[]`) into a live `assertions-table` block
- Converts auth (basic/bearer/apikey/digest/awsv4/ntlm, plus `inherit`) into a native `auth` block
- Imports pre-request/post-response scripts and variables as commented-out `pre_script`/`post_script` blocks for manual review — neither format's scripting API translates safely to Voiden's automatically
- Sanitizes output file/folder names for filesystem compatibility

## Which format am I looking at?

Bruno's on-disk classic format is `bruno.json` plus a folder tree of individual `.bru` files. An OpenCollection export (from **Export Collection** in the Bruno app) is a single `.yml`/`.yaml`/`.json` file with a top-level `opencollection: <version>` key — that key is the reliable way to tell them apart. This plugin's button auto-detects which one you've opened.

`src/skill.md` teaches an AI agent a different path from the button — generating `.void` files directly from either raw format, by default grouping CRUD-shaped sibling requests into one multi-section file instead of one file per request.

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
| `.bru` `body:graphql` | `gqlquery` / `gqlvariables` (OpenCollection models GraphQL as a separate item type, not a body mode — not yet supported for that format) |

## Requirements

- Voiden `>=2.0.0`
- `voiden-rest-api` extension (must be loaded before this plugin)
- `simple-assertions` extension (optional — needed to render the `assertions-table` block)
- `voiden-graphql` extension (optional — needed to render `gqlquery`/`gqlvariables`, classic `.bru` format only)

## Usage

1. Open a Bruno `.bru` request file, or a whole OpenCollection `.yml`/`.yaml`/`.json` export, in Voiden.
2. At the top right corner, you'll see **Import into Voiden**.
3. For a `.bru` file: the plugin creates one `.void` file with the same name as the request, in your active project. For an OpenCollection export: the plugin recreates the folder/request tree under your active project, with progress tracking since it can produce many files.

## Building

```bash
npm install
npm run build
npm run zip   # produces dist/bruno-importer.zip — install via Extensions → ⋯ → Install from file
```
