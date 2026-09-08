/**
 * Concurrency control semantic decorators.
 */

import { defineDecorator } from '../core/define'
import { registerMetadata } from '../core/registry'
import type { TDecoratorFunction } from '../core/types'

// ── tConcurrency ───────────────────────────────────────────────────────

export interface TConcurrencyOptions {
  limit: number
  strategy?: 'queue' | 'reject' | 'drop-oldest'
  key?: string | ((...args: any[]) => string)
}

export const tConcurrency = (options: TConcurrencyOptions): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tConcurrency',
      description: 'Limits concurrent executions',
      purpose: 'Bounds parallel execution of the operation',
      why: 'Concurrency limits are a critical backend safety semantic',
      whenToUse: 'On expensive or resource-bound operations',
      category: 'Concurrency',
      targets: ['method'],
      consumedBy: ['@axiljs/circuit', 'Runtime'],
      composesWith: ['tBulkhead', 'tTimeout', 'tThrottle'],
      examples: ['@tConcurrency({ limit: 10, strategy: "queue" })']
    },
    (target, propertyKey) => {
      registerMetadata('tConcurrency', target, propertyKey, options)
    }
  )

// ── tLock ──────────────────────────────────────────────────────────────

export interface TLockOptions {
  key: string | ((...args: any[]) => string)
  ttl?: number
  wait?: number
}

export const tLock = (options: TLockOptions): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tLock',
      description: 'Acquires a distributed or resource lock',
      purpose: 'Serializes execution across processes on a keyed lock',
      why: 'Distributed locking is essential for correctness in scaled systems',
      whenToUse: 'When only one process may execute a given operation at a time',
      whenNotToUse: 'On high-frequency operations without careful design',
      category: 'Concurrency',
      targets: ['method'],
      consumedBy: ['Lock Manager', '@axiljs/cloud'],
      composesWith: ['tTransaction', 'tIdempotent'],
      performanceImpact: 'Introduces coordination overhead',
      examples: [
        '@tLock({ key: (orderId) => `order:${orderId}`, ttl: 30_000 })'
      ]
    },
    (target, propertyKey) => {
      registerMetadata('tLock', target, propertyKey, options)
    }
  )

// ── tMutex ─────────────────────────────────────────────────────────────

export interface TMutexOptions {
  key?: string
}

export const tMutex = (options: TMutexOptions = {}): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tMutex',
      description: 'In-process mutual exclusion',
      purpose: 'Ensures only one invocation runs at a time within a single process',
      why: 'Process-local mutual exclusion is simpler and cheaper than distributed locks',
      whenToUse: 'When contention is process-local',
      category: 'Concurrency',
      targets: ['method'],
      consumedBy: ['Runtime'],
      composesWith: ['tIdempotent'],
      examples: ['@tMutex()']
    },
    (target, propertyKey) => {
      registerMetadata('tMutex', target, propertyKey, options)
    }
  )

// ── tDedupe ────────────────────────────────────────────────────────────

export interface TDedupeOptions {
  key: string | ((...args: any[]) => string)
  window?: number
}

export const tDedupe = (options: TDedupeOptions): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tDedupe',
      description: 'Deduplicates concurrent identical requests',
      purpose: 'Coalesces overlapping calls with the same key into one execution',
      why: 'Deduplication prevents thundering-herd on expensive operations',
      whenToUse: 'On expensive reads or actions that may fire in bursts',
      category: 'Concurrency',
      targets: ['method'],
      consumedBy: ['Runtime', '@axiljs/circuit'],
      composesWith: ['tCache', 'tTimeout'],
      examples: ['@tDedupe({ key: (id) => `user:${id}` })']
    },
    (target, propertyKey) => {
      registerMetadata('tDedupe', target, propertyKey, options)
    }
  )

// ── tIdempotent ────────────────────────────────────────────────────────

export interface TIdempotentOptions {
  key: string
  ttl?: number
}

export const tIdempotent = (options: TIdempotentOptions): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tIdempotent',
      description: 'Enforces idempotency using an idempotency key',
      purpose: 'Rejects duplicate operations within a TTL window',
      why: 'Idempotency is a first-class distributed correctness semantic',
      whenToUse: 'On write operations that must not be duplicated',
      category: 'Concurrency',
      targets: ['method'],
      consumedBy: ['Runtime', '@axiljs/queue'],
      composesWith: ['tRetry', 'tOutbox'],
      examples: [
        '@tIdempotent({ key: "request.id", ttl: 86_400_000 })'
      ]
    },
    (target, propertyKey) => {
      registerMetadata('tIdempotent', target, propertyKey, options)
    }
  )

// ── tThrottle ──────────────────────────────────────────────────────────

export const tThrottle = (calls: number, periodMs: number): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tThrottle',
      description: 'Limits execution frequency',
      purpose: 'Ensures the method executes at most N times per period',
      why: 'Throttling protects downstream systems and expensive operations',
      whenToUse: 'On operations that must not exceed a rate ceiling',
      category: 'Concurrency',
      targets: ['method'],
      consumedBy: ['Runtime'],
      composesWith: ['tRateLimit', 'tConcurrency'],
      examples: ['@tThrottle(1, 1000)']
    },
    (target, propertyKey) => {
      registerMetadata('tThrottle', target, propertyKey, { calls, periodMs })
    }
  )

// ── tDebounce ──────────────────────────────────────────────────────────

export const tDebounce = (ms: number): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tDebounce',
      description: 'Collapses repeated invocations into one',
      purpose: 'Delays execution until after a quiet period',
      why: 'Debouncing is useful for reactive workloads (typing, saves)',
      whenToUse: 'On operations triggered by rapid user or event bursts',
      category: 'Concurrency',
      targets: ['method'],
      consumedBy: ['Runtime'],
      composesWith: ['tThrottle'],
      examples: ['@tDebounce(300)']
    },
    (target, propertyKey) => {
      registerMetadata('tDebounce', target, propertyKey, { ms })
    }
  )