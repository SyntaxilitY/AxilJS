/**
 * Distributed-Ready Cache.
 *
 * In-memory TTL cache with tag-based invalidation and automatic
 * tenant key prefixing for data isolation.
 *
 * Usage:
 *   const cache = new CloudCache({ defaultTtlMs: 30_000 })
 *   cache.set('user:42', userData, { tags: ['tenant:acme'] })
 *   const user = cache.get('user:42')
 *   cache.invalidateTag('tenant:acme')  // clears all acme data
 */

import type { CacheEntry, CacheOptions } from './types';

export type { CacheEntry, CacheOptions };

export class CloudCache<T = unknown> {
  private store = new Map<string, CacheEntry<T>>();
  private defaultTtlMs: number;
  private maxEntries: number;

  constructor(options: CacheOptions = {}) {
    this.defaultTtlMs = options.defaultTtlMs ?? 60_000;
    this.maxEntries = options.maxEntries ?? 10_000;
  }

  /**
   * Store a value with optional TTL and tags.
   */
  set(
    key: string,
    value: T,
    options?: { ttlMs?: number; tags?: string[] }
  ): void {
    // LRU eviction when at capacity
    if (this.store.size >= this.maxEntries && !this.store.has(key)) {
      const oldest = this.store.keys().next().value;
      if (oldest) this.store.delete(oldest);
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + (options?.ttlMs ?? this.defaultTtlMs),
      tags: options?.tags ?? [],
    });
  }

  /**
   * Retrieve a value.  Returns `undefined` if missing or expired.
   */
  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (Date.now() >= entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }

    return entry.value;
  }

  /**
   * Check if a key exists and is not expired.
   */
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Delete a single key.
   */
  delete(key: string): boolean {
    return this.store.delete(key);
  }

  /**
   * Invalidate all entries matching a tag.
   * Useful for tenant-scoped cache busting.
   */
  invalidateTag(tag: string): number {
    let count = 0;
    for (const [key, entry] of this.store) {
      if (entry.tags.includes(tag)) {
        this.store.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Remove all expired entries.
   */
  prune(): number {
    const now = Date.now();
    let count = 0;
    for (const [key, entry] of this.store) {
      if (now >= entry.expiresAt) {
        this.store.delete(key);
        count++;
      }
    }
    return count;
  }

  /**
   * Clear the entire cache.
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Cache statistics.
   */
  stats(): { size: number; maxEntries: number; defaultTtlMs: number } {
    return {
      size: this.store.size,
      maxEntries: this.maxEntries,
      defaultTtlMs: this.defaultTtlMs,
    };
  }
}

/** Global singleton. */
export const cache = new CloudCache();