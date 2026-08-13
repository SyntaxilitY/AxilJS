```bash []
██████╗ ███████╗███████╗████████╗     ██╗███████╗
██╔══██╗██╔════╝██╔════╝╚══██╔══╝     ██║██╔════╝
██████╔╝█████╗  ███████╗   ██║        ██║███████╗
██╔══██╗██╔══╝  ╚════██║   ██║   ██   ██║╚════██║
██║  ██║███████╗███████║   ██║   ╚█████╔╝███████║
╚═╝  ╚═╝╚══════╝╚══════╝   ╚═╝    ╚════╝ ╚══════╝
```

# REstJS

### The JavaScript Backend That Finally Rests.

**Next-Generation JavaScript Backend Ecosystem**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Version](https://img.shields.io/badge/version-0.1.0-orange.svg)]()
[![Author](https://img.shields.io/badge/author-Tariq%20Mehmood-blueviolet.svg)]()

---

## What is REstJS?

REstJS is a **complete backend JavaScript ecosystem** — not another framework.

Every other tool gives you one layer. REstJS gives you everything:

```
One install → HTTP server + ORM + Auth + Validation + Testing
           + Events + WebSockets + Queue + Observability
           + AI Platform + Cloud Deploy + Memory Management
```

No assembling 40 packages from 40 different teams.
No configuration fatigue.
No dependency hell.

---

## Prerequisites

| Requirement | Version |
|---|---|
| Node.js | 18.0.0 or higher |
| npm | 8.0.0 or higher |
| TypeScript | 5.0.0 or higher |

---

## Quick Start

```bash
# Install CLI globally
npm install -g @restjs/cli

# Create a new project
rest create my-api

# Move into project
cd my-api

# Install dependencies
npm install

# Start development server with hot reload
rest run
```

Your API is running at `http://localhost:3000`.

That is it. No configuration files to create. No boilerplate to write.

---

## Project Structure

Every REstJS project follows this standard layout:

```
my-api/
├── src/
│   ├── main.ts                    # Entry point
│   ├── config/
│   │   └── app.config.ts          # App configuration
│   ├── modules/
│   │   └── users/
│   │       ├── controllers/
│   │       │   └── users.controller.ts
│   │       ├── services/
│   │       │   └── users.service.ts
│   │       ├── entities/
│   │       │   └── user.entity.ts
│   │       └── users.test.ts
│   └── migrations/
│       └── 001_create_users.ts
├── package.json
├── tsconfig.json
├── rest.lock
├── .env
└── .env.example
```

---

## CLI Commands

```bash
rest create <name>        # Create a new project
rest run                  # Start dev server with hot reload
rest build                # Compile TypeScript for production
rest test [pattern]       # Run test files
rest deploy               # Generate Docker + Kubernetes files
rest install [package]    # Install a package
rest install -D [package] # Install as devDependency
rest doctor               # Diagnose project issues
rest --version            # Show version
```

---

## Environment Variables

Create `.env` in your project root:

```env
# Server
PORT=3000
HOST=0.0.0.0
NODE_ENV=development

# Authentication
JWT_SECRET=your-secret-minimum-32-characters-long

# Database
DATABASE_URL=postgres://user:password@localhost:5432/mydb

# AI Providers (add only what you use)
AI_PROVIDER=ollama
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_API_KEY=
OLLAMA_MODEL=llama3.2
OLLAMA_URL=http://localhost:11434
```

---

## Packages

All packages live under the `@restjs` scope and work together out of the box.

| Package | Purpose |
|---|---|
| `@restjs/core` | HTTP server, router, middleware, SSE, static files |
| `@restjs/config` | Environment loading, typed config validation |
| `@restjs/security` | Helmet, rate limiting, CSRF, sanitization |
| `@restjs/orm` | ORM — PostgreSQL, MySQL, SQLite, migrations |
| `@restjs/auth` | JWT, password hashing, RBAC |
| `@restjs/validation` | Schema-based request validation |
| `@restjs/testing` | Test runner, assertions, HTTP test client |
| `@restjs/events` | In-process event bus, pub/sub |
| `@restjs/websocket` | RFC 6455 WebSocket server, rooms |
| `@restjs/queue` | Message queue, scheduler, retry |
| `@restjs/circuit` | Circuit breaker, retry, timeout |
| `@restjs/observability` | Logging, metrics, tracing, health checks |
| `@restjs/ai` | AI providers, RAG, agents, vector store, MCP |
| `@restjs/cloud` | Multi-tenancy, audit logs, feature flags, deploy |
| `@restjs/memory` | Memory leak detection, GC, optimization |
| `@restjs/pm` | Package manager with lock file and checksums |
| `@restjs/cli` | CLI — all `rest` commands |

---

## Core HTTP Server

```typescript
import { Application, cors } from '@restjs/core'
import { loadEnv, defineConfig } from '@restjs/config'
import { helmet, rateLimit } from '@restjs/security'

loadEnv()

const config = defineConfig({
  PORT: { type: 'number', default: 3000 },
  NODE_ENV: { type: 'string', default: 'development' }
})

const app = new Application({
  server: { port: config.PORT }
})

app.use(helmet())
app.use(cors({ origin: '*' }))
app.use(rateLimit({ max: 100, windowMs: 60000 }))

app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() })
})

app.get('/users/:id', (req, res) => {
  res.json({ id: req.params.id })
})

app.post('/users', (req, res) => {
  res.status(201).json({ data: req.body })
})

app.listen()
```

---

## Configuration

```typescript
import { loadEnv, defineConfig } from '@restjs/config'

loadEnv() // loads .env file

const config = defineConfig({
  PORT:         { type: 'number',  default: 3000 },
  DATABASE_URL: { type: 'string',  required: true },
  DEBUG:        { type: 'boolean', default: false },
  RATE_LIMIT:   { type: 'number',  default: 100,
                  min: 1, max: 1000 },
  NODE_ENV:     { type: 'string',
                  enum: ['development', 'production', 'test'],
                  default: 'development' }
})

// config.PORT is typed as number
// config.DATABASE_URL is typed as string
// Throws ValidationError on startup if required fields missing
```

---

## Security

```typescript
import { helmet, rateLimit, csrf, sanitize } from '@restjs/security'

// Security headers on every response
app.use(helmet())

// Rate limiting — 100 requests per minute per IP
app.use(rateLimit({ max: 100, windowMs: 60000 }))

// Stricter limit on auth routes
app.post('/auth/login',
  rateLimit({ max: 5, windowMs: 900000 }),
  loginHandler
)

// CSRF protection
app.use(csrf())

// HTML sanitization — prevents XSS
app.use(sanitize())
```

---

## Database ORM

```typescript
import { createConnection, Entity, Column,
         PrimaryKey, BaseRepository } from '@restjs/orm'

// Define entity
@Entity('users')
class User {
  @PrimaryKey()
  id: number

  @Column({ type: 'string', length: 255 })
  name: string

  @Column({ type: 'string', unique: true })
  email: string

  @Column({ type: 'boolean', default: false })
  active: boolean
}

// Connect
const db = await createConnection({
  driver:   'postgres',
  url:      process.env.DATABASE_URL
  // or sqlite: driver: 'sqlite', filename: './dev.db'
  // or mysql:  driver: 'mysql', host, port, database, username, password
})

// Repository
class UserRepository extends BaseRepository<User> {
  constructor() { super(User, db) }

  async findActive() {
    return this.find({ active: true })
  }
}

const users = new UserRepository()

// CRUD
const user    = await users.create({ name: 'Tariq', email: 'tariq@restjs.dev' })
const found   = await users.findById(1)
const updated = await users.update(1, { name: 'Tariq Mehmood' })
const page    = await users.paginate({ page: 1, perPage: 20 })
await users.delete(1)
```

---

## Migrations

```typescript
// src/migrations/001_create_users.ts
import { Migration } from '@restjs/orm'

const migration: Migration = {
  async up(db) {
    await db.query(`
      CREATE TABLE users (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        name       VARCHAR(255) NOT NULL,
        email      VARCHAR(255) UNIQUE NOT NULL,
        password   VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
  },

  async down(db) {
    await db.query(`DROP TABLE IF EXISTS users`)
  }
}

module.exports = migration
```

```typescript
// Run migrations
import { MigrationRunner } from '@restjs/orm'

const runner = new MigrationRunner(db.getDriver())
await runner.up()       // run pending migrations
await runner.down()     // rollback last batch
await runner.status()   // show migration status
```

---

## Authentication

```typescript
import { JWT, hashPassword, verifyPassword }    from '@restjs/auth'
import { authenticate, requireRole,
         requirePermission }                     from '@restjs/auth'

const jwt = new JWT(process.env.JWT_SECRET)

// Register
const hashed = await hashPassword('userPassword123')

// Login
const valid = await verifyPassword('userPassword123', hashed)
const token = jwt.sign(
  { sub: String(user.id), role: 'admin' },
  { expiresIn: '7d' }
)

// Verify
const payload = jwt.verify(token)

// Protect routes
app.get('/profile',
  authenticate(jwt),
  (req, res) => res.json(req.locals.user)
)

// Role-based access
app.delete('/users/:id',
  authenticate(jwt),
  requireRole('admin'),
  deleteUser
)

// Permission-based (supports wildcards: admin:*)
app.post('/posts',
  authenticate(jwt),
  requirePermission('posts:create'),
  createPost
)

// Optional authentication
app.get('/feed',
  authenticate(jwt, { required: false }),
  getFeed
)
```

---

## Validation

```typescript
import { v, validate } from '@restjs/validation'

// Define schema
const createUserSchema = v.object({
  name:     v.string().min(2).max(100),
  email:    v.string().email(),
  age:      v.number().min(0).max(150).integer().optional(),
  role:     v.enum(['admin', 'user', 'guest']),
  tags:     v.array(v.string()).max(10).optional(),
  settings: v.object({
    theme: v.enum(['light', 'dark']).default('light')
  }).optional()
})

// Use as middleware — auto returns 422 on failure
app.post('/users',
  validate({ body: createUserSchema }),
  (req, res) => {
    // req.body is fully typed and validated here
    res.status(201).json({ data: req.body })
  }
)

// Or use manually
const result = createUserSchema.parse(data)
if (!result.success) {
  console.log(result.errors) // [{ path, message, code }]
}
```

---

## Testing

```typescript
import {
  describe, it, expect,
  beforeAll, createTestClient
} from '@restjs/testing'

describe('Users API', () => {
  let client: any

  beforeAll(() => {
    client = createTestClient(app) // no real server needed
  })

  it('returns 401 without token', async () => {
    const res = await client.get('/users')
    expect(res.status).toBe(401)
  })

  it('creates a user', async () => {
    const res = await client
      .post('/users')
      .auth(token)
      .send({ name: 'Tariq', email: 'tariq@restjs.dev', role: 'admin' })

    expect(res.status).toBe(201)
    expect(res.body.data.name).toBe('Tariq')
  })

  it('validates request body', async () => {
    const res = await client
      .post('/users')
      .auth(token)
      .send({ name: 'T' }) // too short

    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })
})
```

```bash
rest test              # run all tests
rest test users        # run tests matching 'users'
```

---

## Event Bus

```typescript
import { EventBus, OnEvent, registerEventHandlers } from '@restjs/events'

const bus = new EventBus()

// Decorator style
class NotificationService {
  @OnEvent('user.created')
  async onUserCreated(event: any) {
    await sendWelcomeEmail(event.payload.email)
  }

  @OnEvent('order.*') // wildcard — matches any order event
  async onAnyOrder(event: any) {
    console.log('Order event:', event.type)
  }
}

registerEventHandlers(new NotificationService(), bus)

// Publish
await bus.emit('user.created', { id: 1, email: 'tariq@restjs.dev' })

// Subscribe manually
const sub = bus.on('payment.received', async (event) => {
  await processPayment(event.payload)
})

// Wait for next event
const event = await bus.waitFor('payment.confirmed', 5000)

// Unsubscribe
sub.unsubscribe()
```

---

## WebSockets

```typescript
import { WSServer } from '@restjs/websocket'

// Attach to your existing HTTP server
const wss = new WSServer(app.getServer(), { path: '/ws' })

wss.on('connection', (client) => {
  console.log('Connected:', client.id)

  // Send to this client
  client.sendJSON({ type: 'welcome', id: client.id })

  // Join rooms
  wss.join(client, 'general')

  client.on('message', (data) => {
    const msg = JSON.parse(data.toString())

    // Send to specific room
    wss.toRoomJSON('general', {
      type:    'message',
      from:    client.id,
      content: msg.content
    })

    // Broadcast to everyone
    wss.broadcastJSON({ type: 'announcement', content: msg.content })
  })

  client.on('close', () => {
    console.log('Disconnected:', client.id)
  })
})
```

---

## Message Queue

```typescript
import { Queue } from '@restjs/queue'

const emailQueue = new Queue('emails', { concurrency: 5 })

// Register handlers
emailQueue.process('send-welcome', async (job) => {
  await sendEmail(job.data.to, 'Welcome!')
  return { sent: true }
})

emailQueue.on('completed', (job) => console.log('Done:', job.id))
emailQueue.on('failed',    (job, err) => console.error('Failed:', err))

emailQueue.start()

// Add jobs
await emailQueue.add('send-welcome', { to: 'tariq@restjs.dev' })

// Delayed job
await emailQueue.add('send-reminder', { to: 'user@example.com' }, {
  delay:       3600000,  // 1 hour
  maxAttempts: 3
})

// Priority job — processed first
await emailQueue.add('send-alert', { to: 'admin@example.com' }, {
  priority: 10
})
```

---

## Task Scheduler

```typescript
import { Scheduler } from '@restjs/queue'

const scheduler = new Scheduler()

scheduler.schedule('daily-report',  '0 9 * * *',    sendDailyReport)
scheduler.schedule('cleanup',       '0 2 * * *',    cleanupOldData)
scheduler.schedule('health-check',  '*/5 * * * *',  pingExternalAPIs)
scheduler.schedule('weekly-backup', '0 0 * * 0',    backupDatabase)

scheduler.start()

// Run immediately for testing
await scheduler.runNow('daily-report')

// Disable a task
scheduler.setEnabled('cleanup', false)
```

---

## Circuit Breaker

```typescript
import { CircuitBreaker, retry, withTimeout } from '@restjs/circuit'

// Circuit breaker — stops calling failing services
const paymentCB = new CircuitBreaker('payment-api', {
  failureThreshold: 5,       // open after 5 failures
  resetTimeoutMs:   30000,   // try again after 30s
  fallback: () => ({ error: 'Payment service unavailable' })
})

const result = await paymentCB.execute(async () => {
  return await paymentService.charge(amount)
})

// Retry with backoff
const data = await retry(
  () => fetchFromExternalAPI(),
  { attempts: 3, delay: 1000, backoff: 'exponential' }
)

// Timeout wrapper
const response = await withTimeout(
  fetch('https://slow-api.example.com'),
  5000  // fail after 5 seconds
)
```

---

## Observability

```typescript
import { Logger, MetricsRegistry,
         HealthChecker, Tracer,
         observabilityMiddleware,
         metricsHandler } from '@restjs/observability'

// Structured logging
const logger = new Logger({ name: 'UserService' })
logger.info('User created', { userId: 123 })
logger.error('DB error', { error: err.message })

// Child logger inherits context
const reqLogger = logger.child({ requestId: 'abc-123' })

// Prometheus metrics
const metrics  = new MetricsRegistry()
const requests = metrics.counter('http_requests_total', 'Total requests')
const duration = metrics.histogram('request_duration_ms', 'Duration')
requests.inc({ method: 'GET', status: '200' })

// Health checks
const health = new HealthChecker()
health.addCheck('database', async () => {
  await db.ping()
  return { message: 'Connected' }
})

// Distributed tracing
const tracer = new Tracer({ serviceName: 'my-api' })
await tracer.trace('user.create', async (span) => {
  span.setAttribute('user.email', email)
  return await createUser(data)
})

// Register endpoints
app.use(observabilityMiddleware({ metrics, tracer }))
app.get('/health',       health.handler())
app.get('/health/live',  health.livenessHandler())
app.get('/health/ready', health.readinessHandler())
app.get('/metrics',      metricsHandler(metrics))
```

---

## AI Platform

```typescript
import {
  OpenAIProvider,
  OllamaProvider,
  RAGPipeline,
  VectorStore,
  Agent,
  createTool,
  calculatorTool,
  currentDateTimeTool,
  loadFromText
} from '@restjs/ai'

// Choose provider — swap without changing app code
const provider = new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY })
// or: new OllamaProvider({ model: 'llama3.2' })  — local, no API key
// or: new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY })
// or: new GeminiProvider({ apiKey: process.env.GOOGLE_API_KEY })

