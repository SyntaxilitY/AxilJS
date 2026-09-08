/**
 * Runtime control decorators (feature flags, experiments, quotas, scheduling, multi-tenancy).
 */

import { defineDecorator } from '../core/define'
import { registerMetadata } from '../core/registry'
import type { TDecoratorFunction } from '../core/types'

// ── tFeatureFlag ───────────────────────────────────────────────────────

export interface TFeatureFlagOptions {
  fallback?: string
}

export const tFeatureFlag = (
  flag: string,
  options: TFeatureFlagOptions = {}
): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tFeatureFlag',
      description: 'Gates execution behind a feature flag',
      purpose: 'Enables or disables the operation based on a named flag',
      why: 'Feature flags are a first-class runtime control semantic',
      whenToUse: 'On operations under progressive rollout or kill-switching',
      category: 'Runtime',
      targets: ['method'],
      consumedBy: ['@axiljs/cloud'],
      composesWith: ['tExperiment', 'tRollout'],
      examples: [
        '@tFeatureFlag("new-checkout")',
        '@tFeatureFlag("ai-search", { fallback: "legacy-search" })'
      ]
    },
    (target, propertyKey) => {
      registerMetadata('tFeatureFlag', target, propertyKey, { flag, ...options })
    }
  )

// ── tExperiment ────────────────────────────────────────────────────────

export interface TExperimentOptions {
  name: string
  variants: string[]
  key?: string
}

export const tExperiment = (options: TExperimentOptions): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tExperiment',
      description: 'Declares an A/B or multivariate experiment',
      purpose: 'Selects a variant for the current caller',
      why: 'Experimentation is a distinct runtime semantic from feature flags',
      whenToUse: 'On operations under active experimental evaluation',
      category: 'Runtime',
      targets: ['method'],
      consumedBy: ['@axiljs/cloud', 'Experiment Engine'],
      composesWith: ['tFeatureFlag'],
      examples: [
        '@tExperiment({ name: "checkout-v2", variants: ["control", "new"] })'
      ]
    },
    (target, propertyKey) => {
      registerMetadata('tExperiment', target, propertyKey, options)
    }
  )

// ── tRollout ───────────────────────────────────────────────────────────

export interface TRolloutOptions {
  percentage: number
  key?: string
}

export const tRollout = (options: TRolloutOptions): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tRollout',
      description: 'Progressive rollout percentage',
      purpose: 'Enables the operation for a hashed percentage of callers',
      why: 'Progressive rollouts are safer than binary feature toggles',
      whenToUse: 'When rolling out new behavior to a fraction of traffic',
      category: 'Runtime',
      targets: ['method'],
      consumedBy: ['@axiljs/cloud'],
      composesWith: ['tFeatureFlag', 'tExperiment'],
      examples: ['@tRollout({ percentage: 10 })']
    },
    (target, propertyKey) => {
      registerMetadata('tRollout', target, propertyKey, options)
    }
  )

// ── tQuota ─────────────────────────────────────────────────────────────

export interface TQuotaOptions {
  resource: string
  amount?: number
  key?: string
}

export const tQuota = (options: TQuotaOptions): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tQuota',
      description: 'Checks and consumes tenant quota',
      purpose: 'Enforces a per-tenant resource limit for the operation',
      why: 'Quota enforcement is a first-class multi-tenant semantic',
      whenToUse: 'On operations that consume tenant-metered resources',
      category: 'Runtime',
      targets: ['method'],
      consumedBy: ['@axiljs/cloud'],
      composesWith: ['tTenantIsolated', 'tRateLimit'],
      examples: [
        '@tQuota({ resource: "api_calls", amount: 1 })',
        '@tQuota({ resource: "ai.tokens", amount: 1000 })'
      ]
    },
    (target, propertyKey) => {
      registerMetadata('tQuota', target, propertyKey, options)
    }
  )

// ── tResource ──────────────────────────────────────────────────────────

export interface TResourceOptions {
  cpu?: string
  memory?: string
  gpu?: string
}

export const tResource = (options: TResourceOptions): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tResource',
      description: 'Declares resource requirements',
      purpose: 'Communicates required CPU/memory/GPU to the runtime',
      why: 'Resource-aware scheduling requires explicit requirements',
      whenToUse: 'On heavy or specialized workloads',
      category: 'Runtime',
      targets: ['method', 'class'],
      consumedBy: ['@axiljs/cloud', 'Runtime Scheduler'],
      composesWith: ['tConcurrency', 'tBulkhead'],
      examples: ['@tResource({ cpu: "500m", memory: "256Mi" })']
    },
    (target, propertyKey) => {
      registerMetadata('tResource', target, propertyKey, options)
    }
  )

// ── tSchedule ──────────────────────────────────────────────────────────

export interface TScheduleOptions {
  cron?: string
  interval?: number
  timezone?: string
  overlap?: 'skip' | 'queue' | 'allow'
  name?: string
}

