#!/usr/bin/env node
import { readFileSync, existsSync, mkdirSync, copyFileSync, rmSync, writeFileSync } from 'fs'
import { execSync } from 'child_process'
import { join, resolve } from 'path'

const manifest = JSON.parse(readFileSync('./manifest.json', 'utf8'))
const pluginId = manifest.id

// Verify the renderer bundle was built
const mainSrc = `dist/${pluginId}.js`
if (!existsSync(mainSrc)) {
  console.error(`\n  Error: dist/${pluginId}.js not found. Run \`npm run build\` first.\n`)
  process.exit(1)
}

// Stage files into a temp dir so zip -j (junk paths) isn't needed
const staging = resolve(`dist/__staging__`)
if (existsSync(staging)) rmSync(staging, { recursive: true, force: true })
mkdirSync(staging, { recursive: true })

// Required: {id}.js
copyFileSync(mainSrc, join(staging, `${pluginId}.js`))

// manifest.json — embed local icon files as base64 data URLs before staging
const manifestForZip = { ...manifest }
if (manifestForZip.icon && !manifestForZip.icon.startsWith('http') && !manifestForZip.icon.startsWith('data:')) {
  const iconPath = resolve(manifestForZip.icon)
  if (existsSync(iconPath)) {
    const iconExt = iconPath.split('.').pop().toLowerCase()
    const mime = iconExt === 'svg' ? 'image/svg+xml' : (iconExt === 'jpg' || iconExt === 'jpeg') ? 'image/jpeg' : `image/${iconExt}`
    manifestForZip.icon = `data:${mime};base64,` + readFileSync(iconPath).toString('base64')
  }
}
writeFileSync(join(staging, 'manifest.json'), JSON.stringify(manifestForZip, null, 2))

// Optional: skill.md
if (existsSync('src/skill.md')) {
  copyFileSync('src/skill.md', join(staging, 'skill.md'))
}

// Optional: changelog.json
if (existsSync('changelog.json')) {
  copyFileSync('changelog.json', join(staging, 'changelog.json'))
}

// Optional: main-process bundle — keep exact build output name
const mainProcessSrc = `dist/${pluginId}-main.cjs`
if (existsSync(mainProcessSrc)) {
  copyFileSync(mainProcessSrc, join(staging, `${pluginId}-main.cjs`))
}

// Create the zip
const outZip = resolve(`dist/${pluginId}.zip`)
if (existsSync(outZip)) rmSync(outZip)

try {
  execSync(`zip -r "${outZip}" .`, { cwd: staging, stdio: 'inherit' })
} catch {
  console.error('\n  Error: zip command failed. Make sure zip is installed.\n')
  process.exit(1)
} finally {
  rmSync(staging, { recursive: true, force: true })
}

const sizeKb = (readFileSync(outZip).length / 1024).toFixed(1)
console.log(`
  ✓ dist/${pluginId}.zip  (${sizeKb} kB)

  To install in Voiden:
    Extensions → ⋯ → Install from file → select dist/${pluginId}.zip
`)
