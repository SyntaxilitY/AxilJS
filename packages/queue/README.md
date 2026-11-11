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