// Simple chat
const response = await provider.complete({
  messages: [{ role: 'user', content: 'What is REstJS?' }],
  system:   'You are a helpful assistant.'
})

// Streaming chat
const stream = provider.stream({ messages, system })
for await (const chunk of stream) {
  process.stdout.write(chunk.delta)
}

// Embeddings
const result = await provider.embed({ input: 'Hello world' })
// result.embeddings[0] → number[]

// RAG — index documents then answer questions from them
const rag = new RAGPipeline({ provider, vectorStore: new VectorStore() })

await rag.index(loadFromText([
  'REstJS supports PostgreSQL MySQL and SQLite.',
  'The ORM provides migrations and a query builder.'
]))

const answer = await rag.query('What databases does REstJS support?')
console.log(answer.response)   // answer generated from your documents
console.log(answer.sources)    // which documents were used

// AI Agent with tools
const weatherTool = createTool({
  name:        'get_weather',
  description: 'Get weather for a city',
  parameters: {
    type: 'object',
    properties: {
      city: { type: 'string', description: 'City name' }
    },
    required: ['city']
  },
  handler: async ({ city }) => ({ city, temperature: '22°C' })
})

const agent = new Agent({
  provider,
  tools:         [calculatorTool, currentDateTimeTool, weatherTool],
  maxIterations: 10
})

