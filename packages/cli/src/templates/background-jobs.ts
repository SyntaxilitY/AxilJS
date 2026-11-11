/**
 * Template: background-jobs
 *
 * An HTTP API that hands slow work to an in-process worker pool: endpoints
 * enqueue jobs and answer 202, workers run them with concurrency, retries
 * with backoff and a failed (dead-letter) state, a cron Scheduler enqueues
 * periodic work, and queue lifecycle changes become domain events on an
 * EventBus with an @OnEvent subscriber.
 */

import type { ProjectTemplate, TemplateContext } from './types'

export const backgroundJobsTemplate: ProjectTemplate = {
  id:       'background-jobs',
  title:    'Background Jobs',
  summary:  'API + workers: queued jobs, retries, cron, events',
  category: 'Background',
  highlights: [
    'POST enqueues a job and answers 202 with its id',
    'Workers with concurrency, retries, backoff',
    'Failed jobs kept as dead letters, retry by id',
    'Opt-in cron Scheduler for periodic cleanup',
    'Job lifecycle events via EventBus + @OnEvent'
  ],
  packages: ['@axiljs/core', '@axiljs/config', '@axiljs/validation', '@axiljs/queue', '@axiljs/events', '@axiljs/testing'],
  port:     3003,

  dependencies: ctx => ({
    '@axiljs/config':     ctx.axilRange,
    '@axiljs/core':       ctx.axilRange,
    '@axiljs/events':     ctx.axilRange,
    '@axiljs/queue':      ctx.axilRange,
    '@axiljs/validation': ctx.axilRange
  }),

  files: (ctx: TemplateContext) => ({
    'README.md': `# ${ctx.name}

An [AxilJS](https://github.com/SyntaxilitY/AxilJS) API with background workers, created with
\`axil create ${ctx.name} --template background-jobs\`.

HTTP requests should not wait for slow work (sending email, building reports).
Here an endpoint validates the request, **enqueues a job and answers \`202 Accepted\`**
with the job id; workers in the same process pick the job up, and the client polls
\`GET /jobs/:id\` for status, progress and the result.

- **@axiljs/queue**: \`Queue\` with concurrency, per-attempt timeouts, retries with fixed or
  exponential backoff, cancellation; failed jobs stay in the store as dead letters
- **@axiljs/queue**: \`Scheduler\` with 5-field cron expressions for periodic work (opt-in, see below)
- **@axiljs/events**: queue lifecycle turned into domain events (\`job.completed\`, \`job.retrying\`,
  \`job.failed\`, \`job.cancelled\`) on an \`EventBus\`, consumed by an \`@OnEvent\` subscriber
- **@axiljs/core** + **@axiljs/validation**: the HTTP API, validated bodies, one JSON error shape
- **@axiljs/config**: typed \`.env\` config; every delay is configurable so tests run in milliseconds

## Run

\`\`\`bash
npm install
cp .env.example .env        # PowerShell: Copy-Item .env.example .env
npm run dev                 # watch mode, http://localhost:3003
\`\`\`

Production build:

\`\`\`bash
npm run build
npm start
\`\`\`

## Test

\`\`\`bash
npm test                    # axil test: compiles with tsc, runs src/**/*.test.ts
\`\`\`

The tests use a 5 ms poll interval, fixed 5 ms backoff and 1 ms report steps, so the
whole suite (retries included) takes well under a second. No port is opened.

## Endpoints

| Method | Path                  | Description                                          | Success | Errors   |
|--------|-----------------------|------------------------------------------------------|---------|----------|
| GET    | \`/\`                   | Service name, version and endpoints                  | 200     |          |
| GET    | \`/health\`             | Liveness plus queue counts                           | 200     |          |
| POST   | \`/jobs/welcome-email\` | Enqueue a welcome email \`{ email, name }\`            | 202     | 422      |
| POST   | \`/jobs/reports\`       | Enqueue a report \`{ kind, rows }\` (reports progress) | 202     | 422      |
| GET    | \`/jobs\`               | Recent jobs, newest first; \`?status=failed\` etc.     | 200     | 422      |
| GET    | \`/jobs/:id\`           | Status, progress, attempts, result or error          | 200     | 404      |
| POST   | \`/jobs/:id/retry\`     | Re-enqueue a failed or cancelled job as a new job    | 202     | 404, 409 |
| DELETE | \`/jobs/:id\`           | Cancel a pending, delayed or running job             | 200     | 404, 409 |
| GET    | \`/events\`             | Recent job events seen by the \`@OnEvent\` subscriber  | 200     |          |
| GET    | \`/schedule\`           | Cron tasks of this process (if \`RUN_SCHEDULER\`)      | 200     |          |

\`POST /jobs/reports\` body: \`kind\` is \`sales\`, \`signups\` or \`inventory\`; \`rows\` is an
integer from 1 to 1,000,000 (default 1000).

\`202\` responses carry a \`Location\` header and the job id:

\`\`\`json
{ "status": 202, "code": "HTTP_202_ACCEPTED", "message": "Job queued", "data": { "jobId": "6f1c…", "name": "send-welcome-email", "status": "pending", "statusUrl": "/jobs/6f1c…" } }
\`\`\`

### Job lifecycle

\`\`\`
pending ──▶ active ──▶ completed
               │
               ├─ error, attempts left ──▶ delayed (backoff) ──▶ active …
               └─ error, no attempts left ──▶ failed   (dead letter: kept, POST /jobs/:id/retry)
pending / delayed / active ──DELETE──▶ cancelled
\`\`\`

\`GET /jobs/:id\` shows \`attempts\` / \`maxAttempts\`, \`progress\` (0-100, reports only),
\`nextAttemptAt\` while a retry is waiting, then \`result\` or \`error\`.

### curl

\`\`\`bash
curl -i -X POST http://localhost:3003/jobs/welcome-email -H "Content-Type: application/json" -d '{"email":"ada@example.com","name":"Ada"}'
curl http://localhost:3003/jobs/<jobId>

curl -X POST http://localhost:3003/jobs/reports -H "Content-Type: application/json" -d '{"kind":"sales","rows":50000}'
curl http://localhost:3003/jobs/<jobId>                 # watch "progress" climb to 100

# The dev mailer rejects @bounce.test addresses: watch the retries, then the failed state
curl -X POST http://localhost:3003/jobs/welcome-email -H "Content-Type: application/json" -d '{"email":"nobody@bounce.test","name":"Bob"}'
curl "http://localhost:3003/jobs?status=failed"
curl -X POST http://localhost:3003/jobs/<jobId>/retry   # dead letter -> new job
curl http://localhost:3003/events
\`\`\`

### PowerShell

\`\`\`powershell
$job = Invoke-RestMethod http://localhost:3003/jobs/welcome-email -Method Post -ContentType 'application/json' \`
  -Body (@{ email = 'ada@example.com'; name = 'Ada' } | ConvertTo-Json)
Invoke-RestMethod "http://localhost:3003/jobs/$($job.data.jobId)"
curl.exe -s http://localhost:3003/health
\`\`\`

## Scheduler: run it in one process

\`RUN_SCHEDULER=true\` starts a \`Scheduler\` with two cron tasks:

| Task                    | Default cron     | What it does                                                  |
|-------------------------|------------------|---------------------------------------------------------------|
| \`cleanup-finished-jobs\` | \`*/10 * * * *\`   | Enqueues a job that drops finished jobs older than \`JOB_RETENTION_MS\` |
| \`daily-signups-report\`  | \`0 6 * * *\`      | Enqueues a signups report every day at 06:00 (server time)    |

The tasks only *enqueue* jobs, so the work itself gets retries, timeouts and events.

**Why opt-in?** Every process that starts a \`Scheduler\` fires every task. Scale out to four
processes (\`axil deploy\`, a cluster, several containers) with the scheduler on everywhere and
the 06:00 report is built and mailed **four times**; once jobs live in a shared store, four
cleanups also race over the same rows. Cron needs a single owner: set \`RUN_SCHEDULER=true\` on
exactly one instance (or a dedicated "clock" process) and leave it \`false\` on the rest, or put a
distributed lock in front of each task. \`.env.example\` turns it on because a dev machine runs one
process.

**The queue is in memory.** Jobs live in this process and are lost on restart; the API and the
workers must be the same process. For several processes or durability, implement \`QueueStore\`
(a synchronous interface: \`add/get/update/list/remove\`, e.g. on SQLite with a sync driver)
and pass it as \`new Queue('jobs', { store })\` in \`src/jobs/system.ts\`.

## Configuration

| Variable            | Default        | Description                                                  |
|---------------------|----------------|--------------------------------------------------------------|
| \`PORT\`              | \`3003\`         | HTTP port                                                    |
| \`HOST\`              | \`127.0.0.1\`    | Bind address (\`0.0.0.0\` in containers)                       |
| \`NODE_ENV\`          | \`development\`  | \`development\`, \`production\` or \`test\`                        |
| \`QUEUE_CONCURRENCY\` | \`4\`            | Jobs processed at the same time                              |
| \`QUEUE_POLL_MS\`     | \`250\`          | How often idle workers look for ready jobs                   |
| \`JOB_MAX_ATTEMPTS\`  | \`3\`            | Attempts before a job is marked \`failed\`                     |
| \`JOB_TIMEOUT_MS\`    | \`30000\`        | Per-attempt timeout (\`0\` = none); a timeout counts as a failure |
| \`RETRY_BACKOFF\`     | \`exponential\`  | \`exponential\` (delay × 2^(attempt-1), plus up to 1 s jitter) or \`fixed\` |
| \`RETRY_DELAY_MS\`    | \`1000\`         | Base retry delay                                             |
| \`REPORT_STEP_MS\`    | \`300\`          | Simulated work per 10 % of a report                          |
| \`RUN_SCHEDULER\`     | \`false\`        | Start the cron Scheduler in this process (one process only)  |
| \`CLEANUP_CRON\`      | \`*/10 * * * *\` | When to clean up finished jobs                               |
| \`DAILY_REPORT_CRON\` | \`0 6 * * *\`    | When to enqueue the daily signups report                     |
| \`JOB_RETENTION_MS\`  | \`3600000\`      | Finished jobs older than this are removed by the cleanup job |

## Project structure

\`\`\`
src/
  main.ts                     entry point: loadEnv, job system, app, listen, graceful shutdown
  app.ts                      createApp(config, jobs): HTTP routes and schemas
  config.ts                   typed config (defineConfig)
  jobs/system.ts              createJobSystem(config): store, Queue, EventBus, Scheduler, start/stop
  jobs/handlers.ts            job names, payload types and the worker functions
  jobs/schedule.ts            cron tasks (registered only when RUN_SCHEDULER=true)
  events/job-activity.ts      @OnEvent subscriber: keeps recent job events, alerts on failures
  services/mailer.ts          Mailer interface + a console mailer for development
  middleware/error-handler.ts thrown errors -> { error: { code, message, details } }
  test-utils.ts               test config and a poll-until-done helper
  app.test.ts                 enqueue/poll, retries, dead letters, cancel, events
  jobs/schedule.test.ts       scheduler wiring and the cleanup job (no real minutes waited)
\`\`\`

## Next steps

- Add a job: a handler in \`src/jobs/handlers.ts\`, \`queue.process(name, handler)\` in
  \`src/jobs/system.ts\`, and an endpoint that calls \`jobs.enqueue(name, data)\`
- Replace \`ConsoleMailer\` with a real provider behind the same \`Mailer\` interface
- React to events elsewhere: add an \`@OnEvent('job.completed')\` method to a class and
  \`registerEventHandlers(instance, jobs.bus)\`
`,

    '.env.example': `# Server
PORT=3003
HOST=127.0.0.1
NODE_ENV=development

# Workers
QUEUE_CONCURRENCY=4
QUEUE_POLL_MS=250
JOB_MAX_ATTEMPTS=3
JOB_TIMEOUT_MS=30000
# exponential or fixed
RETRY_BACKOFF=exponential
RETRY_DELAY_MS=1000
REPORT_STEP_MS=300

# Cron scheduler: enable it in exactly ONE process (see README)
RUN_SCHEDULER=true
CLEANUP_CRON=*/10 * * * *
DAILY_REPORT_CRON=0 6 * * *
JOB_RETENTION_MS=3600000
`,

    'src/config.ts': `/**
 * Typed configuration, read from environment variables.
 * loadEnv() in src/main.ts fills process.env from .env first.
 */

import { defineConfig } from '@axiljs/config'

export function loadConfig(source: Record<string, string | undefined> = process.env) {
  return defineConfig({
    PORT:              { type: 'number', default: 3003, min: 0, max: 65535 },
    HOST:              { type: 'string', default: '127.0.0.1' },
    NODE_ENV:          { type: 'string', default: 'development', enum: ['development', 'production', 'test'] },

    // Workers
    QUEUE_CONCURRENCY: { type: 'number', default: 4, min: 1, max: 100 },
    QUEUE_POLL_MS:     { type: 'number', default: 250, min: 1, max: 60000 },
    JOB_MAX_ATTEMPTS:  { type: 'number', default: 3, min: 1, max: 20 },
    // Per-attempt timeout, 0 = none
    JOB_TIMEOUT_MS:    { type: 'number', default: 30000, min: 0 },
    RETRY_BACKOFF:     { type: 'string', default: 'exponential', enum: ['exponential', 'fixed'] },
    RETRY_DELAY_MS:    { type: 'number', default: 1000, min: 0 },
    // Simulated work per 10 % of a report
    REPORT_STEP_MS:    { type: 'number', default: 300, min: 0 },

    // Cron scheduler: opt-in, run it in exactly one process
    RUN_SCHEDULER:     { type: 'boolean', default: false },
    CLEANUP_CRON:      { type: 'string', default: '*/10 * * * *' },
    DAILY_REPORT_CRON: { type: 'string', default: '0 6 * * *' },
    JOB_RETENTION_MS:  { type: 'number', default: 3600000, min: 0 }
  }, source)
}

export type Config = ReturnType<typeof loadConfig>
`,

    'src/main.ts': `/**
 * ${ctx.name}
 * Entry point: load .env, start the workers (and the scheduler, if enabled), listen.
 */

import { loadEnv } from '@axiljs/config'
import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { createJobSystem } from './jobs/system.js'

loadEnv()

const config = loadConfig()
const jobs   = createJobSystem(config)
const app    = createApp(config, jobs)

jobs.start()
await app.listen()

if (!config.RUN_SCHEDULER) {
  console.log('Scheduler off in this process (set RUN_SCHEDULER=true on exactly one instance)')
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    // Stop accepting requests, then let running jobs finish
    await app.close()
    await jobs.stop()
    process.exit(0)
  })
}
`,

    'src/app.ts': `/**
 * Application factory.
 * Builds the HTTP API on top of a job system, without listening, so tests can
 * drive it directly.
 */

import { Application, NotFoundError, axilError } from '@axiljs/core'
import type { axilResponse } from '@axiljs/core'
import type { Job, JobStatus } from '@axiljs/queue'
import { v, validate } from '@axiljs/validation'
import type { Config } from './config.js'
import { JOB } from './jobs/handlers.js'
import type { ReportData, WelcomeEmailData } from './jobs/handlers.js'
import type { JobSystem } from './jobs/system.js'
import { errorHandler } from './middleware/error-handler.js'

export const SERVICE = '${ctx.name}'
export const VERSION = '1.0.0'

const STATUSES: JobStatus[] = ['pending', 'active', 'completed', 'failed', 'delayed', 'cancelled']

// ─── Schemas ──────────────────────────────────────────────────────────────────

const WelcomeEmailBody = v.object({
  email: v.string().trim().email().max(254),
  name:  v.string().trim().min(1).max(80)
}).strip()

const ReportBody = v.object({
  kind: v.enum(['sales', 'signups', 'inventory']),
  rows: v.number().integer().min(1).max(1_000_000).default(1000)
}).strip()

const JobParams = v.object({ id: v.string().min(1).max(100) })

const ListQuery = v.object({
  status: v.enum(STATUSES).optional()
})

// ─── App ──────────────────────────────────────────────────────────────────────

export function createApp(config: Config, jobs: JobSystem): Application {
  const app = new Application({
    server:  { port: config.PORT, host: config.HOST, methodNotAllowed: true },
    env:     config.NODE_ENV,
    logging: config.NODE_ENV !== 'test'
  })

  app.get('/', (_req, res) => {
    res.success({
      service: SERVICE,
      version: VERSION,
      endpoints: [
        'GET    /',
        'GET    /health',
        'POST   /jobs/welcome-email',
        'POST   /jobs/reports',
        'GET    /jobs',
        'GET    /jobs/:id',
        'POST   /jobs/:id/retry',
        'DELETE /jobs/:id',
        'GET    /events',
        'GET    /schedule'
      ]
    }, 'Service info')
  })

  app.get('/health', (_req, res) => {
    res.json({
      status:    'ok',
      uptime:    Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      queue:     jobs.queue.getStats(),
      scheduler: jobs.scheduler !== undefined
    })
  })

  // ─── Enqueue ────────────────────────────────────────────────────────────────

  app.post('/jobs/welcome-email', validate({ body: WelcomeEmailBody }), async (req, res) => {
    const job = await jobs.enqueue<WelcomeEmailData>(JOB.WELCOME_EMAIL, req.body as WelcomeEmailData)
    accepted(res, job, 'Job queued')
  })

  app.post('/jobs/reports', validate({ body: ReportBody }), async (req, res) => {
    const job = await jobs.enqueue<ReportData>(JOB.REPORT, req.body as ReportData)
    accepted(res, job, 'Job queued')
  })

  // ─── Inspect ────────────────────────────────────────────────────────────────

  app.get('/jobs', validate({ query: ListQuery }), (req, res) => {
    const status = req.query.status as JobStatus | undefined
    const list = jobs.queue.getJobs(status)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 50)
      .map(job => view(job, jobs.progress(job.id)))
    res.success({ stats: jobs.queue.getStats(), jobs: list }, 'Jobs')
  })

  app.get('/jobs/:id', validate({ params: JobParams }), (req, res) => {
    const job = findJob(jobs, req.params.id)
    res.success(view(job, jobs.progress(job.id)), 'Job status')
  })

  // ─── Manage ─────────────────────────────────────────────────────────────────

  // Failed jobs are dead letters: they stay in the store until cleanup, and
  // can be re-run as a new job once the cause is fixed
  app.post('/jobs/:id/retry', validate({ params: JobParams }), async (req, res) => {
    const old = findJob(jobs, req.params.id)
    if (old.status !== 'failed' && old.status !== 'cancelled') {
      throw new axilError(\`Only failed or cancelled jobs can be retried (status: \${old.status})\`, 409, 'CONFLICT')
    }
    const job = await jobs.enqueue(old.name, old.data)
    accepted(res, job, \`Job re-queued (retry of \${old.id})\`)
  })

  app.delete('/jobs/:id', validate({ params: JobParams }), (req, res) => {
    const job = findJob(jobs, req.params.id)
    if (!jobs.queue.cancel(job.id)) {
      throw new axilError(\`Job already finished (status: \${job.status})\`, 409, 'CONFLICT')
    }
    res.success(view(job, jobs.progress(job.id)), 'Job cancelled')
  })

  // ─── Events and schedule ────────────────────────────────────────────────────

  app.get('/events', (_req, res) => {
    res.success(jobs.activity.list(), 'Recent job events')
  })

  app.get('/schedule', (_req, res) => {
    const tasks = jobs.scheduler?.getTasks().map(t => ({
      name:       t.name,
      expression: t.expression,
      enabled:    t.enabled,
      runCount:   t.runCount,
      lastRunAt:  t.lastRunAt?.toISOString() ?? null
    }))
    res.success({ enabled: tasks !== undefined, tasks: tasks ?? [] }, 'Schedule')
  })

  app.use(errorHandler(config.NODE_ENV))

  return app
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function findJob(jobs: JobSystem, id: string): Job {
  const job = jobs.queue.getJob(id)
  if (!job) throw new NotFoundError(\`Job \${id} not found\`)
  return job
}

/** 202 Accepted in the AxilJS envelope, with a Location to poll. */
function accepted(res: axilResponse, job: Job, message: string): void {
  const statusUrl = \`/jobs/\${job.id}\`
  res.status(202).header('Location', statusUrl).json({
    status:  202,
    code:    'HTTP_202_ACCEPTED',
    message,
    data:    { jobId: job.id, name: job.name, status: job.status, statusUrl }
  })
}

/** Public view of a job. */
function view(job: Job, progress: number | undefined) {
  return {
    id:            job.id,
    name:          job.name,
    status:        job.status,
    progress:      job.status === 'completed' ? 100 : progress ?? 0,
    attempts:      job.attempts,
    maxAttempts:   job.maxAttempts,
    data:          job.data,
    result:        job.result ?? null,
    error:         job.error ?? null,
    createdAt:     job.createdAt.toISOString(),
    startedAt:     job.startedAt?.toISOString() ?? null,
    finishedAt:    job.finishedAt?.toISOString() ?? null,
    nextAttemptAt: job.status === 'delayed' ? job.runAt.toISOString() : null
  }
}
`,

    'src/jobs/handlers.ts': `/**
 * Job names, payloads and the functions workers run.
 *
 * A handler receives the job (data, attempts, ...) and a context whose
 * AbortSignal fires on timeout or cancellation. Whatever it returns becomes
 * job.result; whatever it throws is a failed attempt (retried until
 * maxAttempts, then the job is marked failed).
 */

import { setTimeout as sleep } from 'node:timers/promises'
import type { Job, JobContext, QueueStore } from '@axiljs/queue'
import type { Mailer } from '../services/mailer.js'

export const JOB = {
  WELCOME_EMAIL: 'send-welcome-email',
  REPORT:        'generate-report',
  CLEANUP:       'cleanup-finished-jobs'
} as const

export interface WelcomeEmailData {
  email: string
  name:  string
}

export interface ReportData {
  kind: 'sales' | 'signups' | 'inventory'
  rows: number
}

export interface CleanupData {
  retentionMs: number
}

export type ProgressFn = (jobId: string, percent: number) => void

export function sendWelcomeEmail(mailer: Mailer) {
  return async (job: Job<WelcomeEmailData>) => {
    const { email, name } = job.data
    const { messageId } = await mailer.send({
      to:      email,
      subject: \`Welcome, \${name}!\`,
      text:    \`Hi \${name}, thanks for signing up.\`
    })
    return { messageId, to: email }
  }
}

/** A slow job in ten steps that reports progress after each one. */
export function generateReport(stepMs: number, progress: ProgressFn) {
  return async (job: Job<ReportData>, context?: JobContext) => {
    const { kind, rows } = job.data
    const steps = 10
    let processed = 0

    for (let step = 1; step <= steps; step++) {
      // Rejects as soon as the job times out or is cancelled
      await sleep(stepMs, undefined, { signal: context?.signal })
      processed = Math.round((rows * step) / steps)
      progress(job.id, step * 10)
    }

    return {
      kind,
      rows:        processed,
      file:        \`/reports/\${kind}-\${job.id}.csv\`,
      generatedAt: new Date().toISOString()
    }
  }
}

/** The periodic cleanup, as a job so it gets retries, timeouts and events. */
export function cleanupFinishedJobs(store: QueueStore, onRemove: (jobId: string) => void) {
  return async (job: Job<CleanupData>) => ({
    removed: removeFinishedJobs(store, job.data.retentionMs, onRemove)
  })
}

const FINISHED = new Set(['completed', 'failed', 'cancelled'])

/** Remove finished jobs older than retentionMs; returns how many were removed. */
export function removeFinishedJobs(
  store: QueueStore,
  retentionMs: number,
  onRemove: (jobId: string) => void = () => {},
  now = Date.now()
): number {
  let removed = 0
  for (const job of store.list()) {
    if (FINISHED.has(job.status) && job.finishedAt && now - job.finishedAt.getTime() >= retentionMs) {
      store.remove(job.id)
      onRemove(job.id)
      removed++
    }
  }
  return removed
}
`,

    'src/jobs/schedule.ts': `/**
 * Cron tasks (5 fields: minute hour day month weekday).
 *
 * Registered only when RUN_SCHEDULER=true. Every process that starts a
 * Scheduler fires every task, so enable it in exactly one process (see README).
 * Tasks stay tiny: they enqueue jobs, so the real work gets retries and events.
 */

import type { Job, JobOptions, Scheduler } from '@axiljs/queue'
import type { Config } from '../config.js'
import { JOB } from './handlers.js'
import type { CleanupData, ReportData } from './handlers.js'

export const TASK = {
  CLEANUP:      'cleanup-finished-jobs',
  DAILY_REPORT: 'daily-signups-report'
} as const

export type Enqueue = (name: string, data: unknown, options?: JobOptions) => Promise<Job<unknown>>

export function registerScheduledTasks(
  scheduler: Scheduler,
  enqueue: Enqueue,
  config: Pick<Config, 'CLEANUP_CRON' | 'DAILY_REPORT_CRON' | 'JOB_RETENTION_MS'>
): void {
  // Default: every 10 minutes
  scheduler.schedule(TASK.CLEANUP, config.CLEANUP_CRON, async () => {
    const data: CleanupData = { retentionMs: config.JOB_RETENTION_MS }
    await enqueue(JOB.CLEANUP, data, { maxAttempts: 1 })
  })

  // Default: 06:00 every day. Run this in two processes and the report is built twice.
  scheduler.schedule(TASK.DAILY_REPORT, config.DAILY_REPORT_CRON, async () => {
    const data: ReportData = { kind: 'signups', rows: 5000 }
    await enqueue(JOB.REPORT, data)
  })
}
`,

    'src/jobs/system.ts': `/**
 * The job system: store, queue + workers, event bus, optional scheduler.
 *
 * Created once in main.ts (and once per test suite), then shared with the
 * HTTP layer. start() begins processing; stop() lets running jobs finish.
 */

import { EventBus, registerEventHandlers } from '@axiljs/events'
import { InMemoryQueueStore, Queue, Scheduler } from '@axiljs/queue'
import type { Job, JobOptions } from '@axiljs/queue'
import type { Config } from '../config.js'
import { JOB_EVENTS, JobActivity } from '../events/job-activity.js'
import type { JobEventPayload } from '../events/job-activity.js'
import { ConsoleMailer } from '../services/mailer.js'
import type { Mailer } from '../services/mailer.js'
import { JOB, cleanupFinishedJobs, generateReport, sendWelcomeEmail } from './handlers.js'
import { registerScheduledTasks } from './schedule.js'

export interface JobSystemDeps {
  /** Defaults to ConsoleMailer; tests pass a fake. */
  mailer?: Mailer
}

export interface JobSystem {
  queue:      Queue
  store:      InMemoryQueueStore
  bus:        EventBus
  activity:   JobActivity
  /** Only present when RUN_SCHEDULER=true. */
  scheduler?: Scheduler
  /** Add a job with the configured attempts and timeout. */
  enqueue<T>(name: string, data: T, options?: JobOptions): Promise<Job<T>>
  /** Last reported progress (0-100) of a job, if it reports any. */
  progress(jobId: string): number | undefined
  start(): void
  stop(): Promise<void>
}

export function createJobSystem(config: Config, deps: JobSystemDeps = {}): JobSystem {
  const quiet    = config.NODE_ENV === 'test'
  const store    = new InMemoryQueueStore()
  const progress = new Map<string, number>()

  const queue = new Queue('jobs', {
    concurrency:    config.QUEUE_CONCURRENCY,
    pollIntervalMs: config.QUEUE_POLL_MS,
    backoff:        { type: config.RETRY_BACKOFF === 'fixed' ? 'fixed' : 'exponential', delay: config.RETRY_DELAY_MS },
    store
  })

  // ─── Workers ──────────────────────────────────────────────────────────────

  queue.process(JOB.WELCOME_EMAIL, sendWelcomeEmail(deps.mailer ?? new ConsoleMailer(quiet)))
  queue.process(JOB.REPORT, generateReport(config.REPORT_STEP_MS, (id, pct) => progress.set(id, pct)))
  queue.process(JOB.CLEANUP, cleanupFinishedJobs(store, id => progress.delete(id)))

  // ─── Queue lifecycle -> domain events ─────────────────────────────────────

  const bus = new EventBus()
  const payload = (job: Job, extra: Partial<JobEventPayload> = {}): JobEventPayload => ({
    jobId:       job.id,
    name:        job.name,
    attempts:    job.attempts,
    maxAttempts: job.maxAttempts,
    ...extra
  })

  queue.on('completed', (job: Job, result: unknown) => {
    void bus.emit(JOB_EVENTS.COMPLETED, payload(job, { result }), { source: 'queue' })
  })
  queue.on('retry', (job: Job, err: Error) => {
    void bus.emit(JOB_EVENTS.RETRYING, payload(job, { error: err.message, nextAttemptAt: job.runAt.toISOString() }), { source: 'queue' })
  })
  queue.on('failed', (job: Job, err: Error) => {
    void bus.emit(JOB_EVENTS.FAILED, payload(job, { error: err.message }), { source: 'queue' })
  })
  queue.on('cancelled', (job: Job) => {
    void bus.emit(JOB_EVENTS.CANCELLED, payload(job), { source: 'queue' })
  })

  const activity = new JobActivity(100, failed => {
    if (!quiet) console.warn(\`[jobs] \${failed.name} \${failed.jobId} failed after \${failed.attempts} attempt(s): \${failed.error}\`)
  })
  registerEventHandlers(activity, bus)

  // ─── Enqueue with defaults ────────────────────────────────────────────────

  const enqueue = <T>(name: string, data: T, options: JobOptions = {}): Promise<Job<T>> =>
    queue.add<T>(name, data, {
      maxAttempts: config.JOB_MAX_ATTEMPTS,
      timeoutMs:   config.JOB_TIMEOUT_MS > 0 ? config.JOB_TIMEOUT_MS : undefined,
      ...options
    })

  // ─── Scheduler (opt-in) ───────────────────────────────────────────────────

  let scheduler: Scheduler | undefined
  if (config.RUN_SCHEDULER) {
    scheduler = new Scheduler()
    registerScheduledTasks(scheduler, enqueue, config)
  }

  return {
    queue,
    store,
    bus,
    activity,
    scheduler,
    enqueue,
    progress: jobId => progress.get(jobId),
    start() {
      queue.start()
      scheduler?.start()
    },
    async stop() {
      scheduler?.stop()
      await queue.stop()
    }
  }
}
`,

    'src/events/job-activity.ts': `/**
 * Subscriber for job lifecycle events.
 *
 * @OnEvent marks methods; registerEventHandlers(instance, bus) subscribes them.
 * 'job.*' matches every job event (job.completed, job.failed, ...).
 */

import { OnEvent } from '@axiljs/events'
import type { axilEvent } from '@axiljs/events'

export const JOB_EVENTS = {
  COMPLETED: 'job.completed',
  RETRYING:  'job.retrying',
  FAILED:    'job.failed',
  CANCELLED: 'job.cancelled'
} as const

export interface JobEventPayload {
  jobId:          string
  name:           string
  attempts:       number
  maxAttempts:    number
  result?:        unknown
  error?:         string
  nextAttemptAt?: string
}

export interface ActivityEntry {
  id:        string
  type:      string
  timestamp: string
  jobId:     string
  name:      string
  attempts:  number
  error?:    string
}

export class JobActivity {
  private entries: ActivityEntry[] = []

  constructor(
    private readonly limit = 100,
    private readonly alert: (payload: JobEventPayload) => void = () => {}
  ) {}

  @OnEvent('job.*')
  record(event: axilEvent<JobEventPayload>): void {
    const { jobId, name, attempts, error } = event.payload
    this.entries.unshift({ id: event.id, type: event.type, timestamp: event.timestamp, jobId, name, attempts, error })
    if (this.entries.length > this.limit) this.entries.length = this.limit
  }

  // A dead letter: page someone, open a ticket, post to chat...
  @OnEvent(JOB_EVENTS.FAILED)
  onFailed(event: axilEvent<JobEventPayload>): void {
    this.alert(event.payload)
  }

  /** Newest first. */
  list(): ActivityEntry[] {
    return [...this.entries]
  }
}
`,

    'src/services/mailer.ts': `/**
 * Mail delivery behind an interface, so a real provider can replace the
 * development mailer without touching the job handlers.
 */

import { randomUUID } from 'node:crypto'

export interface Email {
  to:      string
  subject: string
  text:    string
}

export interface Mailer {
  send(email: Email): Promise<{ messageId: string }>
}

/**
 * Development mailer: logs instead of sending.
 * Addresses at @bounce.test always fail, to demo retries and the failed state.
 */
export class ConsoleMailer implements Mailer {
  constructor(private readonly quiet = false) {}

  async send(email: Email): Promise<{ messageId: string }> {
    if (email.to.endsWith('@bounce.test')) {
      throw new Error(\`Mailbox unavailable: \${email.to}\`)
    }
    const messageId = \`msg_\${randomUUID()}\`
    if (!this.quiet) console.log(\`[mail] to=\${email.to} subject="\${email.subject}" id=\${messageId}\`)
    return { messageId }
  }
}
`,

    'src/middleware/error-handler.ts': `/**
 * Error handler: turns thrown errors into one JSON shape.
 *
 *   { "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }
 *
 * axilError subclasses (NotFoundError, ValidationError, ...) keep their status
 * and code; anything else is a 500 whose message is hidden in production.
 */

import { axilError } from '@axiljs/core'
import type { ErrorMiddlewareFn } from '@axiljs/core'

export function errorHandler(env: string): ErrorMiddlewareFn {
  // Four parameters: that is how Application.use() recognises an error handler
  return (err, req, res, _next) => {
    const known  = err instanceof axilError
    const status = known ? err.statusCode : 500

    if (status >= 500) console.error(\`[\${req.method} \${req.path}]\`, err)

    res.status(status).json({
      error: {
        code:    known ? err.code : 'INTERNAL_ERROR',
        message: status >= 500 && env === 'production' ? 'Internal server error' : err.message,
        ...(known && err.details !== undefined ? { details: err.details } : {})
      }
    })
  }
}
`,

    'src/test-utils.ts': `/**
 * Test helpers: millisecond-scale config and a poll-until-done helper.
 */

import { setTimeout as sleep } from 'node:timers/promises'
import { createTestClient } from '@axiljs/testing'
import type { TestClient } from '@axiljs/testing'
import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { createJobSystem } from './jobs/system.js'
import type { JobSystem, JobSystemDeps } from './jobs/system.js'

/** Fast everything: 5 ms polling, fixed 5 ms backoff, 1 ms report steps. */
export const TEST_ENV: Record<string, string> = {
  NODE_ENV:         'test',
  QUEUE_POLL_MS:    '5',
  RETRY_BACKOFF:    'fixed',
  RETRY_DELAY_MS:   '5',
  REPORT_STEP_MS:   '1',
  JOB_MAX_ATTEMPTS: '3',
  JOB_TIMEOUT_MS:   '2000'
}

export interface Harness {
  jobs:   JobSystem
  client: TestClient
}

/** Build a started job system + app. Call jobs.stop() in afterAll. */
export function setup(env: Record<string, string> = {}, deps: JobSystemDeps = {}): Harness {
  const config = loadConfig({ ...TEST_ENV, ...env })
  const jobs   = createJobSystem(config, deps)
  jobs.start()
  return { jobs, client: createTestClient(createApp(config, jobs)) }
}

const DONE = ['completed', 'failed', 'cancelled']

/** Poll GET /jobs/:id until the job reaches one of the given statuses. */
export async function waitForJob(client: TestClient, id: string, until: string[] = DONE, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const res = await client.get(\`/jobs/\${id}\`)
    if (res.status === 200 && until.includes(res.body.data.status)) return res.body.data
    if (Date.now() > deadline) {
      throw new Error(\`Job \${id} did not reach \${until.join('/')} within \${timeoutMs} ms (last: \${res.body.data?.status})\`)
    }
    await sleep(5)
  }
}
`,

    'src/app.test.ts': `import { describe, it, expect, afterAll } from '@axiljs/testing'
import { SERVICE } from './app.js'
import { JOB_EVENTS } from './events/job-activity.js'
import type { JobEventPayload } from './events/job-activity.js'
import type { Mailer } from './services/mailer.js'
import { setup, waitForJob } from './test-utils.js'

describe('service', () => {
  const { jobs, client } = setup()
  afterAll(() => jobs.stop())

  it('describes itself', async () => {
    const res = await client.get('/')
    expect(res.status).toBe(200)
    expect(res.body.data.service).toBe(SERVICE)
    expect(res.body.data.endpoints).toContain('GET    /jobs/:id')
  })

  it('reports health with queue counts', async () => {
    const res = await client.get('/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(typeof res.body.queue.pending).toBe('number')
    expect(res.body.scheduler).toBe(false)
  })

  it('returns a JSON 404 for unknown routes', async () => {
    const res = await client.get('/nope')
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })
})

describe('enqueue and poll', () => {
  const { jobs, client } = setup()
  afterAll(() => jobs.stop())

  it('answers 202 with a job id, then the job completes', async () => {
    const res = await client.post('/jobs/welcome-email').send({ email: 'ada@example.com', name: 'Ada' })
    expect(res.status).toBe(202)
    expect(res.body.code).toBe('HTTP_202_ACCEPTED')
    expect(res.body.data.status).toBe('pending')
    expect(res.headers['location']).toBe(\`/jobs/\${res.body.data.jobId}\`)

    const job = await waitForJob(client, res.body.data.jobId)
    expect(job.status).toBe('completed')
    expect(job.attempts).toBe(1)
    expect(job.result.to).toBe('ada@example.com')
    expect(job.result.messageId).toMatch(/^msg_/)
    expect(job.error).toBeNull()
  })

  it('runs a report with progress up to 100 and returns its result', async () => {
    const res = await client.post('/jobs/reports').send({ kind: 'sales', rows: 500 })
    expect(res.status).toBe(202)

    const job = await waitForJob(client, res.body.data.jobId)
    expect(job.status).toBe('completed')
    expect(job.progress).toBe(100)
    expect(job.result.kind).toBe('sales')
    expect(job.result.rows).toBe(500)
  })

  it('rejects invalid payloads with 422 and enqueues nothing', async () => {
    const before = jobs.queue.getJobs().length
    const res = await client.post('/jobs/reports').send({ kind: 'weather', rows: 0 })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    expect(jobs.queue.getJobs().length).toBe(before)
  })

  it('lists jobs, filtered by status', async () => {
    const res = await client.get('/jobs?status=completed')
    expect(res.status).toBe(200)
    expect(res.body.data.jobs.length).toBeGreaterThanOrEqual(2)
    for (const job of res.body.data.jobs) expect(job.status).toBe('completed')
    expect(res.body.data.stats.completed).toBeGreaterThanOrEqual(2)
  })

  it('returns 404 for an unknown job', async () => {
    const res = await client.get('/jobs/does-not-exist')
    expect(res.status).toBe(404)
  })
})

describe('retries and dead letters', () => {
  // Fails the first send for every address, succeeds on the retry
  const seen = new Set<string>()
  const flaky: Mailer = {
    async send(email) {
      if (email.to.endsWith('@bounce.test')) throw new Error('Mailbox unavailable')
      if (!seen.has(email.to)) {
        seen.add(email.to)
        throw new Error('SMTP timeout')
      }
      return { messageId: 'msg_retry' }
    }
  }
  const { jobs, client } = setup({}, { mailer: flaky })
  afterAll(() => jobs.stop())

  it('retries a failed attempt and then succeeds', async () => {
    const retrying = jobs.bus.waitFor<JobEventPayload>(JOB_EVENTS.RETRYING, 2000)
    const res = await client.post('/jobs/welcome-email').send({ email: 'grace@example.com', name: 'Grace' })

    const event = await retrying
    expect(event.payload.jobId).toBe(res.body.data.jobId)
    expect(event.payload.error).toBe('SMTP timeout')

    const job = await waitForJob(client, res.body.data.jobId)
    expect(job.status).toBe('completed')
    expect(job.attempts).toBe(2)
  })

  it('gives up after JOB_MAX_ATTEMPTS and keeps the job as failed', async () => {
    const failed = jobs.bus.waitFor<JobEventPayload>(JOB_EVENTS.FAILED, 2000)
    const res = await client.post('/jobs/welcome-email').send({ email: 'nobody@bounce.test', name: 'Bob' })

    const job = await waitForJob(client, res.body.data.jobId)
    expect(job.status).toBe('failed')
    expect(job.attempts).toBe(3)
    expect(job.maxAttempts).toBe(3)
    expect(job.error).toBe('Mailbox unavailable')

    const event = await failed
    expect(event.payload.jobId).toBe(job.id)
    expect(event.source).toBe('queue')

    const list = await client.get('/jobs?status=failed')
    expect(list.body.data.jobs.map((j: { id: string }) => j.id)).toContain(job.id)
  })

  it('re-queues a dead letter as a new job', async () => {
    const failed = jobs.queue.getJobs('failed')[0]
    const res = await client.post(\`/jobs/\${failed.id}/retry\`)
    expect(res.status).toBe(202)
    expect(res.body.data.jobId).not.toBe(failed.id)
    expect(res.body.data.name).toBe(failed.name)
  })

  it('refuses to retry a job that did not fail (409)', async () => {
    const done = jobs.queue.getJobs('completed')[0]
    const res = await client.post(\`/jobs/\${done.id}/retry\`)
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('CONFLICT')
  })
})

describe('cancel', () => {
  // Slow reports (10 x 50 ms) so there is time to cancel
  const { jobs, client } = setup({ REPORT_STEP_MS: '50' })
  afterAll(() => jobs.stop())

  it('cancels a running job, which is not retried', async () => {
    const res = await client.post('/jobs/reports').send({ kind: 'inventory' })
    const id = res.body.data.jobId
    await waitForJob(client, id, ['active'])

    const del = await client.delete(\`/jobs/\${id}\`)
    expect(del.status).toBe(200)
    expect(del.body.data.status).toBe('cancelled')

    const job = await waitForJob(client, id)
    expect(job.status).toBe('cancelled')
    expect(job.attempts).toBe(1)
  })

  it('answers 409 when the job already finished', async () => {
    const id = jobs.queue.getJobs('cancelled')[0].id
    const res = await client.delete(\`/jobs/\${id}\`)
    expect(res.status).toBe(409)
  })
})

describe('events', () => {
  const { jobs, client } = setup()
  afterAll(() => jobs.stop())

  it('emits job.completed with the result', async () => {
    const completed = jobs.bus.waitFor<JobEventPayload>(JOB_EVENTS.COMPLETED, 2000)
    const res = await client.post('/jobs/welcome-email').send({ email: 'linus@example.com', name: 'Linus' })

    const event = await completed
    expect(event.payload.jobId).toBe(res.body.data.jobId)
    expect(event.payload.name).toBe('send-welcome-email')
    expect((event.payload.result as { to: string }).to).toBe('linus@example.com')
  })

  it('records events through the @OnEvent subscriber', async () => {
    const res = await client.get('/events')
    expect(res.status).toBe(200)
    expect(res.body.data[0].type).toBe('job.completed')
    expect(res.body.data[0].name).toBe('send-welcome-email')
  })
})
`,

    'src/jobs/schedule.test.ts': `import { describe, it, expect, afterAll } from '@axiljs/testing'
import { Scheduler } from '@axiljs/queue'
import type { Job, JobOptions } from '@axiljs/queue'
import { loadConfig } from '../config.js'
import { TEST_ENV, setup, waitForJob } from '../test-utils.js'
import { JOB, removeFinishedJobs } from './handlers.js'
import { createJobSystem } from './system.js'
import { TASK, registerScheduledTasks } from './schedule.js'

// Nothing here waits for a real minute: tasks are inspected with getTasks()
// and triggered with runNow().

describe('scheduler is opt-in', () => {
  it('is off unless RUN_SCHEDULER=true', async () => {
    const { jobs, client } = setup()
    expect(jobs.scheduler).toBeUndefined()
    const res = await client.get('/schedule')
    expect(res.body.data.enabled).toBe(false)
    await jobs.stop()
  })

  it('rejects an invalid cron expression at startup', () => {
    const config = loadConfig({ ...TEST_ENV, RUN_SCHEDULER: 'true', CLEANUP_CRON: 'every ten minutes' })
    expect(() => createJobSystem(config)).toThrow()
  })
})

describe('scheduled tasks', () => {
  it('registers each task with its cron expression', async () => {
    const scheduler = new Scheduler()
    const added: Array<{ name: string, data: unknown, options?: JobOptions }> = []
    const enqueue = async (name: string, data: unknown, options?: JobOptions) => {
      added.push({ name, data, options })
      return { id: String(added.length) } as Job<unknown>
    }
    registerScheduledTasks(scheduler, enqueue, { CLEANUP_CRON: '*/5 * * * *', DAILY_REPORT_CRON: '30 7 * * 1-5', JOB_RETENTION_MS: 60000 })

    const tasks = scheduler.getTasks()
    expect(tasks.map(t => [t.name, t.expression])).toEqual([
      [TASK.CLEANUP, '*/5 * * * *'],
      [TASK.DAILY_REPORT, '30 7 * * 1-5']
    ])

    // Tasks only enqueue jobs
    await scheduler.runNow(TASK.CLEANUP)
    await scheduler.runNow(TASK.DAILY_REPORT)
    expect(added).toEqual([
      { name: JOB.CLEANUP, data: { retentionMs: 60000 }, options: { maxAttempts: 1 } },
      { name: JOB.REPORT, data: { kind: 'signups', rows: 5000 }, options: undefined }
    ])
  })
})

describe('cleanup job', () => {
  const { jobs, client } = setup({ RUN_SCHEDULER: 'true', JOB_RETENTION_MS: '0' })
  afterAll(() => jobs.stop())

  it('is listed by GET /schedule', async () => {
    const res = await client.get('/schedule')
    expect(res.body.data.enabled).toBe(true)
    expect(res.body.data.tasks.map((t: { name: string }) => t.name)).toContain(TASK.CLEANUP)
  })

  it('removes finished jobs when the cron task fires', async () => {
    const res = await client.post('/jobs/welcome-email').send({ email: 'ada@example.com', name: 'Ada' })
    const id = res.body.data.jobId
    await waitForJob(client, id)

    await jobs.scheduler!.runNow(TASK.CLEANUP)
    const cleanup = jobs.queue.getJobs().find(j => j.name === JOB.CLEANUP)!
    const done = await waitForJob(client, cleanup.id)
    expect(done.status).toBe('completed')
    expect(done.result.removed).toBeGreaterThanOrEqual(1)

    expect((await client.get(\`/jobs/\${id}\`)).status).toBe(404)
  })
})

describe('removeFinishedJobs', () => {
  it('keeps unfinished and recent jobs', () => {
    const config = loadConfig(TEST_ENV)
    const { store } = createJobSystem(config)
    const now = Date.now()
    const job = (id: string, status: Job['status'], finishedAgoMs?: number) => ({
      id, queue: 'jobs', name: 'x', data: {}, status, attempts: 1, maxAttempts: 1, delay: 0, priority: 0,
      createdAt: new Date(now), runAt: new Date(now),
      finishedAt: finishedAgoMs === undefined ? undefined : new Date(now - finishedAgoMs)
    }) as Job
    store.add(job('old-done', 'completed', 10_000))
    store.add(job('old-failed', 'failed', 10_000))
    store.add(job('recent', 'completed', 10))
    store.add(job('waiting', 'pending'))

    expect(removeFinishedJobs(store, 5_000, undefined, now)).toBe(2)
    expect(store.list().map(j => j.id).sort()).toEqual(['recent', 'waiting'])
  })
})
`
  }),

  nextSteps: () => [
    ['npm run dev', 'API + workers on http://localhost:3003 (scheduler on via .env)'],
    ['npm test', 'Enqueue/poll, retries, dead letters, cron wiring'],
    ['Edit src/jobs/handlers.ts', 'Add your own jobs']
  ]
}
