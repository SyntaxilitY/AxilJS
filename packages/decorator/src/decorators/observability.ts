/**
 * Observability semantic decorators.
 */

import { defineDecorator } from '../core/define'
import { registerMetadata } from '../core/registry'
import type { TDecoratorFunction } from '../core/types'

// ── tTrace ─────────────────────────────────────────────────────────────

export interface TTraceOptions {
  tags?: Record<string, unknown>
  includeArgs?: boolean
  includeResult?: boolean
}

export const tTrace = (name?: string, options: TTraceOptions = {}): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tTrace',
      description: 'Creates a distributed trace span',
      purpose: 'Wraps execution in a named trace span with optional tags',
      why: 'Distributed tracing is a first-class observability semantic',
      whenToUse: 'On any operation that must appear in the trace tree',
      category: 'Observability',
      targets: ['method'],
      consumedBy: ['@axiljs/observability'],
      composesWith: ['tMetric', 'tLog'],
      examples: [
        '@tTrace("checkout-flow")',
        '@tTrace("db-query", { tags: { table: "users" } })'
      ]
    },
    (target, propertyKey) => {
      registerMetadata('tTrace', target, propertyKey, { name, ...options })
    }
  )

// ── tMetric ────────────────────────────────────────────────────────────

export type TMetricType = 'counter' | 'gauge' | 'histogram' | 'summary'

export interface TMetricOptions {
  labels?: string[]
  buckets?: number[]
}

export const tMetric = (
  name: string,
  type: TMetricType,
  options: TMetricOptions = {}
): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tMetric',
      description: 'Records a metric for the method invocation',
      purpose: 'Emits a metric of the given type on each call',
      why: 'Declarative metrics remove instrumentation boilerplate',
      whenToUse: 'On methods whose invocation is worth measuring',
      category: 'Observability',
      targets: ['method'],
      consumedBy: ['@axiljs/observability'],
      composesWith: ['tTrace', 'tLog'],
      examples: [
        '@tMetric("orders.created", "counter")',
        '@tMetric("search.duration", "histogram")'
      ]
    },
    (target, propertyKey) => {
      registerMetadata('tMetric', target, propertyKey, { name, type, ...options })
    }
  )

// ── tLog ───────────────────────────────────────────────────────────────

export type TLogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error'

export interface TLogOptions {
  message?: string
  includeArgs?: boolean
  includeResult?: boolean
  includeError?: boolean
}

export const tLog = (
  level: TLogLevel = 'info',
  options: TLogOptions = {}
): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tLog',
      description: 'Structured logging around method execution',
      purpose: 'Emits a structured log entry at method boundaries',
      why: 'Structured logging is a first-class observability semantic',
      whenToUse: 'On methods whose invocation is worth logging',
      category: 'Observability',
      targets: ['method'],
      consumedBy: ['@axiljs/observability'],
      composesWith: ['tTrace', 'tMetric'],
      examples: ['@tLog("info", { includeArgs: true })']
    },
    (target, propertyKey) => {
      registerMetadata('tLog', target, propertyKey, { level, ...options })
    }
  )

// ── tHealthCheck ───────────────────────────────────────────────────────

export const tHealthCheck = (name: string): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tHealthCheck',
      description: 'Registers a method as a health check probe',
      purpose: 'Marks the method as a health probe with a given name',
      why: 'Health checks are a first-class operational semantic',
      whenToUse: 'On methods that verify a subsystem is healthy',
      category: 'Observability',
      targets: ['method'],
      consumedBy: ['@axiljs/observability'],
      composesWith: [],
      examples: ['@tHealthCheck("database")']
    },
    (target, propertyKey) => {
      registerMetadata('tHealthCheck', target, propertyKey, { name })
    }
  )

// ── tSlo ───────────────────────────────────────────────────────────────

export interface TSloOptions {
  latency?: number
  percentile?: number
  errorBudget?: number
}

export const tSlo = (options: TSloOptions): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tSlo',
      description: 'Declares a service-level objective',
      purpose: 'Sets latency and error-budget targets for the operation',
      why: 'SLOs are a first-class operational semantic',
      whenToUse: 'On critical user-facing operations with reliability targets',
      category: 'Observability',
      targets: ['method'],
      consumedBy: ['@axiljs/observability', 'SLO Monitor'],
      composesWith: ['tCritical', 'tTrace'],
      examples: ['@tSlo({ latency: 300, percentile: 99 })']
    },
    (target, propertyKey) => {
      registerMetadata('tSlo', target, propertyKey, options)
    }
  )

// ── tCritical ──────────────────────────────────────────────────────────

export const tCritical = (): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tCritical',
      description: 'Marks the method as a critical execution path',
      purpose: 'Flags the method for elevated monitoring and alerting',
      why: 'Critical paths deserve explicit operational attention',
      whenToUse: 'On operations whose failure has business-critical impact',
      category: 'Observability',
      targets: ['method'],
      consumedBy: ['@axiljs/observability', 'Alerting'],
      composesWith: ['tSlo', 'tTrace'],
      examples: ['@tCritical()']
    },
    (target, propertyKey) => {
      registerMetadata('tCritical', target, propertyKey, {})
    }
  )

// ── tSample ────────────────────────────────────────────────────────────

export interface TSampleOptions {
  rate: number
}

export const tSample = (options: TSampleOptions): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tSample',
      description: 'Controls telemetry sampling for the method',
      purpose: 'Sets a fractional sampling rate for traces/metrics/logs',
      why: 'Sampling controls telemetry cost on high-volume paths',
      whenToUse: 'On very high-volume endpoints with low individual signal value',
      category: 'Observability',
      targets: ['method'],
      consumedBy: ['@axiljs/observability'],
      composesWith: ['tTrace', 'tLog'],
      examples: ['@tSample({ rate: 0.1 })']
    },
    (target, propertyKey) => {
      registerMetadata('tSample', target, propertyKey, options)
    }
  )