const agentResult = await agent.run(
  'What is 25 * 4 and what is the weather in Lahore?'
)
console.log(agentResult.response)
console.log(agentResult.steps)   // full reasoning trace
```

---

## Multi-Tenancy

```typescript
import { multiTenancy, getTenant, auditLog } from '@restjs/cloud'

// Identify tenant from request header
app.use(multiTenancy({
  strategy:   'header',
  headerName: 'x-tenant-id',
  resolveTenant: async (id) => {
    return await db.findTenant(id)
  }
}))

// Access tenant in any handler
app.get('/dashboard', (req, res) => {
  const tenant = getTenant(req)
  res.json({ tenant: tenant.id, plan: tenant.plan })
})

// Audit logging — who did what when
auditLog({
  action:   'user.login',
  actor:    { id: user.id, type: 'user' },
  tenantId: tenant.id,
  metadata: { ip: req.ip },
  success:  true
})
```

---

## Feature Flags

```typescript
import { FeatureFlagManager } from '@restjs/cloud'

const flags = new FeatureFlagManager()

flags.define({
  name:              'new-checkout',
  enabled:           true,
  description:       'New checkout flow',
  rolloutPercentage: 50,            // 50% of users
  allowedTenants:    ['tenant-beta']
})

flags.define({
  name:      'maintenance-mode',
  enabled:   false,
  expiresAt: '2025-12-31T00:00:00Z'
})

