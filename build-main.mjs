#!/usr/bin/env node
import { build } from 'esbuild'
import { existsSync, readFileSync } from 'fs'

const manifest = JSON.parse(readFileSync('./manifest.json', 'utf8'))
const pluginId = manifest.id
const entry = './src/main-process.ts'

if (!existsSync(entry)) {
  console.log('No main-process.ts found — skipping')
  process.exit(0)
}

await build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: `dist/${pluginId}-main.cjs`,
  external: [
    'electron',
    'node:*',
    'child_process', 'fs', 'path', 'os', 'http', 'https', 'net', 'crypto',
    'worker_threads', 'stream', 'events', 'util', 'url', 'buffer',
    '@voiden/sdk',
  ],
  minify: true,
})
console.log(`Built dist/${pluginId}-main.cjs`)
