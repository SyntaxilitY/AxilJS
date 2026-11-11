/**
 * Queue workers. Each handler receives the job and a context whose
 * AbortSignal fires on timeout or cancellation.
 */

import type { Queue } from '@axiljs/queue'
import type { Email, SimulatedMailer } from '../services/mailer.js'
import type { InventoryClient } from '../services/inventory.js'
import { generateReport } from '../services/reports.js'
import type { ReportRequest } from '../services/reports.js'

export interface HandlerDeps {
  mailer: SimulatedMailer
  inventory: InventoryClient
  reportChunkLatencyMs: number
}

export function registerJobHandlers(queue: Queue, deps: HandlerDeps): void {
  queue.process<Email>('send-email', async (job, ctx) => {
    return deps.mailer.send(job.data, ctx?.signal)
  })

  queue.process<ReportRequest>('generate-report', async (job, ctx) => {
    return generateReport(job.data, { chunkLatencyMs: deps.reportChunkLatencyMs, signal: ctx?.signal })
  })

  queue.process<{ skus: string[] }>('sync-inventory', async (job) => {
    // Throws while the circuit is closed (→ queue retry); once it opens the
    // breaker answers with the stale snapshot and the job completes.
    return deps.inventory.sync(job.data.skus)
  })
}
