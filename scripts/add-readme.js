/**
 * Add README.md to each package.
 * Run: node scripts/add-readme.js
 */

const fs   = require('fs')
const path = require('path')

const packagesDir = path.join(__dirname, '..', 'packages')

// ─── Only get actual directories, skip files like .npmignore ─────────────────

const packages = fs.readdirSync(packagesDir, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => entry.name)

// ─── README content per package ───────────────────────────────────────────────

const readmes = {
  common: `# @axiljs/common

Shared types, interfaces, and error classes for the AxilJS ecosystem.

Part of the [AxilJS](https://github.com/SyntaxilitY/AxilJS) ecosystem.

## Install

\`\`\`bash
npm install @axiljs/common
\`\`\`

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
`,

  core: `# @axiljs/core

HTTP server, router, middleware, SSE, static files, and built-in SyntaxilitY response manager.

Part of the [AxilJS](https://github.com/SyntaxilitY/AxilJS) ecosystem.

## Install

\`\`\`bash
npm install @axiljs/core
\`\`\`

## Usage

\`\`\`typescript
import { Application, cors } from '@axiljs/core'

const app = new Application()

app.get('/users', (req, res) => {
  res.success(users, 'Users fetched')
})

app.post('/users', (req, res) => {
  res.created(req.body, 'User created')
})

app.listen()
\`\`\`

## Built-in Response Manager

Every \`res\` object includes SyntaxilitY API Response Manager — no imports needed:

\`\`\`typescript
res.success(data, 'message')               // 200 OK
res.created(data, 'message')               // 201 Created
res.paginated(items, total, page, limit)   // 200 with pagination metadata
res.noContent()                            // 204 No Content
res.badRequest('message')                  // 400 Bad Request
res.unauthorized('message')                // 401 Unauthorized
res.forbidden('message')                   // 403 Forbidden
res.notFound('message')                    // 404 Not Found
res.conflict('message')                    // 409 Conflict
res.validationError('message')             // 422 Unprocessable Entity
res.tooManyRequests('message')             // 429 Too Many Requests
res.serverError('message')                 // 500 Internal Server Error
res.serviceUnavailable('message')          // 503 Service Unavailable
\`\`\`

Response format:

\`\`\`json
{
  "status": 200,
  "code": "HTTP_200_OK",
  "message": "Users fetched",
  "data": { }
}
\`\`\`

Paginated response:

\`\`\`json
{
  "status": 200,
  "code": "HTTP_200_OK",
  "message": "Users fetched",
  "data": {
    "metadata": [],
    "pagination": {
      "total": 42,
      "page": 1,
      "limit": 10,
      "totalPages": 5,
      "hasNextPage": true,
      "hasPrevPage": false
    }
  }
}
\`\`\`

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
`,

  config: `# @axiljs/config

Environment loading and typed configuration validation for AxilJS.

Part of the [AxilJS](https://github.com/SyntaxilitY/AxilJS) ecosystem.

## Install

\`\`\`bash
npm install @axiljs/config
\`\`\`

## Usage

\`\`\`typescript
import { loadEnv, defineConfig } from '@axiljs/config'

loadEnv()

const config = defineConfig({
  PORT:         { type: 'number',  default: 3000 },
  DATABASE_URL: { type: 'string',  required: true },
  DEBUG:        { type: 'boolean', default: false },
  NODE_ENV:     { type: 'string',  enum: ['development', 'production', 'test'] }
})
\`\`\`

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
`,

  security: `# @axiljs/security

Security middleware — Helmet, rate limiting, CSRF, and sanitization.

Part of the [AxilJS](https://github.com/SyntaxilitY/AxilJS) ecosystem.

## Install

\`\`\`bash
npm install @axiljs/security
\`\`\`

## Usage

\`\`\`typescript
import { helmet, rateLimit, csrf, sanitize } from '@axiljs/security'

app.use(helmet())
app.use(rateLimit({ max: 100, windowMs: 60000 }))
app.use(csrf())
app.use(sanitize())
\`\`\`

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
`,

  orm: `# @axiljs/orm

ORM for PostgreSQL, MySQL, and SQLite with migrations, query builder, and repositories.

Part of the [AxilJS](https://github.com/SyntaxilitY/AxilJS) ecosystem.

## Install

\`\`\`bash
npm install @axiljs/orm pg              # PostgreSQL
npm install @axiljs/orm mysql2          # MySQL
npm install @axiljs/orm better-sqlite3  # SQLite
\`\`\`

## Usage

\`\`\`typescript
import { createConnection, MigrationRunner } from '@axiljs/orm'
import path from 'path'

const db = await createConnection({
  driver: 'postgres',
  url:    process.env.DATABASE_URL,
  ssl:    { rejectUnauthorized: false }  // NeonDB / managed PostgreSQL
})

const runner = new MigrationRunner(
  db.getDriver(),
  path.join(__dirname, 'migrations')
)

await runner.up()     // Run pending migrations
await runner.down()   // Rollback last batch
await runner.status() // Show migration status
\`\`\`

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
`,

  auth: `# @axiljs/auth

JWT authentication, password hashing with scrypt, and RBAC middleware.

Part of the [AxilJS](https://github.com/SyntaxilitY/AxilJS) ecosystem.

## Install

\`\`\`bash
npm install @axiljs/auth
\`\`\`

## Usage

\`\`\`typescript
import { JWT, hashPassword, verifyPassword,
         authenticate, requireRole } from '@axiljs/auth'

const jwt    = new JWT(process.env.JWT_SECRET)
const hashed = await hashPassword('password123')
const valid  = await verifyPassword('password123', hashed)
const token  = jwt.sign({ sub: '1', role: 'admin' }, { expiresIn: '7d' })

app.get('/profile', authenticate(jwt), (req, res) => {
  res.success(req.locals.user, 'Profile fetched')
})

app.delete('/users/:id', authenticate(jwt), requireRole('admin'), handler)
\`\`\`

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
`,

  validation: `# @axiljs/validation

Schema-based request validation with chainable API.

Part of the [AxilJS](https://github.com/SyntaxilitY/AxilJS) ecosystem.

## Install

\`\`\`bash
npm install @axiljs/validation
\`\`\`

## Usage

\`\`\`typescript
import { v, validate } from '@axiljs/validation'

app.post('/users',
  validate({
    body: v.object({
      name:  v.string().min(2).max(100),
      email: v.string().email(),
      role:  v.enum(['admin', 'user']),
      age:   v.number().min(0).integer().optional()
    })
  }),
  (req, res) => {
    res.created(req.body, 'User created')
  }
)
\`\`\`

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
`,

  testing: `# @axiljs/testing

Test runner, assertions, and HTTP test client — no external dependencies.

Part of the [AxilJS](https://github.com/SyntaxilitY/AxilJS) ecosystem.

## Install

\`\`\`bash
npm install @axiljs/testing
\`\`\`

## Usage

\`\`\`typescript
import { describe, it, expect, createTestClient } from '@axiljs/testing'

describe('Users API', () => {
  const client = createTestClient(app)

  it('creates a user', async () => {
    const res = await client.post('/users').auth(token).send({ name: 'Tariq' })
    expect(res.status).toBe(201)
    expect(res.body.data.name).toBe('Tariq')
  })
})
\`\`\`

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
`,

  events: `# @axiljs/events

In-process event bus with pub/sub, wildcard subscriptions, and decorators.

Part of the [AxilJS](https://github.com/SyntaxilitY/AxilJS) ecosystem.

## Install

\`\`\`bash
npm install @axiljs/events
\`\`\`

## Usage

\`\`\`typescript
import { EventBus, OnEvent, registerEventHandlers } from '@axiljs/events'

const bus = new EventBus()

class NotificationService {
  @OnEvent('user.created')
  async onUserCreated(event: any) {
    await sendWelcomeEmail(event.payload.email)
  }

  @OnEvent('order.*')
  async onAnyOrder(event: any) { }
}

registerEventHandlers(new NotificationService(), bus)
await bus.emit('user.created', { email: 'tariq@syntaxility.dev' })
\`\`\`

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
`,

  websocket: `# @axiljs/websocket

RFC 6455 WebSocket server with rooms, broadcasting, and ping/pong.

Part of the [AxilJS](https://github.com/SyntaxilitY/AxilJS) ecosystem.

## Install

\`\`\`bash
npm install @axiljs/websocket
\`\`\`

## Usage

\`\`\`typescript
import { WSServer } from '@axiljs/websocket'

const wss = new WSServer(app.getServer(), { path: '/ws' })

wss.on('connection', (client) => {
  wss.join(client, 'general')
  client.sendJSON({ type: 'welcome', id: client.id })

  client.on('message', (data) => {
    wss.toRoomJSON('general', { from: client.id, data: data.toString() })
  })
})
\`\`\`

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
`,

  queue: `# @axiljs/queue

Message queue with priority and retry, plus cron-based task scheduler.

Part of the [AxilJS](https://github.com/SyntaxilitY/AxilJS) ecosystem.

## Install

\`\`\`bash
npm install @axiljs/queue
\`\`\`

## Usage

\`\`\`typescript
import { Queue, Scheduler } from '@axiljs/queue'

const queue = new Queue('emails', { concurrency: 5 })
queue.process('send-welcome', async (job) => sendEmail(job.data.to))
queue.start()
await queue.add('send-welcome', { to: 'tariq@syntaxility.dev' })

const scheduler = new Scheduler()
scheduler.schedule('daily-report', '0 9 * * *', generateReport)
scheduler.start()
\`\`\`

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
`,

  circuit: `# @axiljs/circuit

Circuit breaker, retry with backoff, and timeout utilities.

Part of the [AxilJS](https://github.com/SyntaxilitY/AxilJS) ecosystem.

## Install

\`\`\`bash
npm install @axiljs/circuit
\`\`\`

## Usage

\`\`\`typescript
import { CircuitBreaker, retry, withTimeout } from '@axiljs/circuit'

const cb   = new CircuitBreaker('payment', { failureThreshold: 5, resetTimeoutMs: 30000 })
const data = await retry(() => fetchAPI(), { attempts: 3, delay: 1000, backoff: 'exponential' })
const res  = await withTimeout(fetch(url), 5000)
\`\`\`

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
`,

  observability: `# @axiljs/observability

Structured logging, Prometheus metrics, distributed tracing, and health checks.

Part of the [AxilJS](https://github.com/SyntaxilitY/AxilJS) ecosystem.

## Install

\`\`\`bash
npm install @axiljs/observability
\`\`\`

## Usage

\`\`\`typescript
import { Logger, MetricsRegistry, HealthChecker,
         observabilityMiddleware, metricsHandler } from '@axiljs/observability'

const logger  = new Logger({ name: 'MyApp' })
const metrics = new MetricsRegistry()
const health  = new HealthChecker()

health.addCheck('database', async () => ({ message: 'Connected' }))

app.use(observabilityMiddleware({ metrics }))
app.get('/health',   health.handler())
app.get('/metrics',  metricsHandler(metrics))
\`\`\`

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
`,

  ai: `# @axiljs/ai

AI platform — OpenAI, Anthropic, Gemini, Ollama, RAG pipeline, agents, and MCP.

Part of the [AxilJS](https://github.com/SyntaxilitY/AxilJS) ecosystem.

## Install

\`\`\`bash
npm install @axiljs/ai
\`\`\`

## Usage

\`\`\`typescript
import { OpenAIProvider, OllamaProvider, RAGPipeline,
         VectorStore, Agent, loadFromText } from '@axiljs/ai'

// Cloud provider
const ai = new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY })

// Local provider — no API key needed
const ai = new OllamaProvider({ model: 'llama3.2' })

const res = await ai.complete({
  messages: [{ role: 'user', content: 'What is AxilJS?' }],
  system:   'You are a helpful assistant.'
})

const rag = new RAGPipeline({ provider: ai, vectorStore: new VectorStore() })
await rag.index(loadFromText(['AxilJS supports PostgreSQL...']))
const answer = await rag.query('What databases are supported?')

const agent = new Agent({ provider: ai, tools: [calculatorTool] })
const result = await agent.run('What is 25 * 4?')
\`\`\`

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
`,

  cloud: `# @axiljs/cloud

Enterprise features — multi-tenancy, audit logs, feature flags, and deployment.

Part of the [AxilJS](https://github.com/SyntaxilitY/AxilJS) ecosystem.

## Install

\`\`\`bash
npm install @axiljs/cloud
\`\`\`

## Usage

\`\`\`typescript
import { multiTenancy, getTenant, auditLog,
         FeatureFlagManager } from '@axiljs/cloud'

app.use(multiTenancy({ strategy: 'header', headerName: 'x-tenant-id' }))

const flags = new FeatureFlagManager()
flags.define({ name: 'new-checkout', enabled: true, rolloutPercentage: 50 })
\`\`\`

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
`,

  memory: `# @axiljs/memory

Memory leak detection, automatic cleanup, GC optimization, and monitoring.

Part of the [AxilJS](https://github.com/SyntaxilitY/AxilJS) ecosystem.

## Install

\`\`\`bash
npm install @axiljs/memory
\`\`\`

## Usage

\`\`\`typescript
import { MemoryMonitor, optimizer, memoryMiddleware } from '@axiljs/memory'

const monitor = new MemoryMonitor({
  intervalMs:               30000,
  warnThresholdPercent:     70,
  criticalThresholdPercent: 85,
  autoFix:                  true
})

monitor.start()
app.use(memoryMiddleware({ leakThresholdMb: 50 }))
\`\`\`

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
`,

  pm: `# @axiljs/pm

Package manager with lock file and SHA-256 checksum verification.

Part of the [AxilJS](https://github.com/SyntaxilitY/AxilJS) ecosystem.

## Install

\`\`\`bash
npm install @axiljs/pm
\`\`\`

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
`,

  cli: `# @axiljs/cli

The AxilJS command line interface.

Part of the [AxilJS](https://github.com/SyntaxilitY/AxilJS) ecosystem.

## Install

\`\`\`bash
npm install -g @axiljs/cli
\`\`\`

## Commands

\`\`\`bash
axil create <name>        # Create a new project
axil run                  # Start dev server with hot reload
axil run src/mvc/main.ts  # Custom entry point with hot reload
axil build                # Compile TypeScript for production
axil test [pattern]       # Run test files
axil deploy               # Generate Docker + Kubernetes files
axil install [package]    # Install a package
axil doctor               # Diagnose project issues
axil --version            # Show version
\`\`\`

## Quick Start

\`\`\`bash
axil create my-api
cd my-api
npm install
axil run
\`\`\`

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
`
}

// ─── Write README to each package ─────────────────────────────────────────────

let created = 0
let skipped = 0

for (const pkg of packages) {
  const readmePath = path.join(packagesDir, pkg, 'README.md')

  // Skip if README already exists
  if (fs.existsSync(readmePath)) {
    console.log(`  - Skipped ${pkg} (README already exists)`)
    skipped++
    continue
  }

  const pkgJsonPath = path.join(packagesDir, pkg, 'package.json')

  // Skip if no package.json (not a real package)
  if (!fs.existsSync(pkgJsonPath)) continue

  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf-8'))

  const content = readmes[pkg] || `# ${pkgJson.name}

${pkgJson.description || 'Part of the AxilJS ecosystem.'}

Part of the [AxilJS](https://github.com/SyntaxilitY/AxilJS) ecosystem.

## Install

\`\`\`bash
npm install ${pkgJson.name}
\`\`\`

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
`

  fs.writeFileSync(readmePath, content, 'utf-8')
  console.log(`  ✓ Created README for @axiljs/${pkg}`)
  created++
}

console.log(`\n  Done: ${created} created, ${skipped} skipped.\n`)