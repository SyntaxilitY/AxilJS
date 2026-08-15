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

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
