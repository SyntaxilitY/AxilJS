/**
 * The job catalogue: payload schema and default options per job name.
 * POST /jobs validates against these before anything is queued.
 */

import { v } from '@axiljs/validation'
import type { JobStatus } from '@axiljs/queue'

export const JOB_NAMES = ['send-email', 'generate-report', 'sync-inventory'] as const
export type JobName = typeof JOB_NAMES[number]

export const JOB_STATUSES: JobStatus[] = ['pending', 'active', 'completed', 'failed', 'delayed', 'cancelled']

export const jobSchemas = {
  'send-email': v.object({
    to:      v.string().trim().email(),
    subject: v.string().trim().min(1).max(200),
    body:    v.string().max(10_000).optional()
  }),
  'generate-report': v.object({
    type: v.enum(['sales', 'inventory', 'users']),
    rows: v.number().integer().min(1).max(1_000_000).default(10_000)
  }),
  'sync-inventory': v.object({
    skus: v.array(v.string().trim().min(1).max(64)).min(1).max(100).default(['SKU-1001', 'SKU-1002', 'SKU-1003'])
  })
}

export interface JobDefaults {
  /** Attempts before the job is marked failed (retries use the queue backoff). */
  maxAttempts: number
  /** Per-attempt time limit; the handler's AbortSignal fires when it expires. */
  timeoutMs?: number
}

export function jobDefaults(name: JobName, reportTimeoutMs: number): JobDefaults {
  switch (name) {
    case 'send-email':      return { maxAttempts: 4, timeoutMs: 10_000 }
    case 'generate-report': return { maxAttempts: 2, timeoutMs: reportTimeoutMs }
    case 'sync-inventory':  return { maxAttempts: 3, timeoutMs: 15_000 }
  }
}
