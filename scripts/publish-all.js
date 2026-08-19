/**
 * Publish all AxilJS packages to npm.
 * Uses automation token to bypass 2FA.
 * Windows-safe — copies to C:\axiljs-tmp
 *
 * Run: node scripts/publish-all.js
 */

const { spawnSync } = require('child_process')
const path = require('path')
const fs   = require('fs')

const ORDER = [
  'common', 'config', 'security', 'pm', 'orm', 'auth',
  'validation', 'core', 'testing', 'events', 'websocket',
  'queue', 'circuit', 'observability', 'ai', 'cloud', 'memory', 'cli', 'studio'
]

const PACKAGES_DIR = path.join(__dirname, '..', 'packages')
const TEMP_BASE    = 'C:\\axiljs-tmp'

// ─── Get token ────────────────────────────────────────────────────────────────

const NPM_TOKEN = process.env.NPM_TOKEN || (() => {
  // Try to read from .npmrc in project root
  const npmrcPath = path.join(__dirname, '..', '.npmrc')
  if (fs.existsSync(npmrcPath)) {
    const content = fs.readFileSync(npmrcPath, 'utf-8')
    const match   = content.match(/_authToken=(.+)/)
    if (match) return match[1].trim()
  }
  return null
})()

// ─── Helpers ──────────────────────────────────────────────────────────────────

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name === 'node_modules') continue
    if (entry.name === '.git') continue
    const srcPath  = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) copyDir(srcPath, destPath)
    else fs.copyFileSync(srcPath, destPath)
  }
}

function removeDir(dir) {
  if (!fs.existsSync(dir)) return
  try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
}

// Write .npmrc with token inside the temp package directory
function writeNpmrc(dir, token) {
  const content = `//registry.npmjs.org/:_authToken=${token}\n`
  fs.writeFileSync(path.join(dir, '.npmrc'), content, 'utf-8')
}

// ─── Publish single package ────────────────────────────────────────────────────

function publishPkg(pkg, token) {
  const pkgDir  = path.join(PACKAGES_DIR, pkg)
  const pkgJson = JSON.parse(
    fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf-8')
  )

  process.stdout.write(`  Publishing ${pkgJson.name}@${pkgJson.version}... `)

  // Copy to temp directory (no spaces in path)
  const tempDir = path.join(TEMP_BASE, pkg)
  try {
    copyDir(pkgDir, tempDir)
  } catch (err) {
    console.log('\x1b[31mFAILED (copy)\x1b[0m')
    return false
  }

  // Write .npmrc with auth token inside the temp dir
  if (token) {
    writeNpmrc(tempDir, token)
  }

  // Publish
  const result = spawnSync(
    'npm',
    ['publish', '--access', 'public'],
    {
      cwd:      tempDir,
      encoding: 'utf-8',
      shell:    true,
      stdio:    ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        // Also pass token via environment variable
        NPM_TOKEN: token || process.env.NPM_TOKEN || ''
      }
    }
  )

  removeDir(tempDir)

  const stdout   = (result.stdout || '').trim()
  const stderr   = (result.stderr || '').trim()
  const combined = stdout + '\n' + stderr
  const exitCode = result.status

  // Already published
  if (
    combined.includes('already exists') ||
    combined.includes('cannot publish over') ||
    combined.includes('previously published')
  ) {
    console.log('\x1b[33mskipped (already published)\x1b[0m')
    return true
  }

  // Success
  if (exitCode === 0) {
    console.log('\x1b[32mdone\x1b[0m')
    return true
  }

  // Failed
  console.log('\x1b[31mFAILED\x1b[0m')
  const errLines = stderr
    .split('\n')
    .filter(l => l.includes('npm error') || l.includes('ERR!'))
    .join('\n  ')
  if (errLines) console.log('  ' + errLines)

  return false
}

// ─── Main ─────────────────────────────────────────────────────────────────────

if (!NPM_TOKEN) {
  console.error('\n  Error: No npm token found.')
  console.error('  Set it with:')
  console.error('    $env:NPM_TOKEN = "npm_your_token_here"')
  console.error('  Or add to .npmrc:')
  console.error('    //registry.npmjs.org/:_authToken=npm_your_token_here\n')
  process.exit(1)
}

if (!fs.existsSync(TEMP_BASE)) {
  fs.mkdirSync(TEMP_BASE, { recursive: true })
}

console.log('\n  Publishing AxilJS packages to npm...')
console.log('  Temp dir: C:\\axiljs-tmp')
console.log(`  Token: ${NPM_TOKEN.slice(0, 10)}...\n`)

let success  = 0
let failed   = 0
const failedPkgs = []

for (const pkg of ORDER) {
  const ok = publishPkg(pkg, NPM_TOKEN)
  if (ok) success++
  else {
    failed++
    failedPkgs.push(pkg)
  }
}

removeDir(TEMP_BASE)

// Summary
console.log('')
console.log('─'.repeat(50))
console.log(`  Published: \x1b[32m${success}\x1b[0m`)
console.log(`  Failed:    \x1b[31m${failed}\x1b[0m`)
console.log('─'.repeat(50))

if (failedPkgs.length > 0) {
  console.log('\n  Failed:')
  failedPkgs.forEach(p => console.log(`    \x1b[31m✗\x1b[0m @axiljs/${p}`))
  console.log('\n  Retry: node scripts/publish-all.js')
}

if (failed === 0) {
  console.log('')
  console.log('  \x1b[32m✓ All packages published!\x1b[0m')
  console.log('')
  console.log('  npm install @axiljs/core')
  console.log('  npm install -g @axiljs/cli')
  console.log('')
  console.log('  https://www.npmjs.com/org/axiljs')
}

console.log('')