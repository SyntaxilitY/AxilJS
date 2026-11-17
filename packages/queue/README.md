# @axiljs/queue

Message queue with priority and retry, plus cron-based task scheduler.

Part of the [AxilJS](https://github.com/SyntaxilitY/AxilJS) ecosystem.

## Install

```bash
npm install @axiljs/queue
```

## Usage

```typescript
import { Queue, Scheduler } from '@axiljs/queue'

const queue = new Queue('emails', { concurrency: 5 })
queue.process('send-welcome', async (job) => sendEmail(job.data.to))
queue.start()
await queue.add('send-welcome', { to: 'tariq@syntaxility.dev' })

const scheduler = new Scheduler()
scheduler.schedule('daily-report', '0 9 * * *', generateReport)
scheduler.start()
```

## Cancellation and timeouts

```typescript
queue.process('report', async (job, ctx) => {
  return build(job.data, { signal: ctx?.signal }) // aborted on timeout/cancel
})

const job = await queue.add('report', data, { timeoutMs: 30_000, maxAttempts: 3 })
queue.cancel(job.id) // true if it was pending, delayed or active
queue.on('cancelled', (job) => {})
```

- `cancel(id)`: pending/delayed jobs become `cancelled` and never run. Active
  jobs become `cancelled`, their `AbortSignal` fires, the concurrency slot is
  freed, and the result is discarded (no retry, no completed/failed event).
- `timeoutMs`: an attempt that takes longer fails with a `JobTimeoutError`
  and is retried per `maxAttempts`.
- Listener errors in `added`/`completed`/`failed`/`retry`/`cancelled` handlers
  (sync throws or rejected promises) are logged and never affect the job.

## Retry backoff

`backoff: { type: 'exponential', delay }` (the default, `delay: 1000`) waits
`delay × 2^(attempt-1)` with **±25% proportional jitter**, i.e. a random value
in `[0.75×, 1.25×]` of that delay. A 10 ms base therefore retries after
7.5–12.5 ms, then 15–25 ms, … `type: 'fixed'` waits exactly `delay`.

## Logging

`Queue` and `Scheduler` log start/stop (and listener / task errors) to the
console by default. Pass `logger: false` to silence them (e.g. JSON logs,
tests) or route them to your own logger as plain text (errors go to `warn`):

```typescript
new Queue('emails', { logger: false })
new Scheduler({ logger: { info: (m) => log.info(m), warn: (m) => log.warn(m) } })
```

Failures stay observable through the `failed` / `retry` events either way.

## Storage

Jobs live in a `QueueStore` (default `InMemoryQueueStore`). Pass your own with
`new Queue('name', { store })`. The interface (`add/get/update/list/remove`) is
synchronous, so it fits in-memory or sync embedded stores, not network stores.
For a database shared by several servers, use a `backend` instead (see
[Multiple servers](#multiple-servers-sql-backend)).

## Durable storage

`InMemoryQueueStore` loses every job when the process exits. `FileQueueStore`
persists jobs to disk with synchronous `node:fs` calls and needs no extra
dependencies:

```typescript
import { Queue, FileQueueStore } from '@axiljs/queue'

const store = new FileQueueStore({ path: './data/emails.queue', compactEvery: 1000 })
const queue = new Queue('emails', { store })

process.on('SIGTERM', async () => {
  await queue.stop()
  store.close() // writes a final snapshot
})
```

- Layout: every change is appended to `<path>.journal` (JSON lines). Every
  `compactEvery` entries (default 1000; `0` disables), on open and on
  `close()`, the full state is written to `<path>.tmp` and atomically renamed
  to `<path>`, then the journal is emptied. `compact()` can also be called
  directly.
- Recovery: on open, the snapshot is loaded and the journal replayed. Jobs
  that were `active` when the process died return to `pending` with their
  attempt count kept, so they are retried within `maxAttempts`. Handlers
  should therefore be idempotent. A truncated final journal line (crash
  mid-write) is ignored; corruption elsewhere throws.
- Ordering is the same as the in-memory store: priority, then FIFO.
- Job `data` must be JSON-serializable (Dates in `data` come back as strings).
  A handler result that cannot be serialized is not persisted.
- Durability covers process crashes, not power loss: writes are not
  `fsync`ed, so the most recent changes can be lost if the machine itself
  goes down.
- Use one store per file, owned by a single process. Two processes sharing a
  file would overwrite each other's snapshots.

## Multiple servers (SQL backend)

`InMemoryQueueStore` and `FileQueueStore` belong to one process. To let
several processes or servers share one queue without Redis, give the queue a
`backend` instead of a `store`. `SqlQueueBackend` keeps jobs in a table in
PostgreSQL, MySQL 8 or SQLite:

```typescript
import { Queue, SqlQueueBackend } from '@axiljs/queue'
import { createConnection } from '@axiljs/orm'

const conn = await createConnection({ driver: 'postgres', url: process.env.DATABASE_URL })
const driver = conn.getDriver()

const backend = new SqlQueueBackend({
  table: 'axil_jobs', // default; created on first use
  executor: {
    dialect: 'postgres', // the same value as `driver` in the connection config
    query: (sql, params) => driver.query(sql, params),
    transaction: (fn) => driver.transaction((trx) => fn(trx)) // used by mysql only
  }
})

const queue = new Queue('emails', { backend, concurrency: 5, pollIntervalMs: 500 })
queue.process('send-welcome', async (job) => sendEmail(job.data.to))
queue.start()
```

Run the same code on every server. Each job is processed by exactly one of
them.

### How it works

- `claim()` moves due jobs to `active` in one atomic step and locks them to
  the worker (`workerId`, default `host:pid:random`):
  - PostgreSQL: `UPDATE ... WHERE id = ANY(ARRAY(SELECT ... FOR UPDATE SKIP LOCKED)) RETURNING *`
  - MySQL 8: `SELECT ... FOR UPDATE SKIP LOCKED` and `UPDATE` in one
    transaction (`executor.transaction`). Without `transaction` it falls back
    to one compare-and-set `UPDATE` per candidate row, which is also safe but
    does more round trips.
  - SQLite: `UPDATE ... WHERE id IN (SELECT ... LIMIT n) RETURNING *`. SQLite
    has a single writer, so this suits several processes on one machine
    sharing a database file, not several servers.
- Each worker polls every `pollIntervalMs` and also as soon as a slot frees
  up or a job is added locally. Concurrency, priority (then insertion order),
  `delay` / `runAt`, `maxAttempts` with backoff, `timeoutMs`, cancellation
  and the `added` / `completed` / `retry` / `failed` / `cancelled` events
  behave as with the in-memory store.
- Every poll renews the lock of the jobs the worker is running. If a server
  crashes, its jobs stop being renewed; after `visibilityTimeoutMs` (default
  30000) any worker returns them to `pending` with the attempt count kept.
  A stalled job that has no attempts left becomes `failed` instead. Handlers
  should be idempotent, because a job whose server died mid-run is run again.
- Completing, retrying or failing a job only succeeds while the worker still
  owns it. If the job was cancelled (from any server) or recovered as stale,
  the worker aborts its `AbortSignal` on the next poll and discards the result
  without emitting events.
- Backend errors (e.g. the database is unreachable) are emitted as `error`
  events and logged once per outage; polling continues.

### API differences in backend mode

The synchronous query methods cannot reach a database, so they throw. Use
the async variants, which also work without a backend:

| Store mode | Backend mode |
|---|---|
| `getJobs(status?)` | `await getJobsAsync(status?)` |
| `getJob(id)` | `await getJobAsync(id)` |
| `getStats()` | `await getStatsAsync()` |
| `cancel(id)` | `await cancelAsync(id)` |
| `purge()` | `await purgeAsync()` |

The `Job` object returned by `add()` is a snapshot; read the current state
with `getJobAsync(job.id)`.

### Table

`init()` (called lazily) runs `CREATE TABLE IF NOT EXISTS` plus two indexes:
`(queue, status, priority DESC, run_at)` for claiming and
`(status, locked_at)` for stale recovery. `schemaStatements()` returns the
DDL if you prefer to put it in a migration (then pass `autoCreate: false`).
Times are BIGINT epoch milliseconds; `data` and `result` are JSON text, so
they must be JSON-serializable. The table name must be a plain identifier,
optionally schema-qualified (`jobs.axil_jobs`). Several queues can share one
table; they are separated by the `queue` column.

Queries run outside `@axiljs/runtime`'s `tReadOnly` / `tPure` checks, so
enqueuing from a read-only method is not reported as a database write.

### Custom backends

`SqlQueueBackend` implements the `QueueBackend` interface (`enqueue`,
`claim`, `complete` / `fail` / `retry`, `update`, `cancel`, `heartbeat`,
`recoverStale`, `get`, `list`, `counts`, `remove`, `purge`). Implement it to
put jobs anywhere that supports an atomic claim. `InMemoryQueueBackend` is a
reference implementation for tests.

## Scheduler

- Standard cron day matching: if both day-of-month and day-of-week are
  restricted (e.g. `0 0 13 * 5`), a day matches if **either** matches.
- Ticks are armed with `setTimeout` at each minute boundary, so they don't drift.
- Validate expressions without scheduling: `isValidCron(expr)` → boolean,
  `validateCron(expr)` → error message or `null`. `parseCron` and `matchesCron`
  are exported too.

```typescript
import { isValidCron, validateCron } from '@axiljs/queue'

isValidCron('0 9 * * 1-5')  // true
validateCron('0 25 * * *')  // 'Invalid cron expression: ... The hour field matches no values'
```

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
