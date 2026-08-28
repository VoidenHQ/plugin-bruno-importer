#!/usr/bin/env node
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { resolve } from 'path'

const manifest = JSON.parse(readFileSync('./manifest.json', 'utf8'))
const out = { ...manifest }

if (out.icon && !out.icon.startsWith('http') && !out.icon.startsWith('data:')) {
  const iconPath = resolve(out.icon)
  if (existsSync(iconPath)) {
    const ext = iconPath.split('.').pop().toLowerCase()
    const mime = ext === 'svg' ? 'image/svg+xml' : (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : `image/${ext}`
    out.icon = `data:${mime};base64,` + readFileSync(iconPath).toString('base64')
    console.log(`Inlined icon as base64 (${mime})`)
  } else {
    console.warn(`Warning: icon file not found at ${iconPath} — icon will be missing in community installs`)
  }
}

mkdirSync('dist', { recursive: true })
writeFileSync('dist/manifest.json', JSON.stringify(out, null, 2))
console.log(`Manifest ready: ${out.id} v${out.version} → dist/manifest.json`)