export const tSchedule = (
  cronOrOptions: string | TScheduleOptions
): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tSchedule',
      description: 'Runs the method on a schedule',
      purpose: 'Registers the method with the scheduler using cron or interval',
      why: 'Scheduling is a first-class backend semantic',
      whenToUse: 'On maintenance, aggregation, and periodic jobs',
      category: 'Runtime',
      targets: ['method'],
      consumedBy: ['@axiljs/queue', 'Scheduler'],
      composesWith: ['tTimeout', 'tRetry'],
      examples: [
        '@tSchedule("0 */5 * * *")',
        '@tSchedule({ cron: "0 0 * * *", timezone: "UTC", overlap: "skip" })'
      ]
    },
    (target, propertyKey) => {
      const options =
        typeof cronOrOptions === 'string' ? { cron: cronOrOptions } : cronOrOptions
      registerMetadata('tSchedule', target, propertyKey, options)
    }
  )

// ── tInterval / tDelay / tRunAt ────────────────────────────────────────

export const tInterval = (ms: number): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tInterval',
      description: 'Runs the method at a fixed interval',
      purpose: 'Schedules the method every N milliseconds',
      why: 'Fixed intervals are simpler than cron for lightweight periodic work',
      whenToUse: 'On lightweight periodic tasks',
      category: 'Runtime',
      targets: ['method'],
      consumedBy: ['Scheduler'],
      composesWith: ['tTimeout'],
      examples: ['@tInterval(30_000)']
    },
    (target, propertyKey) => {
      registerMetadata('tInterval', target, propertyKey, { ms })
    }
  )

export const tDelay = (ms: number): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tDelay',
      description: 'Runs the method once after a startup delay',
      purpose: 'Schedules a one-shot invocation N milliseconds after boot',
      why: 'Delayed startup tasks are common (warmup, prefetch)',
      whenToUse: 'On one-shot startup routines',
      category: 'Runtime',
      targets: ['method'],
      consumedBy: ['Scheduler'],
      composesWith: [],
      examples: ['@tDelay(5000)']
    },
    (target, propertyKey) => {
      registerMetadata('tDelay', target, propertyKey, { ms })
    }
  )

export const tRunAt = (dateTime: string): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tRunAt',
      description: 'Runs the method once at a specific date/time',
      purpose: 'Schedules a one-shot invocation at an absolute timestamp',
      why: 'Absolute-time scheduling is distinct from cron/interval',
      whenToUse: 'On tasks tied to specific calendar events',
      category: 'Runtime',
      targets: ['method'],
      consumedBy: ['Scheduler'],
      composesWith: [],
      examples: ['@tRunAt("2025-12-31T23:59:59Z")']
    },
    (target, propertyKey) => {
      registerMetadata('tRunAt', target, propertyKey, { dateTime })
    }
  )

// ── tTenant / tTenantBoundary / tCrossTenant ───────────────────────────

export interface TTenantOptions {
  strategy?: 'header' | 'subdomain' | 'jwt' | 'custom'
}

export const tTenant = (options: TTenantOptions = {}): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tTenant',
      description: 'Declares tenant-scoped execution',
      purpose: 'Requires a tenant context for the operation',
      why: 'Multi-tenant scoping is a first-class semantic',
      whenToUse: 'On operations that must always run in a tenant context',
      category: 'Runtime',
      targets: ['method', 'class'],
      consumedBy: ['@axiljs/cloud'],
      composesWith: ['tAuth', 'tTenantIsolated', 'tTenantBoundary'],
      securityImpact: 'HIGH',
      examples: ['@tTenant()', '@tTenant({ strategy: "subdomain" })']
    },
    (target, propertyKey) => {
      registerMetadata('tTenant', target, propertyKey, options)
    }
  )

export type TTenantBoundaryLevel = 'strict' | 'soft' | 'admin'

export const tTenantBoundary = (level: TTenantBoundaryLevel): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tTenantBoundary',
      description: 'Declares a tenant isolation boundary',
      purpose: 'Forbids or allows cross-tenant access at the given strictness',
      why: 'Explicit boundaries prevent accidental cross-tenant leakage',
      whenToUse: 'On operations where cross-tenant access must be controlled',
      category: 'Runtime',
      targets: ['method', 'class'],
      consumedBy: ['@axiljs/cloud'],
      composesWith: ['tTenant', 'tTenantIsolated'],
      securityImpact: 'CRITICAL',
      examples: ['@tTenantBoundary("strict")']
    },
    (target, propertyKey) => {
      registerMetadata('tTenantBoundary', target, propertyKey, { level })
    }
  )

export interface TCrossTenantOptions {
  reason: string
}

export const tCrossTenant = (options: TCrossTenantOptions): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tCrossTenant',
      description: 'Explicitly authorizes cross-tenant access',
      purpose: 'Marks the operation as an audited administrative cross-tenant action',
      why: 'Dangerous cross-tenant operations must be explicit and auditable',
      whenToUse: 'On support and platform admin tools that inspect multiple tenants',
      whenNotToUse: 'On regular application code — a code smell for standard endpoints',
      category: 'Runtime',
      targets: ['method'],
      consumedBy: ['@axiljs/cloud', 'Audit Sink'],
      composesWith: ['tAudit', 'tRole', 'tPermission'],
      securityImpact: 'CRITICAL',
      examples: ['@tCrossTenant({ reason: "platform-admin" })']
    },
    (target, propertyKey) => {
      registerMetadata('tCrossTenant', target, propertyKey, options)
    }
  )