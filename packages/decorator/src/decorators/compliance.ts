/**
 * Compliance, audit and data-classification decorators.
 */

import { defineDecorator } from '../core/define'
import { registerMetadata } from '../core/registry'
import type { TDecoratorFunction } from '../core/types'

// ── tAudit ─────────────────────────────────────────────────────────────

export interface TAuditOptions {
  action: string
  compliance?: string[]
  includeRequest?: boolean
  includeResponse?: boolean
  sensitivity?: 'low' | 'medium' | 'high'
}

export const tAudit = (options: TAuditOptions): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tAudit',
      description: 'Logs the action to an immutable audit trail',
      purpose: 'Emits an audit event on method completion',
      why: 'Auditability is a first-class compliance semantic',
      whenToUse: 'On operations subject to compliance or forensic review',
      category: 'Compliance',
      targets: ['method'],
      consumedBy: ['@axiljs/cloud', 'Audit Sink'],
      composesWith: ['tHttp', 'tAuth', 'tTenantIsolated'],
      securityImpact: 'MEDIUM — audit failures can affect compliance posture',
      examples: [
        '@tAudit({ action: "user.deleted" })',
        '@tAudit({ action: "funds.transferred", compliance: ["SOC2", "PCI-DSS"] })'
      ]
    },
    (target, propertyKey) => {
      registerMetadata('tAudit', target, propertyKey, options)
    }
  )

// ── tSensitive ─────────────────────────────────────────────────────────

export type TDataClassification = 'PII' | 'PHI' | 'PCI' | 'SECRET' | 'INTERNAL'

export const tSensitive = (classification: TDataClassification): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tSensitive',
      description: 'Classifies data as sensitive',
      purpose: 'Marks a property as sensitive under a specific classification',
      why: 'Data classification drives redaction, encryption, and access rules',
      whenToUse: 'On persistent properties containing sensitive data',
      category: 'Compliance',
      targets: ['property'],
      consumedBy: ['VacuumORM', '@axiljs/security', 'Data Export'],
      composesWith: ['tColumn', 'tRedact'],
      securityImpact: 'HIGH — classification changes handling requirements',
      examples: ['@tSensitive("PII")', '@tSensitive("PCI")']
    },
    (target, propertyKey) => {
      registerMetadata('tSensitive', target, propertyKey, { classification })
    }
  )

// ── tRedact ────────────────────────────────────────────────────────────

export interface TRedactOptions {
  strategy?: 'mask' | 'hash' | 'remove'
  visibleChars?: number
}

export const tRedact = (options: TRedactOptions = {}): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tRedact',
      description: 'Redacts a property from logs and outbound payloads',
      purpose: 'Prevents sensitive values from appearing in logs or responses',
      why: 'Redaction is a first-class privacy semantic',
      whenToUse: 'On properties whose value must never leak',
      category: 'Compliance',
      targets: ['property'],
      consumedBy: ['@axiljs/observability', 'Response Serializer'],
      composesWith: ['tColumn', 'tSensitive'],
      securityImpact: 'HIGH',
      examples: [
        '@tRedact()',
        '@tRedact({ strategy: "mask", visibleChars: 4 })'
      ]
    },
    (target, propertyKey) => {
      registerMetadata('tRedact', target, propertyKey, options)
    }
  )

// ── tRetention ─────────────────────────────────────────────────────────

export interface TRetentionOptions {
  duration: string  // "90d", "1y"
  after?: 'created' | 'accessed' | 'updated'
}

export const tRetention = (options: TRetentionOptions): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tRetention',
      description: 'Declares data retention policy',
      purpose: 'Marks an entity or property with a retention window',
      why: 'Retention policy is a first-class compliance semantic',
      whenToUse: 'On data subject to legal or contractual retention limits',
      category: 'Compliance',
      targets: ['class', 'property'],
      consumedBy: ['Retention Sweeper', 'Data Export'],
      composesWith: ['tEntity', 'tColumn'],
      examples: ['@tRetention({ duration: "90d" })']
    },
    (target, propertyKey) => {
      registerMetadata('tRetention', target, propertyKey, options)
    }
  )