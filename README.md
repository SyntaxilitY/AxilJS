
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
[Architecture Examples](#-architecture-examples) •
[CLI](#-cli) •
[Roadmap](#-roadmap) •
[Contributing](#-contributing)


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
           + Built-in Response Manager
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

That is it. No configuration files. No boilerplate.

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
axil run src/mvc/main.ts  # Hot reload with custom entry point
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
| `@axil/core` | HTTP server, router, middleware, SSE, static files, **built-in response manager** |
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

## Built-in Response Manager

AxilJS includes **SyntaxilitY API Response Manager** built directly into the `res` object. No imports needed — every response is automatically formatted.

```typescript
// Every res object has these methods built-in

res.success(data, 'Users fetched')
res.created(data, 'User created')
res.paginated(items, total, page, limit, 'Posts fetched')
res.notFound('User not found')
res.unauthorized('Invalid token')
res.forbidden('Admin access required')
res.conflict('Email already exists')
res.badRequest('Missing required field')
res.validationError('Validation failed')
res.serverError('Database error')
res.tooManyRequests()
res.serviceUnavailable()
```

Every response follows a consistent format:

```json
{
  "status": 200,
  "code": "HTTP_200_OK",
  "message": "Users fetched",
  "data": { }
}
```

Paginated responses include full metadata:

```json
{
  "status": 200,
  "code": "HTTP_200_OK",
  "message": "Users fetched",
  "data": {
    "metadata": [ ],
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
```

Extract pagination params from request:

```typescript
import { Response } from '@axil/core'

const { page, limit, skip } = Response.getPaginationParams(req)
```

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
  res.success({ uptime: process.uptime() }, 'Healthy')
})

app.get('/users/:id', (req, res) => {
  res.success({ id: req.params.id }, 'User fetched')
})

app.post('/users', (req, res) => {
  res.created(req.body, 'User created')
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
```

### Security

```typescript
import { helmet, rateLimit, csrf, sanitize } from '@axil/security'

app.use(helmet())
app.use(rateLimit({ max: 100, windowMs: 60000 }))
app.post('/auth/login', rateLimit({ max: 5, windowMs: 900000 }), loginHandler)
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
}

const db = await createConnection({
  driver: 'postgres',
  url:    process.env.DATABASE_URL,
  ssl:    { rejectUnauthorized: false }  // for NeonDB / managed PostgreSQL
})

class UserRepository extends BaseRepository<User> {
  constructor() { super(User, db) }
}

const users = new UserRepository()

const user = await users.create({ name: 'Tariq', email: 'tariq@syntaxility.dev' })
const page = await users.paginate({ page: 1, perPage: 20 })
```

### Migrations

Migrations automatically use the correct SQL syntax per database driver:

```typescript
// src/migrations/001_create_users.ts
import { Migration } from '@axil/orm'

const migration: Migration = {
  async up(db) {
    await db.query(`
      CREATE TABLE users (
        id         SERIAL PRIMARY KEY,
        name       VARCHAR(255) NOT NULL,
        email      VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `)
  },
  async down(db) {
    await db.query('DROP TABLE IF EXISTS users')
  }
}

module.exports = migration
```

```typescript
import { MigrationRunner } from '@axil/orm'
import path from 'path'

const runner = new MigrationRunner(
  db.getDriver(),
  path.join(__dirname, 'migrations')
)

await runner.up()     // Run pending migrations
await runner.down()   // Rollback last batch
await runner.status() // Show migration status
```

### Authentication

```typescript
import { JWT, hashPassword, verifyPassword,
         authenticate, requireRole } from '@axil/auth'

const jwt = new JWT(process.env.JWT_SECRET)

const hashed = await hashPassword('password123')
const valid  = await verifyPassword('password123', hashed)
const token  = jwt.sign({ sub: '1', role: 'admin' }, { expiresIn: '7d' })

app.get('/profile', authenticate(jwt), (req, res) => {
  res.success(req.locals.user, 'Profile fetched')
})

app.delete('/users/:id', authenticate(jwt), requireRole('admin'), (req, res) => {
  res.success(null, 'User deleted')
})
```

### Validation

```typescript
import { v, validate } from '@axil/validation'

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
const event = await bus.waitFor('payment.confirmed', 5000)
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
    wss.toRoomJSON('general', {
      type: 'message', from: client.id, content: msg.content
    })
  })
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

emailQueue.start()

await emailQueue.add('send-welcome', { to: 'tariq@syntaxility.dev' })
await emailQueue.add('send-reminder', { to: 'user@example.com' }, {
  delay: 3600000, maxAttempts: 3
})
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
```

### Circuit Breaker

```typescript
import { CircuitBreaker, retry, withTimeout } from '@axil/circuit'

const paymentCB = new CircuitBreaker('payment-api', {
  failureThreshold: 5,
  resetTimeoutMs:   30000,
  fallback: () => ({ error: 'Payment service unavailable' })
})

const result   = await paymentCB.execute(() => paymentService.charge(amount))
const data     = await retry(() => fetchAPI(), { attempts: 3, delay: 1000, backoff: 'exponential' })
const response = await withTimeout(fetch('https://api.example.com'), 5000)
```

### Observability

```typescript
import { Logger, MetricsRegistry, HealthChecker,
         Tracer, observabilityMiddleware,
         metricsHandler } from '@axil/observability'

const logger  = new Logger({ name: 'UserService' })
const metrics = new MetricsRegistry()
const health  = new HealthChecker()
const tracer  = new Tracer({ serviceName: 'my-api' })

health.addCheck('database', async () => {
  await db.ping()
  return { message: 'Connected' }
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
// or: new OllamaProvider({ model: 'llama3.2' })       — local, no API key
// or: new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY })
// or: new GeminiProvider({ apiKey: process.env.GOOGLE_API_KEY })

const response = await provider.complete({
  messages: [{ role: 'user', content: 'What is AxilJS?' }],
  system:   'You are a helpful assistant.'
})

const rag = new RAGPipeline({ provider, vectorStore: new VectorStore() })

await rag.index(loadFromText([
  'AxilJS supports PostgreSQL, MySQL and SQLite.',
  'The ORM provides migrations and a query builder.'
]))

const answer = await rag.query('What databases does AxilJS support?')

const agent = new Agent({
  provider,
  tools:         [calculatorTool, currentDateTimeTool],
  maxIterations: 10
})

const result = await agent.run('What is 25 * 4 and what time is it?')
```

### Memory Management

```typescript
import { MemoryMonitor, optimizer,
         memoryMiddleware, trackCache } from '@axil/memory'

const monitor = new MemoryMonitor({
  intervalMs:               30000,
  warnThresholdPercent:     70,
  criticalThresholdPercent: 85,
  autoFix:                  true
})

monitor.start()
app.use(memoryMiddleware({ leakThresholdMb: 50, exposeHeader: true }))
```

---

## Architecture Examples

AxilJS supports any backend architecture. Three complete examples are included:

### MVC — Blog Platform

```
examples/src/mvc/
├── models/          # Data + business logic
├── views/           # Response formatting
├── controllers/     # Request handling
└── routes/          # URL mapping
```

```bash
axil run src/mvc/main.ts     # Hot reload on port 3001
```

```
POST http://localhost:3001/api/auth/register
POST http://localhost:3001/api/auth/login
GET  http://localhost:3001/api/posts
POST http://localhost:3001/api/posts          [auth]
POST http://localhost:3001/api/posts/1/comments [auth]
```

---

### Monolith — E-Commerce API with PostgreSQL

```
examples/src/monolith/
├── services/        # AuthService, ProductService, CartService, OrderService
├── routes/          # auth, products, cart, orders
├── migrations/      # Database schema
└── db.ts            # PostgreSQL connection (NeonDB compatible)
```

```bash
axil run src/monolith/main.ts   # Hot reload on port 3002
```

```
POST http://localhost:3002/api/auth/register
POST http://localhost:3002/api/products        [admin]
POST http://localhost:3002/api/cart/add        [auth]
POST http://localhost:3002/api/orders/checkout [auth]
GET  http://localhost:3002/api/orders          [auth]
PATCH http://localhost:3002/api/orders/1/status [admin]
```

Features:
- PostgreSQL with NeonDB support (SSL)
- Automatic migrations (SERIAL for PostgreSQL, AUTOINCREMENT for SQLite)
- In-memory cart with stock validation
- Transactional checkout — stock reduced atomically
- Paginated responses via built-in response manager
- Soft delete for products
- Role-based access (admin/customer)

---

### Hot Reload for All Examples

```bash
npm run dev        # Main server — all phases
npm run dev:mvc    # MVC Blog — hot reload
npm run dev:mono   # Monolith E-Commerce — hot reload
```

`package.json`:

```json
{
  "scripts": {
    "dev":      "node ../packages/cli/dist/cli.js run",
    "dev:mvc":  "node ../packages/cli/dist/cli.js run src/mvc/main.ts",
    "dev:mono": "node ../packages/cli/dist/cli.js run src/monolith/main.ts"
  }
}
```

---

## Deployment

```bash
axil deploy
```

```
deploy/
├── Dockerfile
├── deployment.yaml   # Deployment + Service + HPA
└── deploy.sh
```

```bash
npm run build
node dist/main.js
node --expose-gc dist/main.js  # Recommended — enables manual GC

docker build -t my-api .
docker run -p 3000:3000 --env-file .env my-api

kubectl apply -f deploy/deployment.yaml
```

---

## Hot Reload Development

```bash
axil run                        # Watch src/
axil run src/mvc/main.ts        # Watch src/mvc/ with custom entry
axil run src/monolith/main.ts   # Watch src/monolith/ with custom entry
```

```
 AxilJS development server
 ─────────────────────────────────────

01:30:00 [axil run] Initial compilation...
01:30:02 [axil run] Compiled project in 1842ms
         ✓ Server running at http://localhost:3000
01:30:02 [axil run] Watching src/ for changes...

# Save a file →
01:31:15 [axil run] Changed: controllers/PostController.ts
01:31:15 [axil run] Compiled 1 file(s) in 287ms
01:31:15 [axil run] Restarting (restart #1)
         ✓ Server running at http://localhost:3000
```

---

## Build From Source

```bash
git clone https://github.com/SyntaxilitY/AxilJS.git
cd AxilJS

npm install

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
| Response Manager | ✗ | ✗ | ✗ | ✗ | ✓ |
| MVC Support | ✗ | Partial | ✓ | ✗ | ✓ |
| Monolith Support | ✓ | ✓ | ✓ | ✓ | ✓ |
| Microservice Support | ✓ | ✓ | ✓ | ✓ | ✓ |
| Zero Config | ✗ | ✗ | ✗ | Partial | ✓ |

---

## Roadmap

```
Phase 1: Core HTTP server, router, middleware, CLI
Phase 2: Config, security, package manager, SSE, static files
Phase 3: ORM, authentication, validation, testing
Phase 4: Events, WebSockets, queue, circuit breaker, observability
Phase 5: AI platform — providers, RAG, agents, MCP
Phase 6: Enterprise — multi-tenancy, audit, feature flags, cloud deploy
Phase 7: Memory management — leak detection, GC, optimization
Phase 8: Built-in SyntaxilitY response manager
Phase 9: Architecture examples — MVC, Monolith (PostgreSQL/NeonDB)
Phase 10: Hot reload with custom entry point support

Upcoming
────────
Phase 11    Microservice example with gRPC
Phase 12    Official AxilJS package registry
Phase 13    AxilJS Cloud (managed hosting)
Phase 14    AxilJS Studio (visual admin panel)
```

---

## Contributing

```bash
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

<div align="center">

**AxilJS** — *The JavaScript Backend That Finally Rests.*

A [SyntaxilitY](https://github.com/SyntaxilitY) open source project.
Built by [Tariq Mehmood](https://github.com/TariqMehmood1004).

⭐ Star this repo if AxilJS saves you from assembling another ecosystem from scratch.

</div>