<p align="center">
  <img src="assets/logo-mark-256.png" alt="AxilJS" width="112" height="112">
</p>

<h1 align="center">AxilJS</h1>

<p align="center">
  A modular TypeScript backend platform for Node.js: HTTP, data, auth, messaging, observability and AI in one consistent set of packages.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@axiljs/core"><img src="https://img.shields.io/npm/v/@axiljs/core.svg?label=npm" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/node-%3E%3D20-339933.svg" alt="Node.js 20 or later">
  <img src="https://img.shields.io/badge/TypeScript-first-3178C6.svg" alt="TypeScript">
  <a href="https://opencollective.com/axiljs"><img src="https://opencollective.com/axiljs/all/badge.svg?label=backers" alt="Open Collective backers"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="#packages">Packages</a> ·
  <a href="#cli">CLI</a> ·
  <a href="#project-templates">Templates</a> ·
  <a href="#usage">Usage</a> ·
  <a href="#contributing">Contributing</a>
</p>

---

## Overview

AxilJS provides the building blocks a production backend usually assembles from many unrelated libraries: an HTTP server and router, configuration, security middleware, an ORM with migrations, authentication, validation, testing, events, WebSockets, job queues, resilience patterns, observability, an AI toolkit, and a CLI that ties them together.

**Design principles**

