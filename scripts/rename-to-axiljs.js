/**
 * Rename all packages from @axiljs/* to @axiljsjs/*
 * Run: node scripts/rename-to-axiljs.js
 */

const fs   = require('fs')
const path = require('path')

const PACKAGES_DIR = path.join(__dirname, '..', 'packages')
const SRC_DIRS     = [
  path.join(__dirname, '..', 'packages'),
  path.join(__dirname, '..', 'examples', 'src')
]

// ─── Step 1: Rename all package.json name fields ──────────────────────────────

const packages = fs.readdirSync(PACKAGES_DIR)

console.log('\n  Renaming package.json files...\n')

for (const pkg of packages) {
  const pkgPath = path.join(PACKAGES_DIR, pkg, 'package.json')
  if (!fs.existsSync(pkgPath)) continue

  let content = fs.readFileSync(pkgPath, 'utf-8')

  // Replace all @axiljs/ references with @axiljsjs/
  content = content.replace(/@axiljs\//g, '@axiljsjs/')

  fs.writeFileSync(pkgPath, content, 'utf-8')
  console.log(`  ✓ ${pkg}/package.json`)
}

// ─── Step 2: Rename root package.json ────────────────────────────────────────

const rootPkg = path.join(__dirname, '..', 'package.json')
let rootContent = fs.readFileSync(rootPkg, 'utf-8')
rootContent = rootContent.replace(/@axiljs\//g, '@axiljsjs/')
fs.writeFileSync(rootPkg, rootContent, 'utf-8')
console.log(`  ✓ root/package.json`)

// ─── Step 3: Update all source .ts files ─────────────────────────────────────

console.log('\n  Updating TypeScript source files...\n')

function updateDir(dir) {
  if (!fs.existsSync(dir)) return

  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      updateDir(fullPath)
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.js') || entry.name.endsWith('.json') || entry.name.endsWith('.md')) {
      let content = fs.readFileSync(fullPath, 'utf-8')

      if (content.includes('@axiljs/')) {
        content = content.replace(/@axiljs\//g, '@axiljsjs/')
        fs.writeFileSync(fullPath, content, 'utf-8')
        console.log(`  ✓ ${path.relative(path.join(__dirname, '..'), fullPath)}`)
      }
    }
  }
}

for (const dir of SRC_DIRS) {
  updateDir(dir)
}

// Also update examples package.json
const examplesPkg = path.join(__dirname, '..', 'examples', 'package.json')
if (fs.existsSync(examplesPkg)) {
  let content = fs.readFileSync(examplesPkg, 'utf-8')
  content = content.replace(/@axiljs\//g, '@axiljsjs/')
  fs.writeFileSync(examplesPkg, content, 'utf-8')
  console.log(`  ✓ examples/package.json`)
}

// Update docs site if exists
const docsDir = path.join(__dirname, '..', 'restjs-docs')
if (fs.existsSync(docsDir)) {
  updateDir(docsDir)
}

console.log('\n  All references renamed from @axiljs/ to @axiljsjs/\n')