// Check a flag
const isEnabled = flags.isEnabled('new-checkout', {
  tenantId:   'tenant-beta',
  userId:     123,
  percentage: 45
})

if (isEnabled) {
  // show new checkout
}
```

---

## Memory Management

```typescript
import { MemoryMonitor, optimizer,
         memoryMiddleware, trackCache } from '@restjs/memory'

// Start automatic memory monitoring
const monitor = new MemoryMonitor({
  intervalMs:               30000,  // scan every 30s
  warnThresholdPercent:     70,     // warn at 70% heap
  criticalThresholdPercent: 85,     // critical at 85%
  autoFix:                  true,   // auto-fix detected leaks

  onLeak:     (leaks) => logger.warn('Leaks detected', { count: leaks.length }),
  onCritical: (snap)  => logger.error('Critical memory', { mb: snap.heapUsedMb })
})

monitor.start()

// Per-request memory tracking
app.use(memoryMiddleware({
  leakThresholdMb: 50,    // flag requests using > 50MB
  exposeHeader:    true   // add X-Memory-Usage response header
}))

// Track a cache for auto-pruning
const sessionCache = trackCache('sessions', new Map(), 10000)

// Manual optimization
const result = await optimizer.optimize()
console.log(`Freed: ${result.freedMb}MB`)

