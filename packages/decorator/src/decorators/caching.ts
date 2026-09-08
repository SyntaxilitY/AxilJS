/**
 * Caching semantic decorators.
 */

import { defineDecorator } from '../core/define'
import { registerMetadata } from '../core/registry'
import type { TDecoratorFunction } from '../core/types'

// ── tCache ─────────────────────────────────────────────────────────────

export interface TCacheOptions {
  key: string | ((...args: any[]) => string)
  ttl: number
  tags?: string[]
  condition?: (result: unknown) => boolean
}

export const tCache = (options: TCacheOptions): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tCache',
      description: 'Caches the return value of the method',
      purpose: 'Memoizes the result under the given key and TTL',
      why: 'Declarative caching decouples cache strategy from business logic',
      whenToUse: 'On expensive, idempotent reads',
      whenNotToUse: 'On writes, personalized or real-time data',
      category: 'Caching',
      targets: ['method'],
      consumedBy: ['@axiljs/cloud Cache', '@axiljs/observability'],
      composesWith: ['tDatabase', 'tHttp', 'tCacheStampede'],
      conflictsWith: ['tCacheEvict on same key'],
      performanceImpact: 'Significant improvement for expensive operations',
      examples: [
        '@tCache({ key: (id) => `user:${id}`, ttl: 60_000 })'
      ]
    },
    (target, propertyKey) => {
      registerMetadata('tCache', target, propertyKey, options)
    }
  )

// ── tCacheEvict ────────────────────────────────────────────────────────

export interface TCacheEvictOptions {
  key?: string | ((...args: any[]) => string)
  tags?: string[]
  allEntries?: boolean
}

export const tCacheEvict = (options: TCacheEvictOptions): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tCacheEvict',
      description: 'Evicts cached values when the method runs',
      purpose: 'Removes matching entries from the cache after execution',
      why: 'Cache invalidation must be explicit and declarative',
      whenToUse: 'On write operations that invalidate cached reads',
      category: 'Caching',
      targets: ['method'],
      consumedBy: ['@axiljs/cloud Cache'],
      composesWith: ['tHttp', 'tDatabase'],
      examples: [
        '@tCacheEvict({ key: (id) => `user:${id}` })',
        '@tCacheEvict({ tags: ["products"] })'
      ]
    },
    (target, propertyKey) => {
      registerMetadata('tCacheEvict', target, propertyKey, options)
    }
  )

// ── tCachePut ──────────────────────────────────────────────────────────

export const tCachePut = (options: TCacheOptions): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tCachePut',
      description: 'Updates the cache with the method result',
      purpose: 'Writes the method return value to the cache after execution',
      why: 'Explicit cache refresh is complementary to eviction',
      whenToUse: 'On write operations whose result should replace a cached value',
      category: 'Caching',
      targets: ['method'],
      consumedBy: ['@axiljs/cloud Cache'],
      composesWith: ['tHttp', 'tDatabase'],
      examples: ['@tCachePut({ key: (id) => `user:${id}`, ttl: 60_000 })']
    },
    (target, propertyKey) => {
      registerMetadata('tCachePut', target, propertyKey, options)
    }
  )

// ── tCacheInvalidate ───────────────────────────────────────────────────

export const tCacheInvalidate = (...tags: string[]): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tCacheInvalidate',
      description: 'Invalidates cache entries by tag',
      purpose: 'Evicts every entry associated with the listed tags',
      why: 'Tag-based invalidation supports coordinated multi-key eviction',
      whenToUse: 'When several cached values must be evicted together',
      category: 'Caching',
      targets: ['method'],
      consumedBy: ['@axiljs/cloud Cache'],
      composesWith: ['tCache'],
      examples: ['@tCacheInvalidate("products", "categories")']
    },
    (target, propertyKey) => {
      registerMetadata('tCacheInvalidate', target, propertyKey, { tags })
    }
  )

// ── tCacheStampede ─────────────────────────────────────────────────────

export interface TCacheStampedeOptions {
  strategy: 'single-flight' | 'lock' | 'stale-while-revalidate'
  staleTtl?: number
}

export const tCacheStampede = (options: TCacheStampedeOptions): TDecoratorFunction =>
  defineDecorator(
    {
      name: 'tCacheStampede',
      description: 'Protects an expensive resource from cache stampedes',
      purpose: 'Coalesces concurrent misses into one underlying invocation',
      why: 'Cache stampedes can bring down downstream systems on cold caches',
      whenToUse: 'When a cache miss triggers an expensive downstream call',
      category: 'Caching',
      targets: ['method'],
      consumedBy: ['@axiljs/cloud Cache'],
      composesWith: ['tCache', 'tDedupe'],
      performanceImpact: 'Adds coordination cost during misses; eliminates stampedes',
      examples: [
        '@tCacheStampede({ strategy: "single-flight" })',
        '@tCacheStampede({ strategy: "stale-while-revalidate", staleTtl: 30_000 })'
      ]
    },
    (target, propertyKey) => {
      registerMetadata('tCacheStampede', target, propertyKey, options)
    }
  )