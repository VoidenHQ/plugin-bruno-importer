# Bruno Collection Importer — Voiden Plugin

A [Voiden](https://voiden.md) plugin that imports a **Bruno (usebruno.com) `.bru` HTTP request file** directly into your Voiden workspace. It mirrors the same experience as the Postman/Insomnia importers, but at Bruno's own granularity: one request file in, one `.void` file out.

## What it does

- Parses a `.bru` request file with [`@usebruno/lang`](https://www.npmjs.com/package/@usebruno/lang) (the official Bruno parser — `bruToJsonV2`) and converts it into a `.void` file with the correct block types — `request`, `auth`, `headers-table`, `query-table`, `path-table`, `json_body`, `xml_body`, `url-table`, `multipart-table`, `restFile`, `gqlquery`/`gqlvariables`, and `assertions-table`
- Converts Bruno's declarative `assert {}` block into a live `assertions-table` block
- Converts Bruno's `auth:basic`/`auth:bearer`/`auth:apikey`/`auth:digest`/`auth:awsv4`/`auth:ntlm` blocks into a native `auth` block
- Imports `script:pre-request`/`script:post-response` and `vars:pre-request`/`vars:post-response` as commented-out `pre_script`/`post_script` blocks for manual review
- Sanitizes the output file name for filesystem compatibility

## Why one file at a time

Bruno stores a collection as `bruno.json` plus a folder tree of individual `.bru` files — there's no single exported blob the way Postman/Insomnia export a whole collection to one JSON/YAML file. Voiden's import plugins work by sniffing the content of a tab you already have open, so this button's UX matches Bruno's own granularity: open one `.bru` request file, click **Import into Voiden**, get one `.void` file. `src/skill.md` teaches an AI agent a different path — generating `.void` files directly from a whole folder of `.bru` files, grouping CRUD-shaped siblings into one multi-section file instead of one file per request.

## Supported body types

| Bruno body mode | Voiden block |
|---|---|
| `json` | `json_body` |
| `xml` | `xml_body` |
| `text` | `json_body` (text content type) |
| `sparql` | `json_body` (text content type) — best-effort, no native SPARQL block |
| `formUrlEncoded` | `url-table` |
| `multipartForm` | `multipart-table` (file fields resolved as `fileLink` when the file exists locally) |
| `file` | `restFile` placeholder |
| `graphql` | `gqlquery` / `gqlvariables` |

## Requirements

- Voiden `>=2.0.0`
- `voiden-rest-api` extension (must be loaded before this plugin)
- `simple-assertions` extension (optional — needed to render the `assertions-table` block)
- `voiden-graphql` extension (optional — needed to render `gqlquery`/`gqlvariables`)

## Usage

1. Open a Bruno request's `.bru` file (e.g. from `bruno-collection/articles/create-article.bru`) in Voiden.
2. At the top right corner, you'll see **Import into Voiden**.
3. The plugin creates a `.void` file with the same name as the request, in your active project.

## Building

```bash
npm install
npm run build
npm run zip   # produces dist/bruno-importer.zip — install via Extensions → ⋯ → Install from file
```
