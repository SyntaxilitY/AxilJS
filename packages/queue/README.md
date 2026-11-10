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

## Storage

Jobs live in a `QueueStore` (default `InMemoryQueueStore`). Pass your own with
`new Queue('name', { store })`. The interface (`add/get/update/list/remove`) is
synchronous, so it fits in-memory or sync embedded stores, not network stores.

## Scheduler

- Standard cron day matching: if both day-of-month and day-of-week are
  restricted (e.g. `0 0 13 * 5`), a day matches if **either** matches.
- Ticks are armed with `setTimeout` at each minute boundary, so they don't drift.

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
