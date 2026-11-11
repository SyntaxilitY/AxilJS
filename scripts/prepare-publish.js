/**
 * Prepare all packages for npm publish.
 * Adds publishConfig, repository, author, license to all package.json files.
 *
 * Run: node scripts/prepare-publish.js
 */

const fs   = require('fs')
const path = require('path')

const PACKAGES_DIR = path.join(__dirname, '..', 'packages')

const shared = {
  publishConfig: { access: 'public' },
  repository: {
    type: 'git',
    url:  'https://github.com/SyntaxilitY/AxilJS.git'
  },
  homepage: 'https://github.com/SyntaxilitY/AxilJS#readme',
  bugs:     { url: 'https://github.com/SyntaxilitY/AxilJS/issues' },
  author:   'Tariq Mehmood <tariq@syntaxility.dev>',
  license:  'MIT',
  keywords: ['axiljs', 'backend', 'javascript', 'typescript', 'nodejs']
}

const descriptions = {
  'common':        'AxilJS shared types, interfaces, and error classes',
  'core':          'AxilJS HTTP server, router, middleware, and built-in response manager',
  'config':        'AxilJS environment loading and typed configuration validation',
  'security':      'AxilJS security middleware — helmet, rate limiting, CSRF, sanitization',
  'orm':           'AxilJS ORM — PostgreSQL, MySQL, SQLite with migrations and query builder',
  'auth':          'AxilJS JWT authentication, password hashing, and RBAC',
  'validation':    'AxilJS schema-based request validation',
  'testing':       'AxilJS test runner, assertions, and HTTP test client',
  'events':        'AxilJS in-process event bus with pub/sub and wildcard support',
  'websocket':     'AxilJS RFC 6455 WebSocket server with rooms and broadcasting',
  'queue':         'AxilJS message queue, cron scheduler, and retry with backoff',
  'circuit':       'AxilJS circuit breaker, retry utilities, and timeout wrapper',
  'observability': 'AxilJS logging, Prometheus metrics, distributed tracing, and health checks',
  'ai':            'AxilJS AI platform — OpenAI, Anthropic, Gemini, Ollama, RAG, agents, MCP',
  'cloud':         'AxilJS enterprise — multi-tenancy, audit logs, feature flags, deployment',
  'memory':        'AxilJS memory leak detection, GC optimization, and monitoring',
  'pm':            'AxilJS package manager with lock file and checksum verification',
  'cli':           'AxilJS CLI — axil create, run, build, test, deploy, capacity, doctor',
  'studio':        'Browser-based dev studio that opens automatically when axil run is used',
  'decorator':     'AxilJS semantic t-prefixed decorators that record intent as metadata',
  'runtime':       'AxilJS runtime: request context and interceptors that execute decorator metadata',
  'scale':         'AxilJS scaling: cluster mode, capacity planner, load generator and readiness checks'
}

/**
 * Write a file in place. On Windows, fs.writeFileSync() fails with EPERM on
 * files that have the Hidden attribute (it opens them with CREATE_ALWAYS);
 * opening the existing file read/write and truncating works.
 */
function writeInPlace(file, content) {
  if (!fs.existsSync(file)) return fs.writeFileSync(file, content, 'utf-8')
  const fd = fs.openSync(file, 'r+')
  try {
    fs.ftruncateSync(fd, 0)
    fs.writeSync(fd, content, 0, 'utf-8')
  } finally {
    fs.closeSync(fd)
  }
}

// `node scripts/prepare-publish.js bump 0.3.3`: set every package (and the
// root) to that version and point internal @axiljs/* ranges at it.
const [mode, nextVersion] = process.argv.slice(2)
if (mode === 'bump' && !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(nextVersion || '')) {
  console.error('\n  Usage: node scripts/prepare-publish.js bump <version>   e.g. bump 0.3.3\n')
  process.exit(1)
}
if (mode && mode !== 'bump') {
  console.error(`\n  Unknown mode "${mode}". Use no argument, or: bump <version>\n`)
  process.exit(1)
}

const packages = fs.readdirSync(PACKAGES_DIR)

let updated = 0

for (const pkg of packages) {
  const pkgPath = path.join(PACKAGES_DIR, pkg, 'package.json')

  if (!fs.existsSync(pkgPath)) continue

  const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))

  if (mode === 'bump') {
    pkgJson.version = nextVersion
    for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      for (const dep of Object.keys(pkgJson[field] || {})) {
        if (dep.startsWith('@axiljs/')) pkgJson[field][dep] = `^${nextVersion}`
      }
    }
  }

  // Add shared fields
  Object.assign(pkgJson, shared)

  // Add description if available
  if (descriptions[pkg]) {
    pkgJson.description = descriptions[pkg]
  }

  // Add files field if not present
  if (!pkgJson.files) {
    pkgJson.files = ['dist', 'README.md']
  }

  // Write back
  writeInPlace(pkgPath, JSON.stringify(pkgJson, null, 2) + '\n')

  console.log(`  ✓ Updated ${pkgJson.name}${mode === 'bump' ? ` → ${nextVersion}` : ''}`)
  updated++
}

if (mode === 'bump') {
  const rootPath = path.join(__dirname, '..', 'package.json')
  const root = JSON.parse(fs.readFileSync(rootPath, 'utf-8'))
  root.version = nextVersion
  writeInPlace(rootPath, JSON.stringify(root, null, 2) + '\n')
  console.log(`  ✓ Updated root package.json → ${nextVersion}`)
}

console.log(`\n  ${updated} packages prepared for publish.\n`)