- **Modular.** Every capability is a separate `@axiljs/*` package. Install only what you use.
- **Minimal dependencies.** Packages are built on Node.js built-ins (`node:http`, `node:crypto`, `node:cluster`, …). Database drivers (`pg`, `mysql2`, `better-sqlite3`) are optional peer dependencies loaded at runtime.
- **TypeScript-first.** All packages ship type definitions and are written in strict TypeScript.
- **Consistent conventions.** One response envelope, one error model and one project layout across every package.
- **Verified intent.** Decorators such as `tReadOnly`, `tTenantIsolated` and `tIdempotent` are checked while the code runs, so a method that breaks its declared contract fails in development instead of in production. See [`@axiljs/runtime`](packages/runtime#intent-verification).

> **Status:** AxilJS is pre-1.0 (`0.3.x`). APIs may change between minor versions. Pin exact versions in production and review the release notes before upgrading.

## Requirements

| Requirement | Version |
|---|---|
| Node.js | 20 or later |
| npm | 8 or later |
| TypeScript | 5.0 or later |

## Quick start

```bash
npm install -g @axiljs/cli

axil create my-api
cd my-api
axil run
```

The API starts on `http://localhost:3000`. In development, the AxilJS Studio dashboard starts on the next port (`http://localhost:3001`).

To use individual packages in an existing project instead:

```bash
npm install @axiljs/core @axiljs/validation
```

```typescript
import { Application } from '@axiljs/core'
import { v, validate } from '@axiljs/validation'

const app = new Application({ server: { port: 3000 } })

app.get('/health', (req, res) => {
  res.success({ uptime: process.uptime() }, 'OK')
})

app.post('/users',
  validate({ body: v.object({ name: v.string().min(2), email: v.string().email() }) }),
  (req, res) => res.created(req.body, 'User created')
)

app.listen()
```

## Packages

All packages are published under the `@axiljs` scope and are versioned together.

**HTTP and application**

| Package | Description |
|---|---|
| [`@axiljs/core`](packages/core) | HTTP server, trie router, middleware pipeline, SSE, static files, response envelope |
| [`@axiljs/common`](packages/common) | Shared types and error classes |
| [`@axiljs/config`](packages/config) | `.env` loading and typed configuration validation |
| [`@axiljs/security`](packages/security) | Security headers, rate limiting (shared across cluster workers), CSRF protection, input sanitization |
| [`@axiljs/auth`](packages/auth) | JWT, password hashing (scrypt), role- and permission-based access control |
| [`@axiljs/validation`](packages/validation) | Schema builder and request validation middleware |

**Data and messaging**

| Package | Description |
|---|---|
| [`@axiljs/orm`](packages/orm) | PostgreSQL, MySQL and SQLite; entities, repositories, query builder, migrations, transactions |
| [`@axiljs/events`](packages/events) | Event bus with wildcard subscriptions; optional broadcast to other cluster workers |
| [`@axiljs/websocket`](packages/websocket) | RFC 6455 WebSocket server with rooms and broadcasting |
| [`@axiljs/queue`](packages/queue) | Job queue with retries, backoff and optional durable file storage, and a cron scheduler |

**Reliability and operations**

| Package | Description |
|---|---|
| [`@axiljs/circuit`](packages/circuit) | Circuit breaker, retry and timeout utilities |
| [`@axiljs/observability`](packages/observability) | Structured logging, Prometheus metrics, W3C/B3 tracing, health checks |
| [`@axiljs/memory`](packages/memory) | Heap monitoring and leak detection for timers, caches and emitters |
| [`@axiljs/scale`](packages/scale) | Cluster supervisor, load generator, capacity planning, readiness checks |
| [`@axiljs/cloud`](packages/cloud) | Multi-tenancy, audit logging, feature flags, quotas, secrets, deployment manifests |

**AI**

| Package | Description |
|---|---|
| [`@axiljs/ai`](packages/ai) | OpenAI, Anthropic, Gemini and Ollama providers; vector store, RAG, agents, MCP client |

**Developer tooling**

| Package | Description |
|---|---|
| [`@axiljs/cli`](packages/cli) | The `axil` command-line tool |
| [`@axiljs/studio`](packages/studio) | Local development dashboard: routes, database browser, API collection export |
| [`@axiljs/testing`](packages/testing) | Test runner, assertions and HTTP test client |
| [`@axiljs/decorator`](packages/decorator) | Declarative `t*` decorators that record intent as metadata |
| [`@axiljs/runtime`](packages/runtime) | Executes decorator metadata: intent verification, resilience and concurrency interceptors, audit, redaction |
| [`@axiljs/pm`](packages/pm) | Package manager with lock file and checksum verification *(experimental)* |

## CLI

| Command | Description |
|---|---|
| `axil create <name>` | Create a project. Interactive in a terminal; use `--yes` with `--db=<none\|sqlite\|postgres\|mysql>`, `--auth`, `--ai`, `--ws`, `--queue` for non-interactive use |
| `axil create <name> --template <id>` | Create a project from a template (see below) |
| `axil run` | Start the development server with hot reload and Studio |
| `axil generate <kind> <name>` | Generate a `module`, `controller`, `service`, `entity` or `migration` (alias `axil g`) |
| `axil migrate [up\|down\|status]` | Run database migrations from `src/migrations` |
| `axil build` | Compile the project for production |
| `axil test [pattern]` | Run the test suite |
| `axil deploy` | Generate a Dockerfile and Kubernetes manifests |
| `axil capacity` | Check the scaling configuration against a throughput target |
| `axil install [package]` | Install a package (`-D` for a dev dependency) |
| `axil doctor` | Diagnose common project and environment issues |
| `axil decorator <list\|info\|search>` | Browse the decorator catalog |

Run `axil <command> --help` for the options of a single command.

## Project templates

`axil create --template <id>` starts from a complete, tested application instead of an empty scaffold.

| Template | Description |
|---|---|
| `minimal` | Routes, validation, CORS and tests |
| `rest-api` | CRUD on SQLite with JWT auth, validation and pagination |
| `realtime-chat` | WebSocket rooms, presence, history and JWT auth |
| `background-jobs` | Queued jobs, retries, cron schedules and events |
| `ai-assistant` | LLM chat, SSE streaming, RAG with sources and a tool-using agent |
| `saas-api` | Multi-tenant API with plans, feature flags, quotas, RBAC and audit log |
| `microservice` | Circuit breaker, retries, metrics, tracing and health probes |
| `webhook-receiver` | Signature verification, deduplication, queueing and retries |
| `live-dashboard` | Live metrics over SSE, Prometheus endpoint and health probes |
| `high-scale-api` | Multi-core cluster, capacity plan and runtime decorators |

Generated versions of several templates are kept in [`examples/`](examples/).

## Project structure

```
my-api/
├── src/
│   ├── main.ts
│   ├── config/
│   ├── modules/
│   │   └── users/
│   │       ├── controllers/
│   │       ├── services/
│   │       └── entities/
│   └── migrations/
├── .env
├── .env.example
├── package.json
└── tsconfig.json
```

## Response format

Every handler has envelope helpers on `res`, so all endpoints return the same shape:

```typescript
res.success(data, 'Users fetched')
res.created(data, 'User created')
res.paginated(items, total, page, limit, 'Users fetched')
res.badRequest('Missing required field')
res.notFound('User not found')
```

```json
{
  "status": 200,
  "code": "HTTP_200_OK",
  "message": "Users fetched",
  "data": {}
}
```

Errors thrown in a handler, or passed to `next(err)`, are converted to a JSON error response. Messages for `500` errors are hidden when `NODE_ENV=production`.

## Studio

In development, `axil run` starts AxilJS Studio on the application port + 1. It provides:

- **API explorer:** every registered route, with a request panel for trying it out
- **Database browser:** tables, columns, constraints and paginated rows (read-only)
- **SQL editor:** read-only `SELECT` queries
- **Realtime monitor:** WebSocket and SSE connections
- **Export:** Postman v2.1, Insomnia and OpenAPI 3.0 collections generated from the routes

Studio opens in the browser automatically; pass `openBrowser: false` in the Studio configuration to disable this.

## Configuration

Configuration is read from environment variables, typically through a `.env` file:

```env
PORT=3000
NODE_ENV=development

JWT_SECRET=change-me-to-a-random-value-of-32-or-more-characters

# SQLite: DATABASE_FILENAME=./dev.db
DATABASE_URL=postgres://user:password@localhost:5432/app

# AI providers (only the ones you use)
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_API_KEY=
OLLAMA_URL=http://localhost:11434
```

## Usage

<details>
<summary><strong>Configuration and security</strong></summary>

```typescript
import { Application, cors } from '@axiljs/core'
import { loadEnv, defineConfig } from '@axiljs/config'
import { helmet, rateLimit, csrf, sanitize } from '@axiljs/security'

loadEnv()

const config = defineConfig({
  PORT:         { type: 'number', default: 3000 },
  DATABASE_URL: { type: 'string', required: true },
  NODE_ENV:     { type: 'string', enum: ['development', 'production', 'test'], default: 'development' }
})

const app = new Application({ server: { port: config.PORT } })

app.use(helmet())
app.use(cors({ origin: 'https://app.example.com' }))
app.use(rateLimit({ max: 100, windowMs: 60_000 }))
app.use(csrf())
app.use(sanitize())
```

</details>

<details>
<summary><strong>ORM and migrations</strong></summary>

```typescript
import { createConnection, Entity, Column, PrimaryKey, BaseRepository } from '@axiljs/orm'

@Entity('users')
class User {
  @PrimaryKey()
  id: number

  @Column({ type: 'string', length: 255 })
  name: string

  @Column({ type: 'string', unique: true })
  email: string
}

const db = await createConnection({ driver: 'postgres', url: process.env.DATABASE_URL })

class UserRepository extends BaseRepository<User> {
  constructor() { super(User, db) }
}

const users = new UserRepository()
await users.create({ name: 'Jane Doe', email: 'jane@example.com' })
const page = await users.paginate({ page: 1, perPage: 20 })
```

```typescript
// src/migrations/001_create_users.ts
import { Migration } from '@axiljs/orm'

const migration: Migration = {
  async up(db) {
    await db.query(`
      CREATE TABLE users (
        id    SERIAL PRIMARY KEY,
        name  VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL
      )
    `)
  },
  async down(db) {
    await db.query('DROP TABLE IF EXISTS users')
  }
}

module.exports = migration
```

Run migrations with `axil migrate up`, `axil migrate down` or `axil migrate status`.

</details>

<details>
<summary><strong>Authentication and authorization</strong></summary>

```typescript
import { JWT, hashPassword, verifyPassword, authenticate, requireRole } from '@axiljs/auth'

const jwt = new JWT(process.env.JWT_SECRET)

const hash  = await hashPassword(password)
const valid = await verifyPassword(password, hash)
const token = jwt.sign({ sub: user.id, role: user.role }, { expiresIn: '7d' })

app.get('/profile', authenticate(jwt), (req, res) => {
  res.success(req.locals.user, 'Profile fetched')
})

app.delete('/users/:id', authenticate(jwt), requireRole('admin'), (req, res) => {
  res.success(null, 'User deleted')
})
```

</details>

<details>
<summary><strong>Testing</strong></summary>

```typescript
import { describe, it, expect, beforeAll, createTestClient } from '@axiljs/testing'

describe('Users API', () => {
  let client: ReturnType<typeof createTestClient>
  beforeAll(() => { client = createTestClient(app) })

  it('rejects requests without a token', async () => {
    const res = await client.get('/users')
    expect(res.status).toBe(401)
  })
})
```

</details>

<details>
<summary><strong>Events, WebSockets and queues</strong></summary>

```typescript
import { EventBus, OnEvent, registerEventHandlers } from '@axiljs/events'

const bus = new EventBus()

class Notifications {
  @OnEvent('user.created')
  async onUserCreated(event) { /* send welcome email */ }

  @OnEvent('order.*')
  async onOrderEvent(event) { /* any order event */ }
}

registerEventHandlers(new Notifications(), bus)
await bus.emit('user.created', { id: 1 })
```

```typescript
import { WSServer } from '@axiljs/websocket'

const wss = new WSServer(app.getServer(), { path: '/ws' })

wss.on('connection', (client) => {
  wss.join(client, 'general')
  client.on('message', (data) => {
    wss.toRoomJSON('general', { from: client.id, content: JSON.parse(data.toString()).content })
  })
})
```

```typescript
import { Queue, Scheduler } from '@axiljs/queue'

const emails = new Queue('emails', { concurrency: 5 })
emails.process('send-welcome', async (job) => sendEmail(job.data.to))
emails.start()
await emails.add('send-welcome', { to: 'user@example.com' }, { maxAttempts: 3 })

const scheduler = new Scheduler()
scheduler.schedule('cleanup', '0 2 * * *', cleanupOldData)
scheduler.start()
```

</details>

<details>
<summary><strong>Resilience and observability</strong></summary>

```typescript
import { CircuitBreaker, retry, withTimeout } from '@axiljs/circuit'

const payments = new CircuitBreaker('payments', { failureThreshold: 5, resetTimeoutMs: 30_000 })
const result = await payments.execute(() => paymentService.charge(amount))
const data   = await retry(() => fetchUpstream(), { attempts: 3, delay: 1000, backoff: 'exponential' })
const reply  = await withTimeout(fetch('https://api.example.com'), 5000)
```

```typescript
import { MetricsRegistry, Tracer, HealthChecker, observabilityMiddleware, metricsHandler } from '@axiljs/observability'

const metrics = new MetricsRegistry()
const tracer  = new Tracer({ serviceName: 'my-api' })
const health  = new HealthChecker()

health.addCheck('database', async () => { await db.ping(); return { message: 'ok' } })

app.use(observabilityMiddleware({ metrics, tracer }))
app.get('/health/live',  health.livenessHandler())
app.get('/health/ready', health.readinessHandler())
app.get('/metrics',      metricsHandler(metrics))
```

</details>

<details>
<summary><strong>AI providers, RAG and agents</strong></summary>

```typescript
import { OpenAIProvider, RAGPipeline, VectorStore, Agent, loadFromText, calculatorTool } from '@axiljs/ai'

const provider = new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY })
// AnthropicProvider, GeminiProvider and OllamaProvider share the same interface.

const rag = new RAGPipeline({ provider, vectorStore: new VectorStore() })
await rag.index(loadFromText(['AxilJS supports PostgreSQL, MySQL and SQLite.']))
const answer = await rag.query('Which databases are supported?')

const agent  = new Agent({ provider, tools: [calculatorTool], maxIterations: 10 })
const result = await agent.run('What is 25 * 4?')
```

</details>

Each package's README contains its full API reference.

## Deployment

```bash
axil build
axil deploy        # writes deploy/Dockerfile, deploy/deployment.yaml and deploy/deploy.sh
```

```bash
docker build -t my-api -f deploy/Dockerfile .
docker run -p 3000:3000 --env-file .env my-api

kubectl apply -f deploy/deployment.yaml
```

The generated Kubernetes manifest includes a Deployment, a Service and a HorizontalPodAutoscaler. Replica counts and resources can be sized from `axil.scaling.json`; see [`@axiljs/scale`](packages/scale).

## Building from source

```bash
git clone https://github.com/SyntaxilitY/AxilJS.git
cd AxilJS
npm ci
npm run build:all
```

`build:all` builds the packages in dependency order. Each package has a Vitest suite:

```bash
cd packages/core
npx vitest run
```

## Roadmap

Planned work includes:

- AxilJS Cloud: managed hosting for AxilJS applications
- AI-assisted code generation in Studio
- A stable 1.0 API

Feature requests and proposals are welcome as [issues](https://github.com/SyntaxilitY/AxilJS/issues).

## Sponsors

AxilJS is developed and maintained by [SyntaxilitY](https://github.com/SyntaxilitY). Sponsorship funds maintenance, documentation and infrastructure. Contributions and expenses are public on [Open Collective](https://opencollective.com/axiljs).

[![Sponsors](https://opencollective.com/axiljs/sponsors.svg?width=890)](https://opencollective.com/axiljs)

[![Backers](https://opencollective.com/axiljs/backers.svg?width=890)](https://opencollective.com/axiljs)

[Become a sponsor](https://opencollective.com/axiljs/contribute)

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. All participants are expected to follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Do not report security vulnerabilities through public issues. See [SECURITY.md](SECURITY.md) for private reporting.

## License

[MIT](LICENSE) © Tariq Mehmood and SyntaxilitY
