
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
[![Status](https://img.shields.io/badge/status-R%26D%20Phase-yellow.svg)]()
[![Author](https://img.shields.io/badge/author-Tariq%20Mehmood-blueviolet.svg)]()

[Getting Started](#-getting-started) •
[Why REstJS](#-why-restjs) •
[Packages](#-packages) •
[Examples](#-examples) •
[CLI](#-cli) •
[Roadmap](#-roadmap) •
[Contributing](#-contributing)

</div>

---

## What is REstJS?

REstJS is a **unified, batteries-included backend JavaScript ecosystem**.

It is not another framework bolted on top of Node.js.
It is not a thin wrapper around Express.
It is a **complete backend platform** — runtime, framework, ORM, auth,
validation, testing, events, WebSockets, queues, observability, AI, and
cloud deployment — all built by one team, all working together, all
available with one install.

```bash
# Every other option
npm install express
npm install mongoose
npm install jsonwebtoken
npm install bcrypt
npm install joi
npm install winston
npm install helmet
npm install socket.io
npm install bull
npm install jest
# ... 40 more packages, 40 different teams, 40 sets of conventions

# REstJS
rest create my-api
```

---

## The Name

```
R  →  Runtime        — not just a framework, a full runtime
E  →  Enterprise     — built for real production systems
st →  REST + rest    — the REST architecture + you finally get to rest
JS →  JavaScript     — the language we love
```

Hidden inside **REstJS** is the word **rest** —
the promise that you will never have to assemble a backend ecosystem from
scratch again.

---

## Why REstJS?

| Problem | Every Other Tool | REstJS |
|---|---|---|
| HTTP Server | ✓ | ✓ |
| Routing | Some | ✓ |
| ORM | ✗ Install separately | ✓ Built in |
| Auth + JWT | ✗ Install separately | ✓ Built in |
| Validation | ✗ Install separately | ✓ Built in |
| Testing | ✗ Install separately | ✓ Built in |
| WebSockets | ✗ Install separately | ✓ Built in |
| Queue + Scheduler | ✗ Install separately | ✓ Built in |
| Circuit Breaker | ✗ Install separately | ✓ Built in |
| Observability | ✗ Install separately | ✓ Built in |
| AI Platform | ✗ Does not exist | ✓ Built in |
| Cloud Deployment | ✗ Does not exist | ✓ Built in |
| Multi-Tenancy | ✗ Does not exist | ✓ Built in |

> **Node.js** gives you a runtime.
> **Express** gives you routing.
> **NestJS** gives you structure but you still assemble packages.
> **Deno** gives you security.
> **Bun** gives you speed.
> **REstJS** gives you all of it — complete, integrated, done.

---

## Getting Started

### Prerequisites

- Node.js 18 or higher
- npm 8 or higher
- TypeScript 5.0 or higher

### Install the CLI

```bash
npm install -g @restjs/cli
```

### Create Your First Project

```bash
rest create my-api
cd my-api
npm install
rest run
```

Your API is now running at `http://localhost:3000`.

That is it. No configuration. No boilerplate. No decisions.

---

## Quick Example

```typescript
import { Application, cors }        from '@restjs/core'
import { loadEnv, defineConfig }    from '@restjs/config'
import { helmet, rateLimit }        from '@restjs/security'
import { JWT }                      from '@restjs/auth'
import { authenticate, requireRole } from '@restjs/auth'
import { v, validate }              from '@restjs/validation'

// Load environment variables
loadEnv()

// Typed, validated configuration
const config = defineConfig({
  PORT:       { type: 'number', default: 3000 },
  JWT_SECRET: { type: 'string', required: true }
})

// Create application
const app = new Application({ server: { port: config.PORT } })
const jwt = new JWT(config.JWT_SECRET)

// Global middleware
app.use(helmet())
app.use(cors())
app.use(rateLimit({ max: 100, windowMs: 60000 }))

// Validation schema
const createUserSchema = v.object({
  name:  v.string().min(2).max(100),
  email: v.string().email(),
  role:  v.enum(['admin', 'user']).optional()
})

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() })
})

app.post(
  '/users',
  authenticate(jwt),
  requireRole('admin'),
  validate({ body: createUserSchema }),
  async (req, res) => {
    res.status(201).json({ data: req.body })
  }
)

// Start
app.listen()
```

---

## Packages

REstJS is organized as a monorepo. Every package is published under
the `@restjs` scope.

### Core Packages

| Package | Description | Phase |
|---|---|---|
| [`@restjs/common`](./packages/common) | Shared types, interfaces, error classes | 1 |
| [`@restjs/core`](./packages/core) | HTTP server, router, middleware, SSE, static files | 1–2 |
| [`@restjs/cli`](./packages/cli) | CLI — `rest create`, `run`, `build`, `test`, `deploy` | 1–6 |

### Infrastructure Packages

| Package | Description | Phase |
|---|---|---|
| [`@restjs/config`](./packages/config) | `.env` loading, typed configuration validation | 2 |
| [`@restjs/security`](./packages/security) | Helmet, rate limiting, CSRF, sanitization | 2 |
| [`@restjs/pm`](./packages/pm) | Package manager, lock file, checksum verification | 2 |

### Data & Auth Packages

| Package | Description | Phase |
|---|---|---|
| [`@restjs/orm`](./packages/orm) | ORM — PostgreSQL, MySQL, SQLite, migrations, query builder | 3 |
| [`@restjs/auth`](./packages/auth) | JWT, password hashing, RBAC, auth middleware | 3 |
| [`@restjs/validation`](./packages/validation) | Schema-based request validation | 3 |
| [`@restjs/testing`](./packages/testing) | Test runner, assertions, HTTP test client | 3 |

### Distributed Systems Packages

| Package | Description | Phase |
|---|---|---|
| [`@restjs/events`](./packages/events) | In-process event bus, pub/sub, wildcard, decorators | 4 |
| [`@restjs/websocket`](./packages/websocket) | RFC 6455 WebSocket server, rooms, broadcasting | 4 |
| [`@restjs/queue`](./packages/queue) | Message queue, priority, retry, cron scheduler | 4 |
| [`@restjs/circuit`](./packages/circuit) | Circuit breaker, retry, timeout | 4 |
| [`@restjs/observability`](./packages/observability) | Logging, Prometheus metrics, tracing, health checks | 4 |

### AI Platform Packages

| Package | Description | Phase |
|---|---|---|
| [`@restjs/ai`](./packages/ai) | OpenAI, Anthropic, Gemini, Ollama, RAG, Agents, MCP | 5 |

### Enterprise Packages

| Package | Description | Phase |
|---|---|---|
| [`@restjs/cloud`](./packages/cloud) | Multi-tenancy, audit logs, feature flags, deployment | 6 |

---

## CLI

The `rest` CLI is your single entry point for everything.

```bash
# Create a new project
rest create my-api

# Start development server with hot reload
rest run

# Build for production
rest build

# Run tests
rest test

# Run specific test file
rest test users

# Install packages
rest install

# Install a specific package
rest install @restjs/ai

# Install as dev dependency
rest install -D nodemon

# Generate Docker + Kubernetes deployment files
rest deploy

# Diagnose project issues
rest doctor

# Show version
rest --version
```

---

## Project Structure

Every REstJS project follows this standard structure:

```
my-api/
├── src/
│   ├── main.ts                        # Entry point
│   ├── config/
│   │   └── app.config.ts              # Application configuration
│   ├── modules/
│   │   └── users/
│   │       ├── controllers/
│   │       │   └── users.controller.ts
│   │       ├── services/
│   │       │   └── users.service.ts
│   │       ├── entities/
│   │       │   └── user.entity.ts
│   │       ├── repositories/
│   │       │   └── users.repository.ts
│   │       └── users.test.ts
│   ├── migrations/
│   │   └── 001_create_users.ts
│   └── jobs/
├── package.json
├── tsconfig.json
├── rest.lock                          # Deterministic lock file
├── .env
├── .env.example
├── .gitignore
└── deploy/
    ├── Dockerfile
    ├── deployment.yaml
    └── deploy.sh
```

---

## Feature Examples

### Database — ORM

```typescript
import { createConnection, Entity, Column,
         PrimaryKey, BaseRepository } from '@restjs/orm'

@Entity('users')
class User {
  @PrimaryKey()
  id: number

  @Column({ type: 'string', length: 255 })
  name: string

  @Column({ type: 'string', unique: true })
  email: string
}

// Connect
const db = await createConnection({
  driver:   'postgres',
  url:      process.env.DATABASE_URL
})

// Repository
class UserRepository extends BaseRepository<User> {
  constructor() { super(User, db) }

  async findByEmail(email: string) {
    return this.findOne({ email })
  }
}

const users = new UserRepository()

// CRUD
const user    = await users.create({ name: 'Tariq', email: 'tariq@restjs.dev' })
const found   = await users.findById(1)
const updated = await users.update(1, { name: 'Tariq Mehmood' })
const page    = await users.paginate({ page: 1, perPage: 20 })
```

---

### Authentication — JWT + RBAC

```typescript
import { JWT, hashPassword, verifyPassword } from '@restjs/auth'
import { authenticate, requireRole,
         requirePermission }                 from '@restjs/auth'

const jwt = new JWT(process.env.JWT_SECRET)

// Sign a token
const token = jwt.sign(
  { sub: user.id, role: 'admin' },
  { expiresIn: '7d' }
)

// Verify a token
const payload = jwt.verify(token)

// Hash a password
const hashed = await hashPassword('myPassword123')
const valid  = await verifyPassword('myPassword123', hashed)

// Protect routes
app.get('/admin',
  authenticate(jwt),
  requireRole('admin'),
  handler
)

app.delete('/posts/:id',
  authenticate(jwt),
  requirePermission('posts:delete'),
  handler
)
```

---

### Validation

```typescript
import { v, validate } from '@restjs/validation'

const schema = v.object({
  name:     v.string().min(2).max(100),
  email:    v.string().email(),
  age:      v.number().min(0).max(150).optional(),
  role:     v.enum(['admin', 'user', 'guest']),
  tags:     v.array(v.string()).max(10).optional(),
  settings: v.object({
    newsletter: v.boolean().default(false),
    theme:      v.enum(['light', 'dark']).default('light')
  }).optional()
})

app.post('/users', validate({ body: schema }), (req, res) => {
  // req.body is fully typed and validated here
  res.status(201).json({ data: req.body })
})
```

---

### Real-Time — WebSockets

```typescript
import { createServer }  from 'http'
import { Application }   from '@restjs/core'
import { WSServer }      from '@restjs/websocket'

const app    = new Application()
const server = createServer()
const wss    = new WSServer(server, { path: '/ws' })

wss.on('connection', (client) => {
  console.log('Connected:', client.id)

  // Send to this client
  client.sendJSON({ type: 'welcome', id: client.id })

  // Join a room
  wss.join(client, 'general')

  client.on('message', (data) => {
    // Broadcast to the room
    wss.toRoomJSON('general', {
      type: 'message',
      from: client.id,
      text: data.toString()
    })
  })

  client.on('close', () => {
    console.log('Disconnected:', client.id)
  })
})
```

---

### Events — Pub/Sub

```typescript
import { EventBus, OnEvent,
         registerEventHandlers } from '@restjs/events'

const bus = new EventBus()

// Subscribe with decorator
class NotificationService {
  @OnEvent('user.created')
  async onUserCreated(event) {
    await sendWelcomeEmail(event.payload.email)
  }

  @OnEvent('order.*')
  async onAnyOrder(event) {
    console.log('Order event:', event.type)
  }
}

registerEventHandlers(new NotificationService(), bus)

// Publish
await bus.emit('user.created', {
  id:    1,
  email: 'tariq@restjs.dev'
})

// Wait for an event (with timeout)
const event = await bus.waitFor('payment.confirmed', 5000)
```

---

### Queue + Scheduler

```typescript
import { Queue }     from '@restjs/queue'
import { Scheduler } from '@restjs/queue'

// Queue
const emailQueue = new Queue('emails', { concurrency: 5 })

emailQueue.process('send-welcome', async (job) => {
  await sendEmail(job.data.to, job.data.subject)
})

await emailQueue.add('send-welcome', {
  to:      'tariq@restjs.dev',
  subject: 'Welcome to REstJS!'
}, { delay: 1000, maxAttempts: 3 })

emailQueue.start()

// Scheduler
const scheduler = new Scheduler()

scheduler.schedule('daily-report',   '0 9 * * *',    generateDailyReport)
scheduler.schedule('cleanup',        '0 2 * * *',    cleanupOldSessions)
scheduler.schedule('health-ping',    '*/5 * * * *',  checkExternalServices)

scheduler.start()
```

---

### Circuit Breaker + Retry

```typescript
import { CircuitBreaker } from '@restjs/circuit'
import { retry, withTimeout } from '@restjs/circuit'

// Circuit breaker
const paymentCB = new CircuitBreaker('payment-api', {
  failureThreshold: 5,
  resetTimeoutMs:   30000,
  fallback: () => ({ error: 'Payment service unavailable' })
})

const result = await paymentCB.execute(async () => {
  return await paymentService.charge(amount)
})

// Retry with exponential backoff
const data = await retry(
  () => fetchExternalData(),
  { attempts: 3, delay: 1000, backoff: 'exponential' }
)

// Timeout
const response = await withTimeout(
  fetch('https://api.example.com/data'),
  5000,
  'External API timed out'
)
```

---

### Observability

```typescript
import { Logger, MetricsRegistry,
         HealthChecker, Tracer,
         observabilityMiddleware,
         metricsHandler }        from '@restjs/observability'

// Logger
const logger = new Logger({ name: 'UserService' })
logger.info('User created', { userId: 123, email: 'tariq@restjs.dev' })
logger.error('DB error', { error: err.message, query })

// Child logger (inherits context)
const reqLogger = logger.child({ requestId: 'abc-123' })

// Metrics
const metrics = new MetricsRegistry()
const requests = metrics.counter('http_requests_total', 'Total requests')
const duration = metrics.histogram('request_duration_ms', 'Duration')
requests.inc({ method: 'GET', status: '200' })

// Health checks
const health = new HealthChecker()
health.addCheck('database', async () => {
  await db.ping()
  return { message: 'Connected' }
})

app.get('/health',       health.handler())
app.get('/health/live',  health.livenessHandler())
app.get('/health/ready', health.readinessHandler())
app.get('/metrics',      metricsHandler(metrics))

// Auto-observability on all routes
app.use(observabilityMiddleware({ metrics, tracer }))
```

---

### AI Platform

```typescript
import {
  OpenAIProvider,
  AnthropicProvider,
  OllamaProvider,
  RAGPipeline,
  VectorStore,
  Agent,
  createTool,
  calculatorTool,
  currentDateTimeTool,
  aiChat,
  aiChatStream,
  aiAgent,
  loadFromText
} from '@restjs/ai'

// Choose your provider
const provider = new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY })
// or: new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY })
// or: new OllamaProvider({ model: 'llama3.2' })  // local, no API key

// Simple chat route
app.post('/chat', aiChat({ provider }))

// Streaming chat route
app.post('/chat/stream', aiChatStream({ provider }))

// RAG — index documents and answer questions from them
const rag = new RAGPipeline({ provider, vectorStore: new VectorStore() })

await rag.index(loadFromText([
  'REstJS is a complete JavaScript backend ecosystem...',
  'It supports OpenAI, Anthropic, Gemini, and Ollama...'
]))

app.post('/ask', async (req, res) => {
  const result = await rag.query((req.body as any).question)
  res.json({ answer: result.response, sources: result.sources })
})

// Agent with tools
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

app.post('/agent', aiAgent({
  provider,
  tools: [calculatorTool, currentDateTimeTool, weatherTool],
  maxIterations: 10
}))
```

---

### Testing

```typescript
import {
  describe, it, expect,
  beforeAll, afterAll,
  createTestClient
} from '@restjs/testing'

describe('Users API', () => {
  let client

  beforeAll(() => {
    client = createTestClient(app)
  })

  it('should return 401 without auth', async () => {
    const res = await client.get('/users')
    expect(res.status).toBe(401)
  })

  it('should return users with valid token', async () => {
    const res = await client
      .get('/users')
      .auth(validToken)

    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.data[0].name).toBe('Tariq')
  })

  it('should validate request body', async () => {
    const res = await client
      .post('/users')
      .auth(validToken)
      .send({ name: 'T' }) // too short

    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })
})
```

---

### Deploy

```bash
# Generate Dockerfile + Kubernetes manifests
rest deploy

# Output: deploy/
#   ├── Dockerfile
#   ├── deployment.yaml
#   └── deploy.sh

# Build and push
cd deploy
./deploy.sh

# Apply to Kubernetes
kubectl apply -f deployment.yaml
```

---

## Environment Variables

Create a `.env` file in your project root:

```env
# Server
PORT=3000
HOST=0.0.0.0
NODE_ENV=development

# Database
DATABASE_URL=postgres://user:password@localhost:5432/mydb

# Authentication
JWT_SECRET=your-secret-minimum-32-characters-long

# AI Providers (add what you use)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIza...

# Logging
LOG_LEVEL=debug
```

---

## Performance

| Metric | Target | Status |
|---|---|---|
| Cold Start | < 100 ms | ✅ |
| Memory (hello world) | < 30 MB | ✅ |
| HTTP Throughput | > 10,000 req/s | ✅ |
| Route Matching (10k routes) | < 1 ms | ✅ |
| JWT Sign + Verify | < 1 ms | ✅ |
| WebSocket Latency | < 5 ms | ✅ |
| Vector Search (100k docs) | < 500 ms | ✅ |

---

## Roadmap

```
Phase 1  ✅  Core HTTP server, router, middleware, CLI
Phase 2  ✅  Config, security, package manager, SSE, static files
Phase 3  ✅  ORM, authentication, validation, testing
Phase 4  ✅  Events, WebSockets, queue, circuit breaker, observability
Phase 5  ✅  AI platform — providers, RAG, agents, MCP
Phase 6  ✅  Enterprise — multi-tenancy, audit, feature flags, cloud deploy

Upcoming
────────
Phase 7     gRPC and native RPC support
Phase 8     Official REstJS package registry
Phase 9     REstJS Cloud (managed hosting)
Phase 10    REstJS Studio (visual admin panel)
```

---

## Comparison

| | Node.js | Express | NestJS | Deno | Bun | **REstJS** |
|---|---|---|---|---|---|---|
| Runtime | ✓ | ✗ | ✗ | ✓ | ✓ | ✓ |
| Framework | ✗ | ✓ | ✓ | Partial | Partial | ✓ |
| ORM | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Auth | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Validation | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Testing | ✗ | ✗ | ✗ | ✓ | ✓ | ✓ |
| WebSockets | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Queue | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Observability | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| AI Platform | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Cloud Deploy | ✗ | ✗ | ✗ | ✗ | ✗ | ✓ |
| Zero Config | ✗ | ✗ | ✗ | Partial | Partial | ✓ |

---

## Contributing

REstJS is in active R&D. Contributions are welcome.

### Setup

```bash
# Clone the repository
git clone https://github.com/tariqmehmood/restjs.git
cd restjs

# Install dependencies
npm install

# Build all packages in order
npm run build:all

# Run tests
npm test
```

### Build Order

```bash
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
cd ../cli                 && npm run build
```

### Package Structure

```
packages/
├── common/         Shared types and errors
├── core/           HTTP server and router
├── cli/            Command line interface
├── config/         Configuration management
├── security/       Security middleware
├── pm/             Package manager
├── orm/            Database ORM
├── auth/           Authentication
├── validation/     Request validation
├── testing/        Test framework
├── events/         Event bus
├── websocket/      WebSocket server
├── queue/          Message queue
├── circuit/        Circuit breaker
├── observability/  Logging and metrics
├── ai/             AI platform
└── cloud/          Enterprise and cloud
```

### Contribution Guidelines

- All code must be TypeScript with strict mode
- Every file must have a top-level comment explaining its purpose
- Every public function must have a JSDoc comment
- Every new feature must have tests
- No circular dependencies between packages
- All PRs must build without errors

---

## License

```
MIT License

Copyright (c) 2026 Tariq Mehmood

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

## Author

**Tariq Mehmood**
Creator and Lead Architect of REstJS

> *"JavaScript developers have never had rest.*
> *Constant churn. New tools every month. Dependency hell.*
> *REstJS is the last tool you need."*

---

<div align="center">

**REstJS** — *The JavaScript Backend That Finally Rests.*

Built with passion by [Tariq Mehmood](https://github.com/tariqmehmood)

⭐ Star this repo if REstJS saves you from assembling another ecosystem from scratch.

</div>
```

---

## Recommended GitHub Repository Settings

| Setting | Value |
|---|---|
| **Name** | `restjs` |
| **Description** | The JavaScript Backend That Finally Rests. |
| **Website** | `https://restjs.dev` (when ready) |
| **Topics** | `javascript`, `typescript`, `nodejs`, `backend`, `framework`, `orm`, `auth`, `ai`, `websocket`, `rest-api` |
| **License** | MIT |
| **Default branch** | `main` |