// Manual scan
const report = await monitor.scan()
console.log(report.status)   // clean | leaks-fixed | leaks-detected | critical
console.log(report.leaks)    // what was found
```

---

## Server-Sent Events

```typescript
import { createSSE, sseHeartbeat } from '@restjs/core'

app.get('/events', (req, res) => {
  const sse      = createSSE(res)
  const stopBeat = sseHeartbeat(sse, 15000)  // keep alive

  sse.send({ message: 'Connected' }, 'connect')

  const interval = setInterval(() => {
    if (!sse.isOpen) {
      clearInterval(interval)
      stopBeat()
      return
    }

    sse.send({ data: 'live update', timestamp: Date.now() }, 'update')
  }, 1000)
})
```

---

## Deployment

```bash
# Generate Docker + Kubernetes files
rest deploy

# Generated files:
# deploy/Dockerfile
# deploy/deployment.yaml   (Deployment + Service + HPA)
# deploy/deploy.sh
```

```bash
# Build for production
npm run build

# Run production server
node dist/main.js

# With manual GC support (recommended)
node --expose-gc dist/main.js

# Docker
docker build -t my-api .
docker run -p 3000:3000 --env-file .env my-api

# Kubernetes
kubectl apply -f deploy/deployment.yaml
```

---

## Hot Reload Development

`rest run` compiles TypeScript incrementally and restarts automatically on every file save. No nodemon needed. No ts-node overhead at runtime.

```bash
rest run
```

```
 REstJS development server
 ──────────────────────────

