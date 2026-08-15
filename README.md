<div align="center">

```
 █████╗ ██╗  ██╗██╗██╗     ██╗████████╗██╗   ██╗     ██╗███████╗
██╔══██╗╚██╗██╔╝██║██║     ██║╚══██╔══╝╚██╗ ██╔╝     ██║██╔════╝
███████║ ╚███╔╝ ██║██║     ██║   ██║    ╚████╔╝      ██║███████╗
██╔══██║ ██╔██╗ ██║██║     ██║   ██║     ╚██╔╝   ██  ██║╚════██║
██║  ██║██╔╝ ██╗██║███████╗██║   ██║      ██║    ╚█████╔╝███████║
╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚══════╝╚═╝   ╚═╝      ╚═╝     ╚════╝ ╚══════╝
```

# AxilJS

### The JavaScript Backend That Finally Rests.

**Developed by SyntaxilitY — Superior JavaScript Backend Ecosystem**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Version](https://img.shields.io/badge/version-0.1.0-orange.svg)]()
[![Organization](https://img.shields.io/badge/SyntaxilitY-Ecosystem-brightgreen.svg)]()
[![Author](https://img.shields.io/badge/author-Tariq%20Mehmood-blueviolet.svg)]()

[Getting Started](#-getting-started) •
[Why AxilJS](#-why-axiljs) •
[Packages](#-packages) •
[Examples](#-examples) •
[CLI](#-cli) •
[Roadmap](#-roadmap) •
[Contributing](#-contributing)

</div>

---

## What is AxilJS?

**AxilJS** is a complete JavaScript backend ecosystem — developed by **SyntaxilitY** and **Tariq Mehmood**.

The name comes directly from **Synt`axil`itYJS** — agility through syntax.

In nature, the **axil** is the point on a plant where new growth begins. AxilJS is that point for your backend — the source where everything grows naturally, together.

Every other tool gives you one layer. AxilJS gives you everything:

```
One install → HTTP server + ORM + Auth + Validation + Testing
           + Events + WebSockets + Queue + Observability
           + AI Platform + Cloud Deploy + Memory Management
```

No assembling 40 packages from 40 different teams.
No configuration fatigue.
No dependency hell.

---

## The Name

```
Synt  +  axil  +  itY  +  JS
         ────
         agility through syntax
         the axil — where natural growth begins
         the Y — the SyntaxilitY signature
```

| Part | Meaning |
|---|---|
| `axil` | Extracted from SyntaxilitY — agility, natural growth point |
| `itY` | The SyntaxilitY signature |
| `JS` | JavaScript |

---

## Prerequisites

| Requirement | Version |
|---|---|
| Node.js | 18.0.0 or higher |
| npm | 8.0.0 or higher |
| TypeScript | 5.0.0 or higher |

---

## Getting Started

```bash
# Install CLI globally
npm install -g @axil/cli

# Create a new project
axil create my-api

# Move into project
cd my-api

# Install dependencies
npm install

# Start development server with hot reload
axil run
```

Your API is running at `http://localhost:3000`.

That is it. No configuration files to create. No boilerplate to write.

---

## Project Structure

Every AxilJS project follows this standard layout:

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
├── axil.lock
├── .env
└── .env.example
```

---

## CLI Commands

```bash
axil create <name>        # Create a new project
axil run                  # Start dev server with hot reload
axil build                # Compile TypeScript for production
axil test [pattern]       # Run test files
axil deploy               # Generate Docker + Kubernetes files
axil install [package]    # Install a package
axil install -D [package] # Install as devDependency
axil doctor               # Diagnose project issues
axil --version            # Show version
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

All packages live under the `@axil` scope and work together out of the box.

| Package | Purpose |
|---|---|
| `@axil/core` | HTTP server, router, middleware, SSE, static files |
| `@axil/config` | Environment loading, typed config validation |
| `@axil/security` | Helmet, rate limiting, CSRF, sanitization |
| `@axil/orm` | ORM — PostgreSQL, MySQL, SQLite, migrations |
| `@axil/auth` | JWT, password hashing, RBAC |
| `@axil/validation` | Schema-based request validation |
| `@axil/testing` | Test runner, assertions, HTTP test client |
| `@axil/events` | In-process event bus, pub/sub |
| `@axil/websocket` | RFC 6455 WebSocket server, rooms |
| `@axil/queue` | Message queue, scheduler, retry |
| `@axil/circuit` | Circuit breaker, retry, timeout |
| `@axil/observability` | Logging, metrics, tracing, health checks |
| `@axil/ai` | AI providers, RAG, agents, vector store, MCP |
| `@axil/cloud` | Multi-tenancy, audit logs, feature flags, deploy |
| `@axil/memory` | Memory leak detection, GC, optimization |
| `@axil/pm` | Package manager with lock file and checksums |
| `@axil/cli` | CLI — all `axil` commands |

---

## Examples

### Core HTTP Server

```typescript
import { Application, cors } from '@axil/core'
import { loadEnv, defineConfig } from '@axil/config'
import { helmet, rateLimit } from '@axil/security'

loadEnv()

const config = defineConfig({
  PORT:     { type: 'number', default: 3000 },
  NODE_ENV: { type: 'string', default: 'development' }
})

const app = new Application({ server: { port: config.PORT } })

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

### Configuration

```typescript
import { loadEnv, defineConfig } from '@axil/config'

loadEnv()

const config = defineConfig({
  PORT:         { type: 'number',  default: 3000 },
  DATABASE_URL: { type: 'string',  required: true },
  DEBUG:        { type: 'boolean', default: false },
  RATE_LIMIT:   { type: 'number',  default: 100, min: 1, max: 1000 },
  NODE_ENV:     { type: 'string',
                  enum: ['development', 'production', 'test'],
                  default: 'development' }
})

// config.PORT is typed as number
// config.DATABASE_URL is typed as string
// Throws ValidationError on startup if required fields missing
```

### Security

```typescript
import { helmet, rateLimit, csrf, sanitize } from '@axil/security'

app.use(helmet())
app.use(rateLimit({ max: 100, windowMs: 60000 }))

app.post('/auth/login',
  rateLimit({ max: 5, windowMs: 900000 }),
  loginHandler
)

app.use(csrf())
app.use(sanitize())
```

### Database ORM

```typescript
import { createConnection, Entity, Column,
         PrimaryKey, BaseRepository } from '@axil/orm'

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

const db = await createConnection({
  driver: 'postgres',
  url:    process.env.DATABASE_URL
})

class UserRepository extends BaseRepository<User> {
  constructor() { super(User, db) }
  async findActive() { return this.find({ active: true }) }
}

const users = new UserRepository()

const user    = await users.create({ name: 'Tariq', email: 'tariq@syntaxility.dev' })
const found   = await users.findById(1)
const updated = await users.update(1, { name: 'Tariq Mehmood' })
const page    = await users.paginate({ page: 1, perPage: 20 })
await users.delete(1)
```

### Migrations

```typescript
// src/migrations/001_create_users.ts
import { Migration } from '@axil/orm'

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
import { MigrationRunner } from '@axil/orm'

const runner = new MigrationRunner(db.getDriver())
await runner.up()
await runner.down()
await runner.status()
```

### Authentication

```typescript
import { JWT, hashPassword, verifyPassword,
         authenticate, requireRole,
         requirePermission }              from '@axil/auth'

const jwt = new JWT(process.env.JWT_SECRET)

const hashed  = await hashPassword('userPassword123')
const valid   = await verifyPassword('userPassword123', hashed)
const token   = jwt.sign({ sub: String(user.id), role: 'admin' }, { expiresIn: '7d' })
const payload = jwt.verify(token)

app.get('/profile', authenticate(jwt), (req, res) => res.json(req.locals.user))
app.delete('/users/:id', authenticate(jwt), requireRole('admin'), deleteUser)
app.post('/posts', authenticate(jwt), requirePermission('posts:create'), createPost)
app.get('/feed', authenticate(jwt, { required: false }), getFeed)
```

### Validation

```typescript
import { v, validate } from '@axil/validation'

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

app.post('/users',
  validate({ body: createUserSchema }),
  (req, res) => {
    res.status(201).json({ data: req.body })
  }
)
```

### Testing

```typescript
import { describe, it, expect,
         beforeAll, createTestClient } from '@axil/testing'

describe('Users API', () => {
  let client: any

  beforeAll(() => { client = createTestClient(app) })

  it('returns 401 without token', async () => {
    const res = await client.get('/users')
    expect(res.status).toBe(401)
  })

  it('creates a user', async () => {
    const res = await client
      .post('/users')
      .auth(token)
      .send({ name: 'Tariq', email: 'tariq@syntaxility.dev', role: 'admin' })

    expect(res.status).toBe(201)
    expect(res.body.data.name).toBe('Tariq')
  })

  it('validates request body', async () => {
    const res = await client
      .post('/users')
      .auth(token)
      .send({ name: 'T' })

    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })
})
```

```bash
axil test
axil test users
```

### Event Bus

```typescript
import { EventBus, OnEvent, registerEventHandlers } from '@axil/events'

const bus = new EventBus()

class NotificationService {
  @OnEvent('user.created')
  async onUserCreated(event: any) {
    await sendWelcomeEmail(event.payload.email)
  }

  @OnEvent('order.*')
  async onAnyOrder(event: any) {
    console.log('Order event:', event.type)
  }
}

registerEventHandlers(new NotificationService(), bus)

await bus.emit('user.created', { id: 1, email: 'tariq@syntaxility.dev' })

const sub   = bus.on('payment.received', async (event) => { await processPayment(event.payload) })
const event = await bus.waitFor('payment.confirmed', 5000)
sub.unsubscribe()
```

### WebSockets

```typescript
import { WSServer } from '@axil/websocket'

const wss = new WSServer(app.getServer(), { path: '/ws' })

wss.on('connection', (client) => {
  client.sendJSON({ type: 'welcome', id: client.id })
  wss.join(client, 'general')

  client.on('message', (data) => {
    const msg = JSON.parse(data.toString())
    wss.toRoomJSON('general', { type: 'message', from: client.id, content: msg.content })
    wss.broadcastJSON({ type: 'announcement', content: msg.content })
  })

  client.on('close', () => console.log('Disconnected:', client.id))
})
```

### Message Queue

```typescript
import { Queue } from '@axil/queue'

const emailQueue = new Queue('emails', { concurrency: 5 })

emailQueue.process('send-welcome', async (job) => {
  await sendEmail(job.data.to, 'Welcome!')
  return { sent: true }
})

emailQueue.on('completed', (job) => console.log('Done:', job.id))
emailQueue.on('failed', (job, err) => console.error('Failed:', err))

emailQueue.start()

await emailQueue.add('send-welcome', { to: 'tariq@syntaxility.dev' })
await emailQueue.add('send-reminder', { to: 'user@example.com' }, {
  delay: 3600000, maxAttempts: 3
})
await emailQueue.add('send-alert', { to: 'admin@example.com' }, { priority: 10 })
```

### Task Scheduler

```typescript
import { Scheduler } from '@axil/queue'

const scheduler = new Scheduler()

scheduler.schedule('daily-report',  '0 9 * * *',  sendDailyReport)
scheduler.schedule('cleanup',       '0 2 * * *',  cleanupOldData)
scheduler.schedule('weekly-backup', '0 0 * * 0',  backupDatabase)

scheduler.start()

await scheduler.runNow('daily-report')
scheduler.setEnabled('cleanup', false)
```

### Circuit Breaker

```typescript
import { CircuitBreaker, retry, withTimeout } from '@axil/circuit'

const paymentCB = new CircuitBreaker('payment-api', {
  failureThreshold: 5,
  resetTimeoutMs:   30000,
  fallback: () => ({ error: 'Payment service unavailable' })
})

const result   = await paymentCB.execute(async () => paymentService.charge(amount))
const data     = await retry(() => fetchFromExternalAPI(), { attempts: 3, delay: 1000, backoff: 'exponential' })
const response = await withTimeout(fetch('https://slow-api.example.com'), 5000)
```

### Observability

```typescript
import { Logger, MetricsRegistry, HealthChecker,
         Tracer, observabilityMiddleware,
         metricsHandler } from '@axil/observability'

const logger  = new Logger({ name: 'UserService' })
logger.info('User created', { userId: 123 })
logger.error('DB error', { error: err.message })

const metrics  = new MetricsRegistry()
const requests = metrics.counter('http_requests_total', 'Total requests')
requests.inc({ method: 'GET', status: '200' })

const health = new HealthChecker()
health.addCheck('database', async () => {
  await db.ping()
  return { message: 'Connected' }
})

const tracer = new Tracer({ serviceName: 'my-api' })
await tracer.trace('user.create', async (span) => {
  span.setAttribute('user.email', email)
  return await createUser(data)
})

app.use(observabilityMiddleware({ metrics, tracer }))
app.get('/health',       health.handler())
app.get('/health/live',  health.livenessHandler())
app.get('/health/ready', health.readinessHandler())
app.get('/metrics',      metricsHandler(metrics))
```

### AI Platform

```typescript
import { OpenAIProvider, OllamaProvider, RAGPipeline,
         VectorStore, Agent, createTool,
         calculatorTool, currentDateTimeTool,
         loadFromText } from '@axil/ai'

const provider = new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY })
// or: new OllamaProvider({ model: 'llama3.2' })
// or: new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY })
// or: new GeminiProvider({ apiKey: process.env.GOOGLE_API_KEY })

const response = await provider.complete({
  messages: [{ role: 'user', content: 'What is AxilJS?' }],
  system:   'You are a helpful assistant.'
})

const stream = provider.stream({ messages, system })
for await (const chunk of stream) { process.stdout.write(chunk.delta) }

const rag = new RAGPipeline({ provider, vectorStore: new VectorStore() })

await rag.index(loadFromText([
  'AxilJS supports PostgreSQL MySQL and SQLite.',
  'The ORM provides migrations and a query builder.'
]))

const answer = await rag.query('What databases does AxilJS support?')
console.log(answer.response)
console.log(answer.sources)

const weatherTool = createTool({
  name:        'get_weather',
  description: 'Get weather for a city',
  parameters: {
    type: 'object',
    properties: { city: { type: 'string', description: 'City name' } },
    required: ['city']
  },
  handler: async ({ city }) => ({ city, temperature: '22°C' })
})

const agent = new Agent({
  provider,
  tools:         [calculatorTool, currentDateTimeTool, weatherTool],
  maxIterations: 10
})

const agentResult = await agent.run('What is 25 * 4 and what is the weather in Lahore?')
console.log(agentResult.response)
console.log(agentResult.steps)
```

### Multi-Tenancy

```typescript
import { multiTenancy, getTenant, auditLog } from '@axil/cloud'

app.use(multiTenancy({
  strategy:      'header',
  headerName:    'x-tenant-id',
  resolveTenant: async (id) => await db.findTenant(id)
}))

app.get('/dashboard', (req, res) => {
  const tenant = getTenant(req)
  res.json({ tenant: tenant.id, plan: tenant.plan })
})

auditLog({
  action:   'user.login',
  actor:    { id: user.id, type: 'user' },
  tenantId: tenant.id,
  metadata: { ip: req.ip },
  success:  true
})
```

### Feature Flags

```typescript
import { FeatureFlagManager } from '@axil/cloud'

const flags = new FeatureFlagManager()

flags.define({
  name:              'new-checkout',
  enabled:           true,
  rolloutPercentage: 50,
  allowedTenants:    ['tenant-beta']
})

const isEnabled = flags.isEnabled('new-checkout', {
  tenantId:   'tenant-beta',
  userId:     123,
  percentage: 45
})
```

### Memory Management

```typescript
import { MemoryMonitor, optimizer,
         memoryMiddleware, trackCache } from '@axil/memory'

const monitor = new MemoryMonitor({
  intervalMs:               30000,
  warnThresholdPercent:     70,
  criticalThresholdPercent: 85,
  autoFix:                  true,
  onLeak:     (leaks) => logger.warn('Leaks detected', { count: leaks.length }),
  onCritical: (snap)  => logger.error('Critical memory', { mb: snap.heapUsedMb })
})

monitor.start()

app.use(memoryMiddleware({ leakThresholdMb: 50, exposeHeader: true }))

const sessionCache = trackCache('sessions', new Map(), 10000)

const result = await optimizer.optimize()
console.log(`Freed: ${result.freedMb}MB`)
```

### Server-Sent Events

```typescript
import { createSSE, sseHeartbeat } from '@axil/core'

app.get('/events', (req, res) => {
  const sse      = createSSE(res)
  const stopBeat = sseHeartbeat(sse, 15000)

  sse.send({ message: 'Connected' }, 'connect')

  const interval = setInterval(() => {
    if (!sse.isOpen) { clearInterval(interval); stopBeat(); return }
    sse.send({ data: 'live update', timestamp: Date.now() }, 'update')
  }, 1000)
})
```

---

## Deployment

```bash
# Generate Docker + Kubernetes files
axil deploy
```

```
deploy/
├── Dockerfile
├── deployment.yaml   # Deployment + Service + HPA
└── deploy.sh
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

`axil run` compiles TypeScript incrementally and restarts automatically on every file save.

```bash
axil run
```

```
 AxilJS development server
 ─────────────────────────────────────

01:30:00 [axil run] Initial compilation...
01:30:02 [axil run] Compiled project in 1842ms
         ✓ Server running at http://localhost:3000
01:30:02 [axil run] Watching src/ for changes...

# Save a file →
01:31:15 [axil run] Changed: server.ts
01:31:15 [axil run] Compiled 1 file(s) in 287ms
01:31:15 [axil run] Restarting (restart #1)
         ✓ Server running at http://localhost:3000
```

---

## Build From Source

```bash
# Clone
git clone https://github.com/SyntaxilitY/AxilJS.git
cd AxilJS

# Install workspace dependencies
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

AxilJS monitors and fixes memory issues on its own:

| Issue | Detected | Auto Fixed |
|---|---|---|
| Event listener accumulation | ✅ | ✅ |
| Cache overflow | ✅ | ✅ prunes oldest |
| Unused module cache | ✅ | ✅ clears |
| Timer accumulation | ✅ | ✅ warns |
| Global scope pollution | ✅ | ⚠ warns |
| High heap usage | ✅ | ✅ triggers GC |

---

## Why AxilJS?

| | Node.js | Express | NestJS | Bun | **AxilJS** |
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

## Roadmap

```
Phase 1  ✅  Core HTTP server, router, middleware, CLI
Phase 2  ✅  Config, security, package manager, SSE, static files
Phase 3  ✅  ORM, authentication, validation, testing
Phase 4  ✅  Events, WebSockets, queue, circuit breaker, observability
Phase 5  ✅  AI platform — providers, RAG, agents, MCP
Phase 6  ✅  Enterprise — multi-tenancy, audit, feature flags, cloud deploy
Phase 7  ✅  Memory management — leak detection, GC, optimization

Upcoming
────────
Phase 8     Official AxilJS package registry
Phase 9     gRPC and native RPC support
Phase 10    AxilJS Cloud (managed hosting)
Phase 11    AxilJS Studio (visual admin panel)
```

---

## Contributing

```bash
# Clone
git clone https://github.com/SyntaxilitY/AxilJS.git
cd AxilJS

npm install
npm run build:all
```

### Contribution Guidelines

- All code must be TypeScript with strict mode
- Every file must have a top-level comment
- Every public function must have JSDoc
- Every new feature must have tests
- No circular dependencies between packages
- All PRs must build without errors

---

## License

```
MIT License

Copyright (c) 2025 Tariq Mehmood — SyntaxilitY

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the "Software"),
to deal in the Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, sublicense,
and/or sell copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included
in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL
THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
DEALINGS IN THE SOFTWARE.
```

---

<div align="center">

**AxilJS** — *The JavaScript Backend That Finally Rests.*

A [SyntaxilitY](https://github.com/SyntaxilitY) open source project.
Built by [Tariq Mehmood](https://github.com/TariqMehmood1004).

⭐ Star this repo if AxilJS saves you from assembling another ecosystem from scratch.

</div>