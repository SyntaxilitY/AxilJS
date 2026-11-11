/**
 * Template: high-scale-api
 *
 * An API built to run on every core and many machines: @axiljs/scale's
 * serve() (one worker per core, crash restart, graceful drain) sized by
 * axil.scaling.json, plus @axiljs/runtime executing @axiljs/decorator
 * metadata: request context (AsyncLocalStorage), tRetry / tTimeout / tAudit
 * interceptors and tRedact / tSensitive response redaction. Tests build the
 * app in a single process; they never fork the cluster.
 */

import type { ProjectTemplate, TemplateContext } from './types'

export const highScaleApiTemplate: ProjectTemplate = {
  id:       'high-scale-api',
  title:    'High-scale API',
  summary:  'Cluster on every core, capacity plan, runtime decorators',
  category: 'Production',
  highlights: [
    'serve(): one worker per core, restarts, drain',
    'axil.scaling.json for axil capacity and deploy',
    'tRetry / tTimeout / tAudit wired by @axiljs/runtime',
    'Request context and request ids without passing req',
    'tRedact fields never leave the API'
  ],
  packages: ['@axiljs/core', '@axiljs/scale', '@axiljs/runtime', '@axiljs/decorator', '@axiljs/events', '@axiljs/config', '@axiljs/testing'],
  port:     3009,

  dependencies: ctx => ({
    '@axiljs/config':    ctx.axilRange,
    '@axiljs/core':      ctx.axilRange,
    '@axiljs/decorator': ctx.axilRange,
    '@axiljs/events':    ctx.axilRange,
    '@axiljs/runtime':   ctx.axilRange,
    '@axiljs/scale':     ctx.axilRange
  }),

  files: (ctx: TemplateContext) => ({
    'README.md': `# ${ctx.name}

A high-scale [AxilJS](https://github.com/SyntaxilitY/AxilJS) API, created with
\`axil create ${ctx.name} --template high-scale-api\`.

It shows how an AxilJS service uses every core of a machine, how many machines it
needs for a target, and how decorators turn into real behaviour at runtime:

- **@axiljs/scale**: \`serve()\` runs one worker process per core (node:cluster), restarts
  crashed workers with backoff and drains them on SIGTERM. \`axil.scaling.json\` holds the
  target and the machine shape; \`axil capacity\` checks it, \`axil deploy\` sizes Kubernetes from it.
- **@axiljs/runtime**:
  - \`requestContext()\`: one AsyncLocalStorage context per request; \`getContext()\` reads the
    request id deep inside a service without passing \`req\` around
  - \`wire()\` executes \`@tRetry\`, \`@tTimeout\` and \`@tAudit\` on service methods
  - \`redactResponses()\` applies \`@tRedact\` (remove, mask, hash) to every response body, so
    password hashes and API keys never leave the API
- **@axiljs/decorator**: the \`t*\` decorators only record metadata; the runtime decides what they do
- **@axiljs/events**: audit events arrive on the global event bus (\`audit.log\`)
- **@axiljs/testing**: tests drive \`createApp()\` in one process; the cluster is never forked in tests

## Run

\`\`\`bash
npm install
cp .env.example .env        # PowerShell: Copy-Item .env.example .env
npm run dev                 # AXIL_WORKERS=1 from .env: one process, http://localhost:3009
\`\`\`

All cores:

\`\`\`bash
npm run build
AXIL_WORKERS=auto NODE_ENV=production npm start      # one worker per core
\`\`\`

PowerShell:

\`\`\`powershell
npm run build
$env:AXIL_WORKERS = 'auto'; $env:NODE_ENV = 'production'; npm start
\`\`\`

\`AXIL_WORKERS\` overrides \`vertical.workers\` in \`axil.scaling.json\` (\`auto\` = one per core).
Every worker listens on the same port; the primary only supervises. \`servedBy\` in the
responses below is the worker's pid, so repeated requests show the load spreading.

## Test

\`\`\`bash
npm test                    # axil test: compiles with tsc, runs src/**/*.test.ts
\`\`\`

## Endpoints

| Method | Path                       | Description                                       | Success | Errors   |
|--------|----------------------------|---------------------------------------------------|---------|----------|
| GET    | \`/\`                        | Service name, version, worker pid                 | 200     |          |
| GET    | \`/health/live\`             | Liveness (used by the \`axil deploy\` manifest)     | 200     |          |
| GET    | \`/health/ready\`            | Readiness (used by the \`axil deploy\` manifest)    | 200     |          |
| GET    | \`/api/users?limit=20\`      | Users, redacted; \`limit\` 1-100                    | 200     |          |
| GET    | \`/api/users/:id\`           | One user, redacted; audited, retried, 250 ms deadline | 200  | 404, 503, 504 |
| GET    | \`/api/users/:id/activity\`  | Recent activity; audited, 300 ms deadline         | 200     | 404, 504 |
| *      | anything else              | JSON error                                        |         | 404, 405 |

\`GET /api/users/u_1\`:

\`\`\`json
{
  "status": 200, "code": "HTTP_200_OK", "message": "User",
  "data": {
    "user": {
      "id": "u_1", "name": "Ada Lovelace", "plan": "pro",
      "email": "ada@example.com",
      "apiKey": "****************0001",
      "taxId": "sha256:6267439688df7b08"
    },
    "requestId": "8f9b6c1e-...",
    "servedBy": 41872
  }
}
\`\`\`

\`passwordHash\` is gone (\`@tRedact({ strategy: 'remove' })\`), \`apiKey\` is masked
(\`strategy: 'mask', visibleChars: 4\`), \`taxId\` is hashed. \`email\` is \`@tSensitive('PII')\`:
kept in responses, masked in audit events and logs.

Errors share one shape and carry the request id:

\`\`\`json
{ "error": { "code": "GATEWAY_TIMEOUT", "message": "UserService.getActivity timed out after 300ms", "requestId": "..." } }
\`\`\`

### curl

\`\`\`bash
curl -i http://localhost:3009/api/users/u_1                     # x-request-id in the response headers
curl -H "x-request-id: trace-me-1" http://localhost:3009/api/users/u_2
curl "http://localhost:3009/api/users?limit=2"
curl http://localhost:3009/api/users/u_404                      # 404 (and an audit event with success: false)
for i in 1 2 3 4 5 6; do curl -s http://localhost:3009/ ; echo; done   # servedBy changes with AXIL_WORKERS > 1
\`\`\`

### PowerShell

\`curl\` is an alias for \`Invoke-WebRequest\` in Windows PowerShell, so use \`curl.exe\` or \`Invoke-RestMethod\`:

\`\`\`powershell
Invoke-RestMethod http://localhost:3009/api/users/u_1 -Headers @{ 'x-request-id' = 'trace-me-1' }
curl.exe -i http://localhost:3009/api/users/u_404
1..6 | ForEach-Object { (Invoke-RestMethod http://localhost:3009/).data.servedBy }
\`\`\`

## Runtime decorators

\`src/users/user-service.ts\`:

\`\`\`typescript
class UserService {
  @tAudit({ action: 'user.read', sensitivity: 'medium', includeRequest: true })
  @tRetry({ attempts: 3, delay: 20, backoff: 'exponential', maxDelay: 200, retryOn: TRANSIENT })
  @tTimeout(250)
  async getUser(id: string) {
    const user = await this.store.find(id)
    ...
    return { user, requestId: getContext()?.requestId, servedBy: process.pid }
  }
}

wire(UserService)
\`\`\`

| Decorator  | Order (outer → inner) | What \`wire()\` makes it do                                                       |
|------------|----------------------|-----------------------------------------------------------------------------------|
| \`tAudit\`   | 100                  | One \`audit.log\` event per call, after all retries: actor, request id, ip, args (redacted), success |
| \`tRetry\`   | 200                  | Retries errors whose \`name\` or \`code\` is in \`retryOn\` (here ECONNRESET, ECONNREFUSED, EPIPE) |
| \`tTimeout\` | 300                  | Per-attempt deadline: \`TimeoutError\`, mapped to 504                               |

Timeouts are deliberately *not* retried: a dependency that is slow because it is overloaded
gets slower when every caller asks three times. Tune the numbers in \`POLICY\` at the top of
\`user-service.ts\`.

\`src/audit-log.ts\` writes every \`audit.log\` event as one JSON line to stdout (\`AUDIT_LOG=true\`);
ship stdout to your audit store.

## Hot paths

The request path is kept lean on purpose; keep it that way when you add routes:

- **No access log in production.** \`logging\` is only on for \`NODE_ENV=development\`. A pretty
  log line per request costs real throughput at tens of thousands of req/s; use metrics or a
  sampling logger instead.
- **Build once, not per request.** Services, stores and middleware are created in \`createApp()\`;
  handlers only call them.
- **Redact only where entities leave.** \`redactResponses()\` is route middleware on \`/api/users*\`,
  not global, so probes and \`/\` skip it.
- **No body parsing work on GETs**, no per-request regex compilation, no JSON round-trips.
- Audit events are one emit per audited call. Leave \`includeResponse\` off on hot reads.

Measure instead of guessing: \`axil capacity --url\` (below) against the real route.

## Capacity: \`axil.scaling.json\` and \`axil capacity\`

\`axil.scaling.json\` (project root):

\`\`\`json
{
  "target":     { "rps": 50000, "concurrentConnections": 100000, "p99Ms": 50 },
  "vertical":   { "workers": "auto", "maxConnectionsPerWorker": 10000, "memoryPerWorkerMb": 512,
                  "shutdownTimeoutMs": 10000, "keepAliveTimeoutMs": 65000 },
  "horizontal": { "instances": { "min": 3, "max": 10 }, "instanceSize": { "cpus": 4, "memoryGb": 8 } },
  "headroom": 0.3
}
\`\`\`

50k req/s with 30% headroom on 4-CPU instances, 3 to 10 of them. \`keepAliveTimeoutMs\` sits
above a typical load balancer idle timeout (AWS ALB: 60 s) to avoid sporadic 502s.

\`\`\`bash
axil capacity                       # calibrate one hello-world worker here, then plan
npm run build && AXIL_WORKERS=4 npm start        # in another terminal
axil capacity --url http://localhost:3009/api/users/u_1 --server-workers 4   # plan from the real route
axil capacity --json                # CI: exit code 1 when the target cannot be met
\`\`\`

The report covers this machine, the measured req/s per worker and p99, how many instances
the target needs against \`instances.max\`, connection and memory budgets, host checks
(\`ulimit -n\`, oversubscription, container CPU quota) and a **multi-process readiness scan** of \`src/\`.

## Deploy: \`axil deploy\`

\`\`\`bash
axil deploy --port 3009
\`\`\`

reads \`axil.scaling.json\`: replicas = \`instances.min\`, a HorizontalPodAutoscaler up to
\`instances.max\`, pod CPU/memory from \`instanceSize\`, \`AXIL_WORKERS\` pinned to the pod's CPUs
(\`auto\` would see the node's cores, not the pod's quota) and a termination grace period that
covers \`shutdownTimeoutMs\`. Probes hit \`/health/live\` and \`/health/ready\`.

The generated \`deploy/Dockerfile\` copies only \`dist/\` into the image. Add
\`COPY axil.scaling.json ./\` next to it so \`serve()\` in the container also applies
\`maxConnectionsPerWorker\`, \`keepAliveTimeoutMs\` and \`shutdownTimeoutMs\`, and set \`HOST=0.0.0.0\`
in the manifest's \`env:\` list.

## Multi-process caveats

With N workers per instance and M instances there are N × M copies of everything in memory.
\`axil capacity\` scans \`src/\` for the usual suspects and lists them under *Multi-process readiness*:

| In this project / common                  | Why it splits                                          | What to do                                    |
|-------------------------------------------|--------------------------------------------------------|-----------------------------------------------|
| \`InMemoryUserStore\` (this demo)           | each worker has its own copy; writes would diverge     | a real database (PostgreSQL / MySQL)          |
| \`getGlobalEventBus()\` in \`audit-log.ts\`   | subscribers only see events from their own worker      | fine for per-worker logging (flagged anyway); use a broker for cross-process events |
| \`rateLimit()\` without a \`store\`           | the real limit becomes limit × workers × instances     | a shared (Redis/DB) store                     |
| \`new Scheduler()\` (cron)                  | every job fires once per worker per instance           | one scheduler process (\`AXIL_ROLE=scheduler\`) or a distributed lock |
| in-memory \`Queue\`, caches, WebSocket rooms | jobs, invalidations and broadcasts stay in one process | a shared broker / cache, sticky sessions     |
| SQLite                                    | a local file; instances cannot share it                | PostgreSQL / MySQL                            |

The request context, retries, timeouts and redaction are per request and need nothing shared.

## Configuration

| Variable       | Default       | Description                                                       |
|----------------|---------------|-------------------------------------------------------------------|
| \`PORT\`         | \`3009\`        | HTTP port (shared by all workers)                                 |
| \`HOST\`         | \`127.0.0.1\`   | Bind address (\`0.0.0.0\` in containers)                            |
| \`NODE_ENV\`     | \`development\` | \`development\` (access log on), \`production\` or \`test\`             |
| \`AXIL_WORKERS\` | from \`axil.scaling.json\` | \`auto\` (one per core) or a number; read by \`serve()\`  |
| \`AUDIT_LOG\`    | \`true\`        | Write \`audit.log\` events to stdout as JSON lines                  |

## Project structure

\`\`\`
axil.scaling.json             target, workers, instances: read by serve(), axil capacity, axil deploy
src/
  main.ts                     serve(() => createApp(config)): cluster, restarts, drain
  app.ts                      createApp(config, deps): request context, routes, redaction
  config.ts                   typed config (defineConfig)
  audit-log.ts                audit.log events -> JSON lines on stdout
  users/user.entity.ts        User with @tRedact / @tSensitive fields
  users/user-store.ts         UserStore interface + in-memory demo store
  users/user-service.ts       @tAudit / @tRetry / @tTimeout methods, wire(UserService)
  middleware/error-handler.ts TimeoutError -> 504, transient errors -> 503, one JSON shape
  app.test.ts                 request context, redaction, retry, timeout, audit
  scaling.test.ts             axil.scaling.json is valid and can carry its target
\`\`\`

## Next steps

- Replace \`InMemoryUserStore\` with a database-backed \`UserStore\` (see \`axil create my-api --template rest-api\`)
- Load-test the real route with \`axil capacity --url\` and put your numbers in \`axil.scaling.json\`
- Add your own interceptor with \`registerInterceptor()\` (e.g. for \`tIdempotent\`) before \`wire()\`
- Resilience against a remote dependency (circuit breaker, fallbacks)? See \`axil create svc --template microservice\`
`,

    '.env.example': `# Server
PORT=3009
HOST=127.0.0.1
NODE_ENV=development

# Worker processes: 1 for development, "auto" (one per core) or a number in production.
# Overrides vertical.workers in axil.scaling.json.
AXIL_WORKERS=1

# Write audit.log events to stdout as JSON lines
AUDIT_LOG=true
`,

    'axil.scaling.json': JSON.stringify({
      target:     { rps: 50000, concurrentConnections: 100000, p99Ms: 50 },
      vertical:   { workers: 'auto', maxConnectionsPerWorker: 10000, memoryPerWorkerMb: 512, shutdownTimeoutMs: 10000, keepAliveTimeoutMs: 65000 },
      horizontal: { instances: { min: 3, max: 10 }, instanceSize: { cpus: 4, memoryGb: 8 } },
      headroom:   0.3
    }, null, 2) + '\n',

    'src/config.ts': `/**
 * Typed configuration, read from environment variables.
 * loadEnv() in src/main.ts fills process.env from .env first.
 * Worker count is not here: serve() reads AXIL_WORKERS / axil.scaling.json.
 */

import { defineConfig } from '@axiljs/config'

export function loadConfig(source: Record<string, string | undefined> = process.env) {
  return defineConfig({
    PORT:      { type: 'number',  default: 3009, min: 0, max: 65535 },
    HOST:      { type: 'string',  default: '127.0.0.1' },
    NODE_ENV:  { type: 'string',  default: 'development', enum: ['development', 'production', 'test'] },
    AUDIT_LOG: { type: 'boolean', default: true }
  }, source)
}

export type Config = ReturnType<typeof loadConfig>
`,

    'src/main.ts': `/**
 * ${ctx.name}
 * Entry point: serve() from @axiljs/scale.
 *
 * - Primary process: forks one worker per core (AXIL_WORKERS / axil.scaling.json),
 *   restarts crashed workers with backoff, drains them all on SIGTERM/SIGINT.
 *   It never calls the factory below.
 * - Each worker (or the only process when workers = 1): runs the factory and
 *   listens; all workers share the port.
 */

import { loadEnv } from '@axiljs/config'
import { serve } from '@axiljs/scale'
import { createApp } from './app.js'
import { logAuditEvents } from './audit-log.js'
import { loadConfig } from './config.js'

loadEnv()

const config = loadConfig()

await serve(() => {
  if (config.AUDIT_LOG) logAuditEvents()
  return createApp(config)
}, { port: config.PORT, host: config.HOST })
`,

    'src/app.ts': `/**
 * Application factory.
 * Builds the app without listening, so tests can drive it directly
 * (and serve() can call it once per worker).
 */

import { Application, NotFoundError } from '@axiljs/core'
import { redactResponses, requestContext } from '@axiljs/runtime'
import type { Config } from './config.js'
import { errorHandler } from './middleware/error-handler.js'
import { InMemoryUserStore } from './users/user-store.js'
import type { UserStore } from './users/user-store.js'
import { UserService } from './users/user-service.js'

export const SERVICE = '${ctx.name}'
export const VERSION = '1.0.0'

export interface AppDeps {
  /** Swap the data source (tests pass flaky or slow stores). */
  store?: UserStore
}

const USER_ID = /^u_[0-9]{1,12}$/

export function createApp(config: Config, deps: AppDeps = {}): Application {
  // Built once per worker; handlers below only call into them
  const users       = new UserService(deps.store ?? new InMemoryUserStore())
  const redactUsers = redactResponses()

  const app = new Application({
    server:  { port: config.PORT, host: config.HOST, methodNotAllowed: true },
    env:     config.NODE_ENV,
    // A log line per request is a real cost at high req/s: development only
    logging: config.NODE_ENV === 'development'
  })

  // One AsyncLocalStorage context per request: request id (x-request-id in
  // and out), user and tenant, readable anywhere via getContext()
  app.use(requestContext())

  app.get('/', (_req, res) => {
    res.success({ service: SERVICE, version: VERSION, servedBy: process.pid }, 'Service info')
  })

  app.get('/health/live',  (_req, res) => res.json({ status: 'alive', pid: process.pid }))
  app.get('/health/ready', (_req, res) => res.json({ status: 'ready', pid: process.pid }))

  // redactResponses() only where entities leave the API
  app.get('/api/users', redactUsers, async (req, res) => {
    const limit = clamp(Number(req.query.limit ?? 20), 1, 100)
    res.success(await users.listUsers(limit), 'Users')
  })

  app.get('/api/users/:id', redactUsers, async (req, res) => {
    res.success(await users.getUser(userId(req.params.id)), 'User')
  })

  app.get('/api/users/:id/activity', redactUsers, async (req, res) => {
    res.success(await users.getActivity(userId(req.params.id)), 'Activity')
  })

  app.use(errorHandler(config.NODE_ENV))

  return app
}

function userId(raw: string): string {
  if (!USER_ID.test(raw)) throw new NotFoundError('User ' + raw + ' not found')
  return raw
}

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, Math.trunc(value))) : max
}
`,

    'src/users/user.entity.ts': `/**
 * User entity. The decorators only record metadata; @axiljs/runtime acts on it:
 *
 *   @tRedact  always redacted in responses, logs and audit events
 *   @tSensitive  masked in logs and audit events, kept in responses
 *
 * Handlers return User instances (not plain copies) so redactResponses()
 * can find the metadata on the prototype.
 */

import { tRedact, tSensitive } from '@axiljs/decorator'

export interface UserFields {
  id:           string
  name:         string
  plan:         'free' | 'pro'
  email:        string
  passwordHash: string
  apiKey:       string
  taxId:        string
}

export class User {
  id:   string
  name: string
  plan: 'free' | 'pro'

  @tSensitive('PII')
  email: string

  @tRedact({ strategy: 'remove' })
  passwordHash: string

  @tRedact({ strategy: 'mask', visibleChars: 4 })
  apiKey: string

  @tRedact({ strategy: 'hash' })
  taxId: string

  constructor(fields: UserFields) {
    this.id           = fields.id
    this.name         = fields.name
    this.plan         = fields.plan
    this.email        = fields.email
    this.passwordHash = fields.passwordHash
    this.apiKey       = fields.apiKey
    this.taxId        = fields.taxId
  }
}
`,

    'src/users/user-store.ts': `/**
 * Data access behind an interface, so the service never knows where users live.
 *
 * InMemoryUserStore is a demo: every worker process gets its own copy.
 * Replace it with a database-backed store before running more than one
 * worker with writes (see "Multi-process caveats" in the README).
 */

import { User } from './user.entity.js'

export interface ActivityEntry {
  at:     string
  action: string
}

export interface UserStore {
  find(id: string): Promise<User | undefined>
  list(limit: number): Promise<User[]>
  activity(id: string): Promise<ActivityEntry[] | undefined>
}

// Demo data only: not real credentials
const SEED: User[] = [
  new User({ id: 'u_1', name: 'Ada Lovelace',    plan: 'pro',  email: 'ada@example.com',
    passwordHash: 'scrypt$demo$not-a-real-hash-1', apiKey: 'demo_key_00000000000001', taxId: 'DEMO-TAX-0001' }),
  new User({ id: 'u_2', name: 'Grace Hopper',    plan: 'pro',  email: 'grace@example.com',
    passwordHash: 'scrypt$demo$not-a-real-hash-2', apiKey: 'demo_key_00000000000002', taxId: 'DEMO-TAX-0002' }),
  new User({ id: 'u_3', name: 'Katherine Johnson', plan: 'free', email: 'katherine@example.com',
    passwordHash: 'scrypt$demo$not-a-real-hash-3', apiKey: 'demo_key_00000000000003', taxId: 'DEMO-TAX-0003' })
]

export class InMemoryUserStore implements UserStore {
  private readonly users = new Map(SEED.map(u => [u.id, u]))

  async find(id: string): Promise<User | undefined> {
    return this.users.get(id)
  }

  async list(limit: number): Promise<User[]> {
    return [...this.users.values()].slice(0, limit)
  }

  async activity(id: string): Promise<ActivityEntry[] | undefined> {
    if (!this.users.has(id)) return undefined
    return [
      { at: '2026-01-05T09:12:00.000Z', action: 'login' },
      { at: '2026-01-05T09:14:31.000Z', action: 'api_key.used' }
    ]
  }
}
`,

    'src/users/user-service.ts': `/**
 * User service. Reliability and auditing are declared with decorators and
 * executed by @axiljs/runtime once the class is wired (bottom of the file).
 *
 *   tAudit   (order 100, outermost)  one audit.log event per call, after retries
 *   tRetry   (order 200)             retries errors listed in retryOn
 *   tTimeout (order 300, innermost)  per-attempt deadline -> TimeoutError
 */

import { NotFoundError } from '@axiljs/core'
import { tAudit, tRetry, tTimeout } from '@axiljs/decorator'
import { getContext, wire } from '@axiljs/runtime'
import type { User } from './user.entity.js'
import type { ActivityEntry, UserStore } from './user-store.js'

/** Tune reliability here. Tight deadlines keep p99 bounded under load. */
export const POLICY = {
  lookupTimeoutMs:   250,
  activityTimeoutMs: 300,
  retryAttempts:     3,
  retryDelayMs:      20,
  retryMaxDelayMs:   200
} as const

/**
 * Connection-level errors worth another try. Timeouts (TimeoutError /
 * ETIMEDOUT) are deliberately absent: retrying a dependency that is slow
 * because it is overloaded only adds load.
 */
export const TRANSIENT = ['ECONNRESET', 'ECONNREFUSED', 'EPIPE']

export interface UserResponse {
  user:      User
  /** Read from the request context, not passed in. */
  requestId: string | undefined
  /** Worker pid: shows the cluster spreading requests. */
  servedBy:  number
}

export class UserService {
  constructor(private readonly store: UserStore) {}

  @tAudit({ action: 'user.read', sensitivity: 'medium', includeRequest: true })
  @tRetry({ attempts: POLICY.retryAttempts, delay: POLICY.retryDelayMs, backoff: 'exponential', maxDelay: POLICY.retryMaxDelayMs, retryOn: TRANSIENT })
  @tTimeout(POLICY.lookupTimeoutMs)
  async getUser(id: string): Promise<UserResponse> {
    const user = await this.store.find(id)
    if (!user) throw new NotFoundError('User ' + id + ' not found')
    // No req threaded through: the request context follows the async call chain
    return { user, requestId: getContext()?.requestId, servedBy: process.pid }
  }

  @tRetry({ attempts: POLICY.retryAttempts, delay: POLICY.retryDelayMs, backoff: 'exponential', maxDelay: POLICY.retryMaxDelayMs, retryOn: TRANSIENT })
  @tTimeout(POLICY.lookupTimeoutMs)
  async listUsers(limit: number): Promise<User[]> {
    return this.store.list(limit)
  }

  @tAudit({ action: 'user.activity.read', sensitivity: 'high', includeRequest: true })
  @tTimeout(POLICY.activityTimeoutMs)
  async getActivity(id: string): Promise<ActivityEntry[]> {
    const entries = await this.store.activity(id)
    if (!entries) throw new NotFoundError('User ' + id + ' not found')
    return entries
  }
}

// Turn the metadata above into behaviour (idempotent; wireAll() does every class)
wire(UserService)
`,

    'src/audit-log.ts': `/**
 * Audit sink: every 'audit.log' event (emitted by the tAudit interceptor)
 * becomes one JSON line on stdout. Ship stdout to your audit store.
 *
 * The global event bus is per process, so each worker logs its own events.
 * That is what you want here; \`axil capacity\` still lists it under
 * multi-process readiness, because cross-process subscribers would miss events.
 */

import { getGlobalEventBus } from '@axiljs/events'
import type { Subscription } from '@axiljs/events'

export function logAuditEvents(
  write: (line: string) => void = line => { process.stdout.write(line + '\\n') }
): Subscription {
  return getGlobalEventBus().on('audit.log', event => {
    write(JSON.stringify({ type: 'audit', ...(event.payload as Record<string, unknown>) }))
  })
}
`,

    'src/middleware/error-handler.ts': `/**
 * Error handler: turns thrown errors into one JSON shape.
 *
 *   { "error": { "code": "GATEWAY_TIMEOUT", "message": "...", "requestId": "..." } }
 *
 * - axilError subclasses keep their status and code
 * - TimeoutError from a tTimeout deadline -> 504 GATEWAY_TIMEOUT
 * - transient connection errors left after tRetry -> 503 DEPENDENCY_UNAVAILABLE
 * - anything else -> 500, message hidden in production
 */

import { axilError } from '@axiljs/core'
import type { ErrorMiddlewareFn } from '@axiljs/core'
import { TimeoutError } from '@axiljs/runtime'
import { TRANSIENT } from '../users/user-service.js'

export function errorHandler(env: string): ErrorMiddlewareFn {
  // Four parameters: that is how Application.use() recognises an error handler
  return (err, req, res, _next) => {
    const known     = err instanceof axilError
    const timeout   = err instanceof TimeoutError
    const transient = TRANSIENT.includes(String((err as { code?: unknown }).code))

    const status = known ? err.statusCode : timeout ? 504 : transient ? 503 : 500
    const code   = known ? err.code : timeout ? 'GATEWAY_TIMEOUT' : transient ? 'DEPENDENCY_UNAVAILABLE' : 'INTERNAL_ERROR'

    if (status === 500) console.error('[' + req.method + ' ' + req.path + ']', err)

    res.status(status).json({
      error: {
        code,
        message:   status === 500 && env === 'production' ? 'Internal server error' : err.message,
        requestId: req.locals.requestId,
        ...(known && err.details !== undefined ? { details: err.details } : {})
      }
    })
  }
}
`,

    'src/app.test.ts': `import { describe, it, expect, createTestClient } from '@axiljs/testing'
import { getGlobalEventBus } from '@axiljs/events'
import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { InMemoryUserStore } from './users/user-store.js'
import type { ActivityEntry } from './users/user-store.js'
import type { User } from './users/user.entity.js'

// Single process: createApp() directly, the cluster is never forked in tests
const config = loadConfig({ NODE_ENV: 'test', AUDIT_LOG: 'false' })
const client = createTestClient(createApp(config))

/** Fails find() with ECONNRESET a given number of times, then behaves. */
class FlakyStore extends InMemoryUserStore {
  calls = 0
  constructor(private failures: number) { super() }

  override async find(id: string): Promise<User | undefined> {
    this.calls++
    if (this.failures-- > 0) throw Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' })
    return super.find(id)
  }
}

/** activity() takes a second: longer than the 300 ms tTimeout deadline. */
class SlowStore extends InMemoryUserStore {
  override activity(_id: string): Promise<ActivityEntry[] | undefined> {
    return new Promise(resolve => setTimeout(() => resolve([]), 1000).unref())
  }
}

/** Collect events of one type from the global bus while fn runs. */
async function collect<T>(type: string, fn: () => Promise<unknown>): Promise<T[]> {
  const seen: T[] = []
  const sub = getGlobalEventBus().on<T>(type, event => { seen.push(event.payload) })
  try {
    await fn()
  } finally {
    sub.unsubscribe()
  }
  return seen
}

interface AuditPayload {
  action:    string
  requestId: string
  success:   boolean
  error?:    string
  actor:     { id: string; type: string }
  metadata:  { target: string; args?: unknown[]; sensitivity?: string }
}

describe('request context', () => {
  it('echoes x-request-id and the service reads it via getContext()', async () => {
    const res = await client.get('/api/users/u_1').set('x-request-id', 'hs-req-42')
    expect(res.status).toBe(200)
    expect(res.headers['x-request-id']).toBe('hs-req-42')
    expect(res.body.data.requestId).toBe('hs-req-42')
    expect(res.body.data.servedBy).toBe(process.pid)
  })

  it('generates a request id when the client sends none', async () => {
    const res = await client.get('/api/users/u_1')
    const id = res.headers['x-request-id']
    expect(typeof id).toBe('string')
    expect(res.body.data.requestId).toBe(id)
  })
})

describe('redaction', () => {
  it('removes, masks and hashes @tRedact fields and keeps @tSensitive ones', async () => {
    const res = await client.get('/api/users/u_1')
    const user = res.body.data.user
    expect(user.name).toBe('Ada Lovelace')
    expect(user.email).toBe('ada@example.com')           // tSensitive: kept in responses
    expect(user.passwordHash).toBeUndefined()            // remove
    expect(user.apiKey).toBe('*'.repeat(19) + '0001')     // mask, last 4 visible
    expect(user.taxId).toMatch(/^sha256:[0-9a-f]{16}$/)   // hash
    expect(res.text).not.toContain('not-a-real-hash')
    expect(res.text).not.toContain('demo_key_')
  })

  it('redacts every user in a list', async () => {
    const res = await client.get('/api/users?limit=2')
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(2)
    for (const user of res.body.data) {
      expect(user.passwordHash).toBeUndefined()
      expect(user.apiKey.startsWith('****')).toBe(true)
    }
  })
})

describe('tRetry', () => {
  it('recovers from a flaky dependency', async () => {
    const store = new FlakyStore(2)
    const flaky = createTestClient(createApp(config, { store }))

    const retries = await collect<{ target: string; attempt: number }>('runtime.retry', async () => {
      const res = await flaky.get('/api/users/u_2')
      expect(res.status).toBe(200)
      expect(res.body.data.user.name).toBe('Grace Hopper')
    })
    expect(store.calls).toBe(3)
    expect(retries.map(r => r.attempt)).toEqual([1, 2])
    expect(retries[0].target).toBe('UserService.getUser')
  })

  it('gives up after 3 attempts with 503', async () => {
    const store = new FlakyStore(10)
    const res = await createTestClient(createApp(config, { store })).get('/api/users/u_2')
    expect(res.status).toBe(503)
    expect(res.body.error.code).toBe('DEPENDENCY_UNAVAILABLE')
    expect(store.calls).toBe(3)
  })

  it('does not retry a NotFoundError', async () => {
    const store = new FlakyStore(0)
    const res = await createTestClient(createApp(config, { store })).get('/api/users/u_999')
    expect(res.status).toBe(404)
    expect(store.calls).toBe(1)
  })
})

describe('tTimeout', () => {
  it('maps a missed deadline to 504', async () => {
    const slow = createTestClient(createApp(config, { store: new SlowStore() }))
    const started = Date.now()
    const res = await slow.get('/api/users/u_1/activity').set('x-request-id', 'slow-1')
    expect(res.status).toBe(504)
    expect(res.body.error.code).toBe('GATEWAY_TIMEOUT')
    expect(res.body.error.requestId).toBe('slow-1')
    expect(Date.now() - started).toBeLessThan(900)
  })
})

describe('tAudit', () => {
  it('emits audit.log on the global event bus with the request id', async () => {
    const events = await collect<AuditPayload>('audit.log', async () => {
      const res = await client.get('/api/users/u_2').set('x-request-id', 'audit-req-1')
      expect(res.status).toBe(200)
    })
    const event = events.find(e => e.requestId === 'audit-req-1')
    expect(event).toBeDefined()
    expect(event!.action).toBe('user.read')
    expect(event!.success).toBe(true)
    expect(event!.actor).toEqual({ id: 'system', type: 'system' })
    expect(event!.metadata.target).toBe('UserService.getUser')
    expect(event!.metadata.args).toEqual(['u_2'])
  })

  it('records failed calls too', async () => {
    const events = await collect<AuditPayload>('audit.log', async () => {
      const res = await client.get('/api/users/u_404').set('x-request-id', 'audit-req-2')
      expect(res.status).toBe(404)
    })
    const event = events.find(e => e.requestId === 'audit-req-2')
    expect(event).toBeDefined()
    expect(event!.success).toBe(false)
    expect(event!.error).toBe('User u_404 not found')
  })
})

describe('routes', () => {
  it('serves probes and service info', async () => {
    expect((await client.get('/health/live')).body.status).toBe('alive')
    expect((await client.get('/health/ready')).body.status).toBe('ready')
    const info = await client.get('/')
    expect(info.body.data.servedBy).toBe(process.pid)
  })

  it('returns activity, and JSON 404s for unknown users and routes', async () => {
    const activity = await client.get('/api/users/u_3/activity')
    expect(activity.status).toBe(200)
    expect(activity.body.data).toHaveLength(2)

    expect((await client.get('/api/users/not-an-id')).status).toBe(404)
    const missing = await client.get('/nope')
    expect(missing.status).toBe(404)
    expect(missing.body.error.code).toBe('NOT_FOUND')
  })
})
`,

    'src/scaling.test.ts': `import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it, expect } from '@axiljs/testing'
import { detectSystem, planCapacity, resolveScaling } from '@axiljs/scale'
import type { ScalingConfig } from '@axiljs/scale'

// Compiled to dist/scaling.test.js: the project root is one level up
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const raw  = JSON.parse(readFileSync(join(ROOT, 'axil.scaling.json'), 'utf8')) as ScalingConfig

// The instance shape from the file, not this machine
const INSTANCE = { cores: 4, memoryBytes: 8 * 2 ** 30 }

describe('axil.scaling.json', () => {
  it('is accepted by resolveScaling()', () => {
    expect(() => resolveScaling(raw, INSTANCE)).not.toThrow()
  })

  it('has a target, autoscaling bounds and an instance size for axil deploy', () => {
    const scaling = resolveScaling(raw, INSTANCE)
    expect(scaling.target.rps).toBeGreaterThan(0)
    expect(scaling.target.p99Ms).toBeGreaterThan(0)
    expect(scaling.horizontal.min).toBeLessThanOrEqual(scaling.horizontal.max)
    expect(scaling.horizontal.instanceSizeDefaulted).toBe(false)
    // Above a typical load balancer idle timeout (AWS ALB: 60 s)
    expect(scaling.vertical.keepAliveTimeoutMs ?? 0).toBeGreaterThan(60000)
  })

  it('can carry its target at an assumed 8k req/s per worker', () => {
    const scaling = resolveScaling(raw, INSTANCE)
    const report = planCapacity({
      scaling,
      system: detectSystem(),
      measurement: { rpsPerWorker: 8000, source: 'assumed' }
    })
    expect(report.required).not.toBeNull()
    expect(report.required!.instances).toBeLessThanOrEqual(scaling.horizontal.max)
  })
})
`
  }),

  nextSteps: () => [
    ['npm test', 'Context, redaction, retry, timeout, audit'],
    ['axil capacity', 'Plan instances for axil.scaling.json']
  ]
}
