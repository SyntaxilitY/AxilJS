/**
 * A minimal in-memory cache consumer.
 * Reads `tCache`, `tCacheEvict`, `tCacheInvalidate`, `tCacheStampede` metadata.
 */

interface Entry {
  value: unknown
  expiresAt: number
  tags: string[]
}

const store = new Map<string, Entry>()
const inFlight = new Map<string, Promise<unknown>>()

export function readCache<T = unknown>(key: string): T | undefined {
  const entry = store.get(key)
  if (!entry) return undefined
  if (entry.expiresAt < Date.now()) {
    store.delete(key)
    return undefined
  }
  return entry.value as T
}

export function writeCache(key: string, value: unknown, ttl: number, tags: string[] = []): void {
  store.set(key, { value, expiresAt: Date.now() + ttl, tags })
}

export function evictCache(key: string): void {
  store.delete(key)
}

export function invalidateByTag(tag: string): void {
  for (const [key, entry] of store.entries()) {
    if (entry.tags.includes(tag)) store.delete(key)
  }
}

/**
 * `tCacheStampede: { strategy: "single-flight" }` implementation.
 * Coalesces concurrent misses into a single underlying execution.
 */
export async function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const pending = inFlight.get(key)
  if (pending) return pending as Promise<T>

  const promise = fn().finally(() => inFlight.delete(key))
  inFlight.set(key, promise)
  return promise
}