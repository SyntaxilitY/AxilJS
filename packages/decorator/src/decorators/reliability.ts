/**
 * Distributed reliability semantic decorators.
 */

import { defineDecorator } from '../core/define'
import { registerMetadata } from '../core/registry'
import type { TDecoratorFunction } from '../core/types'

// ── tRetry ─────────────────────────────────────────────────────────────

export interface TRetryOptions {
  attempts: number
  delay?: number
  backoff?: 'fixed' | 'linear' | 'exponential'
  maxDelay?: number
  retryOn?: string[]
}

export const tRetry = (options: TRetryOptions): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tRetry',
      description: 'Automatically retries a failed operation',
      purpose: 'Retries the method on failure with the given strategy',
      why: 'Retry policies are a first-class reliability semantic',
      whenToUse: 'On idempotent operations that may transiently fail',
      whenNotToUse: 'On non-idempotent operations without tIdempotent',
      category: 'Reliability',
      targets: ['method'],
      consumedBy: ['@axiljs/circuit', '@axiljs/queue'],
      composesWith: ['tTimeout', 'tCircuitBreaker', 'tIdempotent', 'tFallback'],
      examples: [
        '@tRetry({ attempts: 3, backoff: "exponential" })'
      ]
    },
    (target, propertyKey) => {
      registerMetadata('tRetry', target, propertyKey, options)
    }
  )

// ── tTimeout ───────────────────────────────────────────────────────────

export const tTimeout = (ms: number): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tTimeout',
      description: 'Enforces a maximum execution time',
      purpose: 'Aborts the operation if it exceeds the given duration',
      why: 'Bounded execution time is a critical reliability semantic',
      whenToUse: 'On operations that call external systems or perform heavy work',
      category: 'Reliability',
      targets: ['method'],
      consumedBy: ['@axiljs/circuit'],
      composesWith: ['tRetry', 'tCircuitBreaker'],
      examples: ['@tTimeout(5000)']
    },
    (target, propertyKey) => {
      registerMetadata('tTimeout', target, propertyKey, { ms })
    }
  )

// ── tDeadline ──────────────────────────────────────────────────────────

export const tDeadline = (at: string | Date): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tDeadline',
      description: 'Enforces an absolute execution deadline',
      purpose: 'Rejects execution after the given absolute timestamp',
      why: 'Deadlines are useful for time-bounded workflows and scheduled tasks',
      whenToUse: 'On operations that must complete by a specific time',
      category: 'Reliability',
      targets: ['method'],
      consumedBy: ['@axiljs/circuit', '@axiljs/queue'],
      composesWith: ['tTimeout', 'tRetry'],
      examples: ['@tDeadline("2025-12-31T23:59:59Z")']
    },
    (target, propertyKey) => {
      registerMetadata('tDeadline', target, propertyKey, { at })
    }
  )

// ── tCircuitBreaker ────────────────────────────────────────────────────

export interface TCircuitBreakerOptions {
  threshold: number
  resetTimeout?: number
  halfOpenAttempts?: number
}

export const tCircuitBreaker = (options: TCircuitBreakerOptions): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tCircuitBreaker',
      description: 'Applies the circuit breaker pattern',
      purpose: 'Stops calling a failing dependency until it recovers',
      why: 'Circuit breakers prevent cascading failures across services',
      whenToUse: 'On calls to unstable or slow downstream services',
      category: 'Reliability',
      targets: ['method'],
      consumedBy: ['@axiljs/circuit'],
      composesWith: ['tRetry', 'tTimeout', 'tFallback'],
      examples: ['@tCircuitBreaker({ threshold: 5, resetTimeout: 30_000 })']
    },
    (target, propertyKey) => {
      registerMetadata('tCircuitBreaker', target, propertyKey, options)
    }
  )

// ── tFallback ──────────────────────────────────────────────────────────

export interface TFallbackOptions<T = unknown> {
  value?: T
  method?: string
}

export const tFallback = <T = unknown>(options: TFallbackOptions<T>): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tFallback',
      description: 'Provides a fallback when the operation fails',
      purpose: 'Returns a fallback value or method result on failure',
      why: 'Graceful degradation is a first-class reliability semantic',
      whenToUse: 'When failure of a call should not fail the caller',
      category: 'Reliability',
      targets: ['method'],
      consumedBy: ['@axiljs/circuit'],
      composesWith: ['tCircuitBreaker', 'tRetry', 'tTimeout'],
      examples: [
        '@tFallback({ value: [] })',
        '@tFallback({ method: "getCachedData" })'
      ]
    },
    (target, propertyKey) => {
      registerMetadata('tFallback', target, propertyKey, options)
    }
  )

// ── tBulkhead ──────────────────────────────────────────────────────────

export interface TBulkheadOptions {
  name: string
  concurrency: number
  queue?: number
}

export const tBulkhead = (options: TBulkheadOptions): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tBulkhead',
      description: 'Isolates resource capacity for a call',
      purpose: 'Prevents one workload from exhausting shared resources',
      why: 'Bulkheading is essential for multi-workload backend systems',
      whenToUse: 'When a subsystem must not consume more than a fixed share',
      category: 'Reliability',
      targets: ['method'],
      consumedBy: ['@axiljs/circuit'],
      composesWith: ['tRetry', 'tCircuitBreaker', 'tTimeout'],
      examples: ['@tBulkhead({ name: "payments", concurrency: 20, queue: 100 })']
    },
    (target, propertyKey) => {
      registerMetadata('tBulkhead', target, propertyKey, options)
    }
  )

// ── tHedge ─────────────────────────────────────────────────────────────

export interface THedgeOptions {
  delay: number
  maxAttempts?: number
}

export const tHedge = (options: THedgeOptions): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tHedge',
      description: 'Speculatively issues parallel attempts',
      purpose: 'Fires an additional attempt if the first exceeds a latency threshold',
      why: 'Hedging reduces tail latency for latency-sensitive operations',
      whenToUse: 'On idempotent reads sensitive to tail latency',
      whenNotToUse: 'On non-idempotent operations',
      category: 'Reliability',
      targets: ['method'],
      consumedBy: ['@axiljs/circuit'],
      composesWith: ['tIdempotent', 'tTimeout'],
      examples: ['@tHedge({ delay: 100, maxAttempts: 2 })']
    },
    (target, propertyKey) => {
      registerMetadata('tHedge', target, propertyKey, options)
    }
  )