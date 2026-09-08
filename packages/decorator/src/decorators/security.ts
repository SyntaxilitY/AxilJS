/**
 * Security semantic decorators.
 */

import { defineDecorator } from '../core/define'
import { registerMetadata } from '../core/registry'
import type { TDecoratorFunction } from '../core/types'

// ── tAuth ──────────────────────────────────────────────────────────────

export interface TAuthOptions {
  required?: boolean
  schemes?: string[]
  mfa?: boolean
}

export const tAuth = (options: TAuthOptions = { required: true }): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tAuth',
      description: 'Declares authentication requirements',
      purpose: 'Marks a method or class as requiring authenticated access',
      why: 'Separates auth policy declaration from provider implementation',
      whenToUse: 'On any endpoint that must not be accessible anonymously',
      whenNotToUse: 'On public endpoints like health checks or registration',
      category: 'Security',
      targets: ['method', 'class'],
      consumedBy: ['@axiljs/security', '@axiljs/auth', 'OpenAPI Generator'],
      composesWith: ['tRole', 'tPermission', 'tPolicy', 'tRateLimit'],
      securityImpact: 'CRITICAL — misconfiguration exposes protected data',
      examples: ['@tAuth()', '@tAuth({ mfa: true })']
    },
    (target, propertyKey) => {
      registerMetadata('tAuth', target, propertyKey, options)
    }
  )

// ── tRole ──────────────────────────────────────────────────────────────

export const tRole = (...roles: string[]): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tRole',
      description: 'Requires one of the listed roles',
      purpose: 'Restricts execution to callers holding one of the given roles',
      why: 'Role-based access is a common semantic worth declaring at the callsite',
      whenToUse: 'When access is decided solely by role membership',
      whenNotToUse: 'When access depends on ownership or relationships — use tPolicy',
      category: 'Security',
      targets: ['method', 'class'],
      consumedBy: ['@axiljs/security', 'Policy Engine'],
      composesWith: ['tAuth', 'tPermission', 'tPolicy'],
      securityImpact: 'HIGH',
      examples: ['@tRole("admin")', '@tRole("admin", "editor")']
    },
    (target, propertyKey) => {
      registerMetadata('tRole', target, propertyKey, { roles })
    }
  )

// ── tPermission ────────────────────────────────────────────────────────

export const tPermission = (...permissions: string[]): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tPermission',
      description: 'Requires all listed permissions',
      purpose: 'Restricts execution to callers holding every listed permission',
      why: 'Fine-grained permission checks are a first-class access semantic',
      whenToUse: 'When access requires granular capability checks',
      category: 'Security',
      targets: ['method', 'class'],
      consumedBy: ['@axiljs/security', 'Policy Engine'],
      composesWith: ['tAuth', 'tRole', 'tPolicy'],
      securityImpact: 'HIGH',
      examples: ['@tPermission("users.write")', '@tPermission("orders.read", "orders.update")']
    },
    (target, propertyKey) => {
      registerMetadata('tPermission', target, propertyKey, { permissions })
    }
  )

// ── tPolicy ────────────────────────────────────────────────────────────

export const tPolicy = (name: string): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tPolicy',
      description: 'Declares an authorization policy',
      purpose: 'References a named policy that must evaluate true for access',
      why: 'Decouples authorization logic from route handlers via named policies',
      whenToUse: 'When access depends on relationships (ownership, membership, state)',
      whenNotToUse: 'For simple role checks — use tRole instead',
      category: 'Policy',
      targets: ['method', 'class'],
      consumedBy: ['Policy Engine', '@axiljs/security'],
      composesWith: ['tAuth', 'tRole', 'tPermission'],
      securityImpact: 'HIGH — policy evaluation determines access',
      examples: ['@tPolicy("OrderOwnership")', '@tPolicy("TenantAdmin")']
    },
    (target, propertyKey) => {
      registerMetadata('tPolicy', target, propertyKey, { name })
    }
  )

// ── tRateLimit ─────────────────────────────────────────────────────────

export interface TRateLimitOptions {
  limit: number
  window: string  // "1m", "1h", "10s"
  key?: string    // "ip" | "user" | "tenant" | custom
}

