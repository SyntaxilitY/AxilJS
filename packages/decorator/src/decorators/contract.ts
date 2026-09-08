/**
 * API contract semantic decorators.
 */

import { defineDecorator } from '../core/define'
import { registerMetadata } from '../core/registry'
import type { TDecoratorFunction } from '../core/types'

// ── tContract ──────────────────────────────────────────────────────────

export interface TContractOptions {
  request?: unknown
  response?: unknown
  errors?: Record<number, unknown>
}

export const tContract = (options: TContractOptions): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tContract',
      description: 'Declares a full request/response contract',
      purpose: 'Binds a method to input, output, and error contracts',
      why: 'Explicit contracts drive validation, OpenAPI, SDK, and Studio tooling',
      whenToUse: 'On public API endpoints with published contracts',
      category: 'Contract',
      targets: ['method'],
      consumedBy: ['@axiljs/core', 'OpenAPI Generator', 'SDK Generator', '@axiljs/studio'],
      composesWith: ['tHttp', 'tConsumes', 'tProduces', 'tPaginated'],
      examples: [
        '@tContract({ response: UserResponse })'
      ]
    },
    (target, propertyKey) => {
      registerMetadata('tContract', target, propertyKey, options)
    }
  )

// ── tConsumes ──────────────────────────────────────────────────────────

export const tConsumes = (...contentTypes: string[]): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tConsumes',
      description: 'Declares accepted request content types',
      purpose: 'Lists MIME types the endpoint can accept',
      why: 'Content negotiation is a first-class API contract semantic',
      whenToUse: 'On endpoints with a restricted content-type surface',
      category: 'Contract',
      targets: ['method'],
      consumedBy: ['@axiljs/core', 'OpenAPI Generator'],
      composesWith: ['tHttp', 'tContract'],
      examples: ['@tConsumes("application/json")']
    },
    (target, propertyKey) => {
      registerMetadata('tConsumes', target, propertyKey, { contentTypes })
    }
  )

// ── tProduces ──────────────────────────────────────────────────────────

export interface TProducesOptions {
  contentType: string
  charset?: string
}

export const tProduces = (options: TProducesOptions): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tProduces',
      description: 'Declares produced response content type',
      purpose: 'Lists the MIME type the endpoint returns',
      why: 'Response type is a first-class API contract semantic',
      whenToUse: 'On endpoints returning non-default content types',
      category: 'Contract',
      targets: ['method'],
      consumedBy: ['@axiljs/core', 'OpenAPI Generator'],
      composesWith: ['tHttp', 'tContract'],
      examples: ['@tProduces({ contentType: "application/json" })']
    },
    (target, propertyKey) => {
      registerMetadata('tProduces', target, propertyKey, options)
    }
  )

// ── tPaginated ─────────────────────────────────────────────────────────

export interface TPaginatedOptions {
  item?: unknown
  strategy?: 'offset' | 'cursor' | 'keyset'
  defaultLimit?: number
  maxLimit?: number
}

export const tPaginated = (options: TPaginatedOptions = {}): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tPaginated',
      description: 'Declares a paginated collection response',
      purpose: 'Marks the endpoint as returning a paginated envelope',
      why: 'Pagination is a first-class contract semantic',
      whenToUse: 'On any list endpoint returning bounded pages',
      category: 'Contract',
      targets: ['method'],
      consumedBy: ['@axiljs/core', 'OpenAPI Generator', 'SDK Generator'],
      composesWith: ['tHttp', 'tContract'],
      examples: ['@tPaginated({ strategy: "offset", defaultLimit: 20 })']
    },
    (target, propertyKey) => {
      registerMetadata('tPaginated', target, propertyKey, options)
    }
  )

// ── tDeprecated ────────────────────────────────────────────────────────

export interface TDeprecatedOptions {
  since?: string
  removeAfter?: string
  replacement?: string
  message?: string
}

export const tDeprecated = (options: TDeprecatedOptions = {}): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tDeprecated',
      description: 'Marks the endpoint or method as deprecated',
      purpose: 'Signals that the operation should no longer be used',
      why: 'Deprecation is a first-class API lifecycle semantic',
      whenToUse: 'On endpoints scheduled for removal or replacement',
      category: 'Contract',
      targets: ['method', 'class'],
      consumedBy: ['OpenAPI Generator', '@axiljs/studio', 'Runtime Warning'],
      composesWith: ['tHttp'],
      examples: [
        '@tDeprecated({ since: "2.0", removeAfter: "3.0", replacement: "/v3/users" })'
      ]
    },
    (target, propertyKey) => {
      registerMetadata('tDeprecated', target, propertyKey, options)
    }
  )