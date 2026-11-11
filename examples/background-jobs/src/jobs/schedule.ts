/**
 * Recurring work. Scheduled tasks stay tiny: they enqueue jobs (so retries,
 * timeouts and metrics apply) or do quick housekeeping.
 */

import type { Scheduler, Queue, QueueStore } from '@axiljs/queue'
import type { Logger } from '@axiljs/observability'

export interface ScheduleDeps {
  scheduler: Scheduler
  queue: Queue
  store: QueueStore
  logger: Logger
  /** Finished jobs older than this are dropped by the cleanup task. */
  retentionMs: number
}

const FINISHED = new Set(['completed', 'failed', 'cancelled'])

/** Remove finished jobs older than retentionMs; returns how many were removed. */
export function cleanupFinishedJobs(store: QueueStore, retentionMs: number, now = Date.now()): number {
  let removed = 0
  for (const job of store.list()) {
    if (FINISHED.has(job.status) && job.finishedAt && now - job.finishedAt.getTime() >= retentionMs) {
      store.remove(job.id)
      removed++
    }
  }
  return removed
}

export function registerScheduledTasks({ scheduler, queue, store, logger, retentionMs }: ScheduleDeps): void {
  // Every minute
  scheduler.schedule('cleanup-finished-jobs', '* * * * *', () => {
    const removed = cleanupFinishedJobs(store, retentionMs)
    if (removed > 0) logger.info('Removed finished jobs', { removed })
  })

  // Every 5 minutes
  scheduler.schedule('sync-inventory', '*/5 * * * *', async () => {
    await queue.add('sync-inventory', { skus: ['SKU-1001', 'SKU-1002', 'SKU-1003'] }, { maxAttempts: 3 })
  })

  // 02:00 every night
  scheduler.schedule('nightly-sales-report', '0 2 * * *', async () => {
    await queue.add('generate-report', { type: 'sales', rows: 50_000 }, { maxAttempts: 2, priority: -1 })
  })
}
