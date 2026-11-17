/**
 * Install shared stores in one call.
 *
 *   import { createSqlStores, fromConnection } from '@axiljs/stores'
 *   useStores(createSqlStores(fromConnection(db)))
 *
 * Any object with the matching members works, so a Redis or custom
 * implementation can be plugged in the same way. Stores that are not given
 * keep their current (default: in-process) implementation.
 */

import { setIdempotencyStore } from './intent';
import type { IdempotencyStore } from './intent';
import { setCacheStore, setLockProvider, setRateLimitStore } from './resilience';
import type { CacheStore, LockProvider, RateLimitCounterStore } from './resilience';

export interface RuntimeStores {
  /** tRateLimit / tThrottle counters. */
  rateLimit?: RateLimitCounterStore;
  /** tIdempotent results. */
  idempotency?: IdempotencyStore;
  /** tCache / tCachePut / tCacheEvict / tCacheInvalidate entries. */
  cache?: CacheStore;
  /** tLock leases. */
  lock?: LockProvider;
}

/** Install the given stores. Returns the names of the stores that were set. */
export function useStores(stores: RuntimeStores): Array<keyof RuntimeStores> {
  const installed: Array<keyof RuntimeStores> = [];
  if (stores.rateLimit) {
    setRateLimitStore(stores.rateLimit);
    installed.push('rateLimit');
  }
  if (stores.idempotency) {
    setIdempotencyStore(stores.idempotency);
    installed.push('idempotency');
  }
  if (stores.cache) {
    setCacheStore(stores.cache);
    installed.push('cache');
  }
  if (stores.lock) {
    setLockProvider(stores.lock);
    installed.push('lock');
  }
  return installed;
}