01:30:00 [rest run] Initial compilation...
01:30:02 [rest run] Compiled project in 1842ms
         ✓ Server running at http://0.0.0.0:3000
01:30:02 [rest run] Watching src/ for changes...

# Save a file →
01:31:15 [rest run] Changed: server.ts
01:31:15 [rest run] Compiled 1 file(s) in 287ms
01:31:15 [rest run] Restarting (restart #1)
         ✓ Server running at http://0.0.0.0:3000
```

---

## Build From Source

```bash
# Clone
git clone https://github.com/tariqmehmood/restjs.git
cd restjs

# Install all workspace dependencies
npm install

# Build all packages in correct order
cd packages/common        && npm run build
cd ../config              && npm run build
cd ../security            && npm run build
cd ../pm                  && npm run build
cd ../orm                 && npm run build
cd ../auth                && npm run build
cd ../validation          && npm run build
cd ../core                && npm run build
cd ../testing             && npm run build
cd ../events              && npm run build
cd ../websocket           && npm run build
cd ../queue               && npm run build
cd ../circuit             && npm run build
cd ../observability       && npm run build
cd ../ai                  && npm run build
cd ../cloud               && npm run build
cd ../memory              && npm run build
cd ../cli                 && npm run build
```

---

## What Gets Fixed Automatically

REstJS monitors and fixes memory issues on its own:

| Issue | Detected | Auto Fixed |
|---|---|---|
| Event listener accumulation | ✅ | ✅ |
| Cache overflow | ✅ | ✅ prunes oldest |
| Unused module cache | ✅ | ✅ clears |
| Timer accumulation | ✅ | ✅ warns |
| Global scope pollution | ✅ | ⚠ warns |
| High heap usage | ✅ | ✅ triggers GC |

---

## vs Other Tools

| | Node.js | Express | NestJS | Bun | **REstJS** |
|---|---|---|---|---|---|
| HTTP Framework | ✗ | ✓ | ✓ | Partial | ✓ |
| ORM | ✗ | ✗ | ✗ | ✗ | ✓ |
| Auth | ✗ | ✗ | ✗ | ✗ | ✓ |
| Validation | ✗ | ✗ | ✗ | ✗ | ✓ |
| Testing | ✗ | ✗ | ✗ | ✓ | ✓ |
| WebSockets | ✗ | ✗ | ✗ | ✗ | ✓ |
| Queue | ✗ | ✗ | ✗ | ✗ | ✓ |
| Observability | ✗ | ✗ | ✗ | ✗ | ✓ |
| AI Platform | ✗ | ✗ | ✗ | ✗ | ✓ |
| Memory Mgmt | ✗ | ✗ | ✗ | ✗ | ✓ |
| Cloud Deploy | ✗ | ✗ | ✗ | ✗ | ✓ |
| Zero Config | ✗ | ✗ | ✗ | Partial | ✓ |

---

## License

MIT License — Copyright © 2025 Tariq Mehmood

---

<div align="center">

**REstJS** — *The JavaScript Backend That Finally Rests.*

Built by [Tariq Mehmood](https://github.com/TariqMehmood1004)

⭐ Star this repo if REstJS saves you from assembling another ecosystem from scratch.

</div>