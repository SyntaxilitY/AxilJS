/**
 * Prometheus metrics fed by queue and circuit-breaker events.
 */

import { MetricsRegistry } from '@axiljs/observability'
import type { Queue, Job } from '@axiljs/queue'
import type { CircuitBreaker, CircuitState } from '@axiljs/circuit'
import type { Logger } from '@axiljs/observability'

const BREAKER_STATE: Record<CircuitState, number> = { CLOSED: 0, HALF_OPEN: 1, OPEN: 2 }

export interface JobMetrics {
  registry: MetricsRegistry
  /** Refresh point-in-time gauges (queue depth); call before exporting. */
  refresh(): void
}

export function instrumentJobs(queue: Queue, breaker: CircuitBreaker, logger: Logger): JobMetrics {
  const registry = new MetricsRegistry()

  const enqueued  = registry.counter('jobs_enqueued_total', 'Jobs added to the queue', ['job'])
  const completed = registry.counter('jobs_completed_total', 'Jobs that finished successfully', ['job'])
  const failed    = registry.counter('jobs_failed_total', 'Jobs that failed after their last attempt', ['job'])
  const retried   = registry.counter('jobs_retried_total', 'Failed attempts that were scheduled for retry', ['job'])
  const cancelled = registry.counter('jobs_cancelled_total', 'Jobs cancelled before finishing', ['job'])
  const duration  = registry.histogram('job_duration_ms', 'Duration of the final attempt in ms',
    [10, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000], ['job', 'outcome'])
  const depth     = registry.gauge('queue_jobs', 'Jobs currently in the queue by status', ['status'])
  const circuit   = registry.gauge('circuit_breaker_state', 'Circuit state (0 closed, 1 half-open, 2 open)', ['name'])

  const elapsed = (job: Job): number => job.startedAt ? Date.now() - job.startedAt.getTime() : 0

  queue.on('added', (job: Job) => {
    enqueued.inc({ job: job.name })
  })
  queue.on('completed', (job: Job) => {
    completed.inc({ job: job.name })
    duration.observe(elapsed(job), { job: job.name, outcome: 'completed' })
    logger.info('Job completed', { id: job.id, job: job.name, attempts: job.attempts })
  })
  queue.on('retry', (job: Job, error: Error) => {
    retried.inc({ job: job.name })
    logger.warn('Job attempt failed, retrying', {
      id: job.id, job: job.name, attempt: job.attempts, of: job.maxAttempts,
      retryAt: job.runAt.toISOString(), error: error.message
    })
  })
  queue.on('failed', (job: Job, error: Error) => {
    failed.inc({ job: job.name })
    duration.observe(elapsed(job), { job: job.name, outcome: 'failed' })
    logger.error('Job failed', { id: job.id, job: job.name, attempts: job.attempts, error: error.message })
  })
  queue.on('cancelled', (job: Job) => {
    cancelled.inc({ job: job.name })
    logger.info('Job cancelled', { id: job.id, job: job.name })
  })

  circuit.set(BREAKER_STATE[breaker.getState()], { name: breaker.name })
  breaker.on('stateChange', (state: CircuitState, previous: CircuitState) => {
    circuit.set(BREAKER_STATE[state], { name: breaker.name })
    logger.warn('Circuit state changed', { breaker: breaker.name, from: previous, to: state })
  })

  return {
    registry,
    refresh() {
      for (const [status, count] of Object.entries(queue.getStats())) depth.set(count, { status })
    }
  }
}