export const tRateLimit = (options: TRateLimitOptions): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tRateLimit',
      description: 'Declares rate limiting rules',
      purpose: 'Constrains how frequently an operation may execute',
      why: 'Rate limiting is a semantic constraint worth declaring at the callsite',
      whenToUse: 'On endpoints susceptible to abuse or expensive operations',
      category: 'Security',
      targets: ['method', 'class'],
      consumedBy: ['@axiljs/security'],
      composesWith: ['tHttp', 'tAuth'],
      securityImpact: 'MEDIUM',
      examples: ['@tRateLimit({ limit: 10, window: "1m" })']
    },
    (target, propertyKey) => {
      registerMetadata('tRateLimit', target, propertyKey, options)
    }
  )

// ── tCsrf ──────────────────────────────────────────────────────────────

export const tCsrf = (): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tCsrf',
      description: 'Declares CSRF protection requirement',
      purpose: 'Marks the endpoint as requiring a valid CSRF token',
      why: 'CSRF requirement is an explicit security semantic',
      whenToUse: 'On state-changing endpoints served to browser clients',
      category: 'Security',
      targets: ['method', 'class'],
      consumedBy: ['@axiljs/security'],
      composesWith: ['tHttp', 'tAuth'],
      securityImpact: 'HIGH',
      examples: ['@tCsrf()']
    },
    (target, propertyKey) => {
      registerMetadata('tCsrf', target, propertyKey, {})
    }
  )

// ── tSanitize ──────────────────────────────────────────────────────────

export interface TSanitizeOptions {
  stripHtml?: boolean
  trim?: boolean
  normalizeWhitespace?: boolean
}

export const tSanitize = (options: TSanitizeOptions = {}): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tSanitize',
      description: 'Declares input sanitization',
      purpose: 'Cleans user-supplied input before it reaches the handler',
      why: 'Input sanitization is a repeatable security semantic',
      whenToUse: 'On endpoints that accept free-text input',
      category: 'Security',
      targets: ['method', 'parameter'],
      consumedBy: ['@axiljs/security'],
      composesWith: ['tHttp', 'tBody'],
      securityImpact: 'MEDIUM',
      examples: ['@tSanitize({ stripHtml: true, trim: true })']
    },
    (target, propertyKey, descriptorOrIndex) => {
      const index = typeof descriptorOrIndex === 'number' ? descriptorOrIndex : undefined
      registerMetadata('tSanitize', target, propertyKey, options, index)
    }
  )

// ── tIpAllowList ───────────────────────────────────────────────────────

export const tIpAllowList = (...ips: string[]): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tIpAllowList',
      description: 'Restricts access to a set of IPs or CIDR blocks',
      purpose: 'Rejects requests from IPs outside the allow list',
      why: 'Network-layer restrictions belong in explicit route semantics',
      whenToUse: 'On internal or admin endpoints exposed on trusted networks',
      category: 'Security',
      targets: ['method', 'class'],
      consumedBy: ['@axiljs/security'],
      composesWith: ['tHttp', 'tAuth'],
      securityImpact: 'HIGH',
      examples: ['@tIpAllowList("192.168.1.0/24", "10.0.0.1")']
    },
    (target, propertyKey) => {
      registerMetadata('tIpAllowList', target, propertyKey, { ips })
    }
  )

// ── tVerifiedEmail ─────────────────────────────────────────────────────

export const tVerifiedEmail = (): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tVerifiedEmail',
      description: 'Requires the caller to have a verified email',
      purpose: 'Blocks execution for identities without verified email addresses',
      why: 'Email verification is a common identity assurance semantic',
      whenToUse: 'On endpoints that require trusted contact information',
      category: 'Security',
      targets: ['method', 'class'],
      consumedBy: ['@axiljs/security', '@axiljs/auth'],
      composesWith: ['tAuth'],
      examples: ['@tVerifiedEmail()']
    },
    (target, propertyKey) => {
      registerMetadata('tVerifiedEmail', target, propertyKey, {})
    }
  )