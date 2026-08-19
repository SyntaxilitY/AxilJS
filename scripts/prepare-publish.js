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
  'cli':           'AxilJS CLI — axil create, run, build, test, deploy, doctor',
  'studio':        'Browser-based dev studio that opens automatically when axil run is used'
}

const packages = fs.readdirSync(PACKAGES_DIR)

let updated = 0

for (const pkg of packages) {
  const pkgPath = path.join(PACKAGES_DIR, pkg, 'package.json')

  if (!fs.existsSync(pkgPath)) continue

  const pkgJson = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))

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
  fs.writeFileSync(pkgPath, JSON.stringify(pkgJson, null, 2) + '\n', 'utf-8')

  console.log(`  ✓ Updated ${pkgJson.name}`)
  updated++
}

console.log(`\n  ${updated} packages prepared for publish.\n`)