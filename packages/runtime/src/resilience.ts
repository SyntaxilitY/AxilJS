/**
 * Resilience and concurrency interceptors.
 *
 *   order 110  tRateLimit       fixed-window limit per key ('ip', 'user', 'tenant', custom)
 *   order 115  tThrottle        at most N executions per period for the method
 *   order 125  tDebounce        collapse a burst of calls into the last one
 *   order 130  tCache           memoize results per key with TTL and tags
 *   order 135  tCacheEvict / tCachePut / tCacheInvalidate
 *   order 140  tDedupe          coalesce concurrent calls with the same key
 *   order 150  tFallback        value or method used when the call fails
 *   order 250  tCircuitBreaker  open after N consecutive failures (inside tRetry)
 *   order 260  tBulkhead        named capacity shared by every method using the name
 *   order 265  tConcurrency     per-method (or per-key) concurrency limit
 *   order 270  tMutex           one call at a time per method (or key)
 *   order 275  tLock            keyed lock with wait and TTL; pluggable provider
 *   order 290  tHedge           start a second attempt when the first is slow
 *
 * State is per process. tLock accepts a LockProvider for cross-process locks
 * and tCache a CacheStore for a shared cache.
 */

import { axilError } from '@axiljs/common';
import { emitSafe } from './emit';
import { label, parseDuration, resolveKey } from './keys';
import type { KeySpec } from './keys';
import { reportSideEffect } from './intent';
import { registerInterceptor } from './interceptors';
import type { Interceptor, Invocation } from './interceptors';

// ─── Errors ───────────────────────────────────────────────────────────────────

export class RateLimitExceededError extends axilError {
  constructor(public readonly target: string, public readonly retryAfterMs: number) {
    super(`${target}: rate limit exceeded, retry in ${Math.ceil(retryAfterMs / 1000)}s`, 429, 'RATE_LIMITED', { retryAfterMs });
    this.name = 'RateLimitExceededError';
  }
}

export class CircuitOpenError extends axilError {
  constructor(public readonly target: string) {
    super(`${target}: circuit is open`, 503, 'CIRCUIT_OPEN');
    this.name = 'CircuitOpenError';
  }
}

export class CapacityExceededError extends axilError {
  constructor(public readonly target: string, public readonly resource: string) {
    super(`${target}: ${resource} is at capacity`, 503, 'CAPACITY_EXCEEDED');
    this.name = 'CapacityExceededError';
  }
}

export class LockTimeoutError extends axilError {
  constructor(public readonly target: string, public readonly key: string, public readonly waitMs: number) {
    super(`${target}: could not acquire lock '${key}' within ${waitMs}ms`, 409, 'LOCK_TIMEOUT');
    this.name = 'LockTimeoutError';
  }
}

// ─── Semaphore ────────────────────────────────────────────────────────────────

interface Waiter {
  resolve: (release: () => void) => void;
  reject: (err: Error) => void;
  timer?: NodeJS.Timeout;
}

/** Counting semaphore with a bounded FIFO wait queue. */
export class Semaphore {
  private active = 0;
  private waiters: Waiter[] = [];

  constructor(public readonly limit: number, public readonly maxQueue = Infinity) {}

  get running(): number { return this.active; }
  get queued(): number { return this.waiters.length; }

  /**
   * Resolves with a release function. Rejects with `onFull()` when the
   * queue is full, or with `onTimeout()` after `waitMs`.
   */
  acquire(options: { waitMs?: number; onFull: () => Error; onTimeout?: () => Error; dropOldest?: boolean }): Promise<() => void> {
    if (this.active < this.limit) {
      this.active++;
      return Promise.resolve(this.releaser());
    }
    if (this.waiters.length >= this.maxQueue) {
      if (options.dropOldest && this.waiters.length > 0) {
        const oldest = this.waiters.shift()!;
        if (oldest.timer) clearTimeout(oldest.timer);
        oldest.reject(options.onFull());
      } else {
        return Promise.reject(options.onFull());
      }
    }
    return new Promise((resolve, reject) => {
      const waiter: Waiter = { resolve, reject };
      if (options.waitMs !== undefined && Number.isFinite(options.waitMs)) {
        waiter.timer = setTimeout(() => {
          const index = this.waiters.indexOf(waiter);
          if (index !== -1) this.waiters.splice(index, 1);
          reject((options.onTimeout ?? options.onFull)());
        }, options.waitMs);
        waiter.timer.unref?.();
      }
      this.waiters.push(waiter);
    });
  }

  private releaser(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.waiters.shift();
      if (next) {
        if (next.timer) clearTimeout(next.timer);
        next.resolve(this.releaser());
      } else {
        this.active--;
      }
    };
  }
}

async function withPermit<T>(permit: Promise<() => void>, run: () => Promise<T>): Promise<T> {
  const release = await permit;
  try {
    return await run();
  } finally {
    release();
  }
}

/** Per-target (and optionally per-key) map that drops idle entries. */
function keyed<V>(): { get(k: string, create: () => V): V; delete(k: string): void; clear(): void; map: Map<string, V> } {
  const map = new Map<string, V>();
  return {
    map,
    get(k, create) {
      let v = map.get(k);
      if (v === undefined) {
        v = create();
        map.set(k, v);
      }
      return v;
    },
    delete: k => { map.delete(k); },
    clear: () => map.clear()
  };
}

// ─── tRateLimit / tThrottle ───────────────────────────────────────────────────

interface Window { count: number; resetAt: number }
const windows = new Map<string, Window>();
let windowSweep = 0;

function hit(key: string, limit: number, periodMs: number): number {
  const now = Date.now();
  if (++windowSweep % 1000 === 0) {
    for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
  }
  let w = windows.get(key);
  if (!w || w.resetAt <= now) {
    w = { count: 0, resetAt: now + periodMs };
    windows.set(key, w);
  }
  w.count++;
  return w.count > limit ? w.resetAt - now : 0;
}

/**
 * Counter backend for tRateLimit and tThrottle. Same shape as
 * @axiljs/security's RateLimitStore, so its ClusterStore and the SQL store
 * from @axiljs/stores can be used directly. Default: in-process counters.
 */
export interface RateLimitCounterStore {
  increment(key: string, windowMs: number): { count: number; resetAt: number } | Promise<{ count: number; resetAt: number }>;
}

let counterStore: RateLimitCounterStore | undefined;

export function setRateLimitStore(store: RateLimitCounterStore | undefined): void {
  counterStore = store;
}

/** Returns ms until the window resets when over the limit, else 0. */
function count(key: string, limit: number, periodMs: number): number | Promise<number> {
  if (!counterStore) return hit(key, limit, periodMs);
  return Promise.resolve(counterStore.increment(key, periodMs)).then(r =>
    r.count > limit ? Math.max(1, r.resetAt - Date.now()) : 0
  );
}

function limited(target: string, key: string, retryAfter: number, proceed: () => Promise<unknown>): Promise<unknown> {
  if (retryAfter > 0) {
    emitSafe('runtime.rate_limited', { target, key, retryAfterMs: retryAfter });
    return Promise.reject(new RateLimitExceededError(target, retryAfter));
  }
  return proceed();
}

export const rateLimitInterceptor: Interceptor<{ limit: number; window: string; key?: KeySpec }> = {
  decorator: 'tRateLimit',
  order: 110,
  intercept(inv, options, proceed) {
    const target = label(inv);
    const who = options.key === undefined ? 'global' : resolveKey(options.key, inv) ?? 'anonymous';
    const result = count(`rl:${target}:${who}`, options.limit, parseDuration(options.window));
    return typeof result === 'number'
      ? limited(target, who, result, proceed)
      : result.then(r => limited(target, who, r, proceed));
  }
};

export const throttleInterceptor: Interceptor<{ calls: number; periodMs: number }> = {
  decorator: 'tThrottle',
  order: 115,
  intercept(inv, { calls, periodMs }, proceed) {
    const target = label(inv);
    const result = count(`th:${target}`, calls, periodMs);
    return typeof result === 'number'
      ? limited(target, 'global', result, proceed)
      : result.then(r => limited(target, 'global', r, proceed));
  }
};

// ─── tDebounce ────────────────────────────────────────────────────────────────

interface Burst {
  timer: NodeJS.Timeout;
  run: () => Promise<unknown>;
  settle: Array<{ resolve: (v: unknown) => void; reject: (e: unknown) => void }>;
}
const bursts = new WeakMap<object, Map<string, Burst>>();

export const debounceInterceptor: Interceptor<{ ms: number }> = {
  decorator: 'tDebounce',
  order: 125,
  intercept(inv, { ms }, proceed) {
    let perTarget = bursts.get(inv.target);
    if (!perTarget) {
      perTarget = new Map();
      bursts.set(inv.target, perTarget);
    }
    const name = inv.method;
    const existing = perTarget.get(name);
    if (existing) clearTimeout(existing.timer);

    // Every caller in the burst receives the result of the last call
    return new Promise((resolve, reject) => {
      const burst: Burst = existing ?? { timer: undefined as any, run: proceed, settle: [] };
      burst.run = proceed;
      burst.settle.push({ resolve, reject });
      burst.timer = setTimeout(() => {
        perTarget!.delete(name);
        burst.run().then(
          v => burst.settle.forEach(s => s.resolve(v)),
          e => burst.settle.forEach(s => s.reject(e))
        );
      }, ms);
      perTarget!.set(name, burst);
    });
  }
};

// ─── tCache ───────────────────────────────────────────────────────────────────

/** Cache backend for tCache. The default is in-memory per process. */
export interface CacheStore {
  get(key: string): { value: unknown } | undefined | Promise<{ value: unknown } | undefined>;
  set(key: string, value: unknown, ttlMs: number, tags: string[]): void | Promise<void>;
  delete(key: string): void | Promise<void>;
  deleteByTag(tag: string): void | Promise<void>;
  clear(): void | Promise<void>;
}

export class MemoryCacheStore implements CacheStore {
  private entries = new Map<string, { value: unknown; expires: number; tags: string[] }>();
  private tags = new Map<string, Set<string>>();

  constructor(private readonly maxEntries = 10_000) {}

  get(key: string): { value: unknown } | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expires <= Date.now()) {
      this.delete(key);
      return undefined;
    }
    return { value: entry.value };
  }

  set(key: string, value: unknown, ttlMs: number, tags: string[]): void {
    this.delete(key);
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.delete(oldest);
    }
    this.entries.set(key, { value, expires: Date.now() + ttlMs, tags });
    for (const tag of tags) {
      let set = this.tags.get(tag);
      if (!set) this.tags.set(tag, set = new Set());
      set.add(key);
    }
  }

  delete(key: string): void {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    for (const tag of entry.tags) this.tags.get(tag)?.delete(key);
  }

  deleteByTag(tag: string): void {
    for (const key of this.tags.get(tag) ?? []) this.delete(key);
    this.tags.delete(tag);
  }

  clear(): void {
    this.entries.clear();
    this.tags.clear();
  }

  get size(): number { return this.entries.size; }
}

let cacheStore: CacheStore = new MemoryCacheStore();

export function setCacheStore(store: CacheStore): void {
  cacheStore = store;
}

export function getCacheStore(): CacheStore {
  return cacheStore;
}

/** tCache keys: functions and templates resolve as usual; a plain string becomes `string:<json args>`. */
function cacheKey(spec: KeySpec, inv: Invocation): string | undefined {
  if (typeof spec === 'string' && !spec.includes('{') && !spec.includes(':') && !spec.startsWith('args.')) {
    return `${spec}:${JSON.stringify(inv.args)}`;
  }
  return resolveKey(spec, inv);
}

export const cacheInterceptor: Interceptor<{ key: KeySpec; ttl: number; tags?: string[]; condition?: (r: unknown) => boolean }> = {
  decorator: 'tCache',
  order: 130,
  async intercept(inv, options, proceed) {
    const key = cacheKey(options.key, inv);
    if (key === undefined) return proceed();
    reportSideEffect('cache.read', key);
    const hitEntry = await cacheStore.get(key);
    if (hitEntry) return hitEntry.value;
    const result = await proceed();
    if (!options.condition || options.condition(result)) {
      await cacheStore.set(key, result, options.ttl, options.tags ?? []);
    }
    return result;
  }
};

export const cachePutInterceptor: Interceptor<{ key: KeySpec; ttl: number; tags?: string[] }> = {
  decorator: 'tCachePut',
  order: 135,
  async intercept(inv, options, proceed) {
    const result = await proceed();
    const key = cacheKey(options.key, inv);
    if (key !== undefined) await cacheStore.set(key, result, options.ttl, options.tags ?? []);
    return result;
  }
};

export const cacheEvictInterceptor: Interceptor<{ key?: KeySpec; tags?: string[]; allEntries?: boolean }> = {
  decorator: 'tCacheEvict',
  order: 135,
  async intercept(inv, options, proceed) {
    const result = await proceed();
    if (options.allEntries) {
      await cacheStore.clear();
    } else {
      const key = options.key === undefined ? undefined : cacheKey(options.key, inv);
      if (key !== undefined) await cacheStore.delete(key);
      for (const tag of options.tags ?? []) await cacheStore.deleteByTag(tag);
    }
    return result;
  }
};

export const cacheInvalidateInterceptor: Interceptor<{ tags: string[] }> = {
  decorator: 'tCacheInvalidate',
  order: 135,
  async intercept(_inv, { tags }, proceed) {
    const result = await proceed();
    for (const tag of tags ?? []) await cacheStore.deleteByTag(tag);
    return result;
  }
};

// ─── tDedupe ──────────────────────────────────────────────────────────────────

const dedupe = new Map<string, { promise: Promise<unknown>; expires: number }>();

export const dedupeInterceptor: Interceptor<{ key: KeySpec; window?: number }> = {
  decorator: 'tDedupe',
  order: 140,
  intercept(inv, options, proceed) {
    const key = resolveKey(options.key, inv);
    if (key === undefined) return proceed();
    const full = `${label(inv)}:${key}`;
    const now = Date.now();
    const existing = dedupe.get(full);
    if (existing && (existing.expires === Infinity || existing.expires > now)) return existing.promise;

    const promise = proceed();
    const entry = { promise, expires: Infinity };
    dedupe.set(full, entry);
    const done = (ok: boolean) => {
      const windowMs = ok ? options.window ?? 0 : 0;
      if (windowMs > 0) {
        entry.expires = Date.now() + windowMs;
        const t = setTimeout(() => { if (dedupe.get(full) === entry) dedupe.delete(full); }, windowMs);
        t.unref?.();
      } else if (dedupe.get(full) === entry) {
        dedupe.delete(full);
      }
    };
    promise.then(() => done(true), () => done(false));
    return promise;
  }
};

// ─── tFallback ────────────────────────────────────────────────────────────────

export const fallbackInterceptor: Interceptor<{ value?: unknown; method?: string }> = {
  decorator: 'tFallback',
  order: 150,
  async intercept(inv, options, proceed) {
    try {
      return await proceed();
    } catch (error) {
      emitSafe('runtime.fallback', { target: label(inv), error: error instanceof Error ? error.message : String(error) });
      if (options.method) {
        const fn = (inv.target as any)[options.method];
        if (typeof fn !== 'function') throw error;
        return fn.apply(inv.target, [...inv.args, error]);
      }
      if ('value' in options) return options.value;
      throw error;
    }
  }
};

// ─── tCircuitBreaker ──────────────────────────────────────────────────────────

type BreakerState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface Breaker {
  state: BreakerState;
  failures: number;
  openedAt: number;
  probes: number;
}

const breakers = keyed<Breaker>();

/** Current state of every tCircuitBreaker method that has been called. */
export function getCircuitStates(): Record<string, BreakerState> {
  const out: Record<string, BreakerState> = {};
  for (const [target, b] of breakers.map) out[target] = b.state;
  return out;
}

export const circuitBreakerInterceptor: Interceptor<{ threshold: number; resetTimeout?: number; halfOpenAttempts?: number }> = {
  decorator: 'tCircuitBreaker',
  order: 250,
  async intercept(inv, options, proceed) {
    const target = label(inv);
    const b = breakers.get(target, () => ({ state: 'CLOSED', failures: 0, openedAt: 0, probes: 0 }));
    const resetMs = options.resetTimeout ?? 30_000;
    const maxProbes = Math.max(1, options.halfOpenAttempts ?? 1);

    const move = (next: BreakerState) => {
      if (b.state === next) return;
      emitSafe('runtime.circuit', { target, from: b.state, to: next });
      b.state = next;
    };

    if (b.state === 'OPEN') {
      if (Date.now() - b.openedAt < resetMs) throw new CircuitOpenError(target);
      move('HALF_OPEN');
      b.probes = 0;
    }
    if (b.state === 'HALF_OPEN') {
      if (b.probes >= maxProbes) throw new CircuitOpenError(target);
      b.probes++;
    }

    try {
      const result = await proceed();
      b.failures = 0;
      if (b.state === 'HALF_OPEN') b.probes--;
      move('CLOSED');
      return result;
    } catch (error) {
      if (b.state === 'HALF_OPEN') {
        b.probes--;
        b.openedAt = Date.now();
        move('OPEN');
      } else if (++b.failures >= options.threshold) {
        b.openedAt = Date.now();
        move('OPEN');
      }
      throw error;
    }
  }
};

// ─── tBulkhead / tConcurrency / tMutex ────────────────────────────────────────

const bulkheads = keyed<Semaphore>();
const limits = keyed<Semaphore>();
const mutexes = keyed<Semaphore>();

export const bulkheadInterceptor: Interceptor<{ name: string; concurrency: number; queue?: number }> = {
  decorator: 'tBulkhead',
  order: 260,
  intercept(inv, options, proceed) {
    const sem = bulkheads.get(options.name, () => new Semaphore(options.concurrency, options.queue ?? 0));
    const target = label(inv);
    return withPermit(sem.acquire({ onFull: () => new CapacityExceededError(target, `bulkhead '${options.name}'`) }), proceed);
  }
};

export const concurrencyInterceptor: Interceptor<{ limit: number; strategy?: 'queue' | 'reject' | 'drop-oldest'; key?: KeySpec }> = {
  decorator: 'tConcurrency',
  order: 265,
  intercept(inv, options, proceed) {
    const target = label(inv);
    const key = options.key === undefined ? '' : resolveKey(options.key, inv) ?? '';
    const strategy = options.strategy ?? 'queue';
    const sem = limits.get(`${target}:${key}`, () =>
      new Semaphore(options.limit, strategy === 'reject' ? 0 : strategy === 'drop-oldest' ? options.limit : Infinity)
    );
    return withPermit(
      sem.acquire({
        onFull: () => new CapacityExceededError(target, 'concurrency limit'),
        dropOldest: strategy === 'drop-oldest'
      }),
      proceed
    );
  }
};

export const mutexInterceptor: Interceptor<{ key?: string }> = {
  decorator: 'tMutex',
  order: 270,
  intercept(inv, options, proceed) {
    const target = label(inv);
    const key = options.key === undefined ? '' : resolveKey(options.key, inv) ?? '';
    const sem = mutexes.get(`${target}:${key}`, () => new Semaphore(1));
    return withPermit(sem.acquire({ onFull: () => new CapacityExceededError(target, 'mutex') }), proceed);
  }
};

// ─── tLock ────────────────────────────────────────────────────────────────────

/**
 * Lock backend for tLock. The default locks within the process; supply a
 * provider backed by your database or coordination service for locks that
 * span processes and hosts.
 */
export interface LockProvider {
  /** Resolve with a release function, or reject when `waitMs` elapses. */
  acquire(key: string, options: { ttlMs: number; waitMs: number }): Promise<() => void | Promise<void>>;
}

class LocalLockProvider implements LockProvider {
  private locks = keyed<Semaphore>();

  async acquire(key: string, { ttlMs, waitMs }: { ttlMs: number; waitMs: number }): Promise<() => void> {
    const sem = this.locks.get(key, () => new Semaphore(1));
    const release = await sem.acquire({
      waitMs,
      onFull: () => new Error(`lock '${key}' unavailable`)
    });
    // Release automatically after ttl so a hung holder cannot block forever
    const timer = setTimeout(release, ttlMs);
    timer.unref?.();
    return () => {
      clearTimeout(timer);
      release();
    };
  }
}

let lockProvider: LockProvider = new LocalLockProvider();

export function setLockProvider(provider: LockProvider): void {
  lockProvider = provider;
}

export const lockInterceptor: Interceptor<{ key: KeySpec; ttl?: number; wait?: number }> = {
  decorator: 'tLock',
  order: 275,
  async intercept(inv, options, proceed) {
    const target = label(inv);
    const key = resolveKey(options.key, inv) ?? target;
    const waitMs = options.wait ?? 10_000;
    let release: () => void | Promise<void>;
    try {
      release = await lockProvider.acquire(`lock:${key}`, { ttlMs: options.ttl ?? 30_000, waitMs });
    } catch {
      throw new LockTimeoutError(target, key, waitMs);
    }
    try {
      return await proceed();
    } finally {
      await release();
    }
  }
};

// ─── tHedge ───────────────────────────────────────────────────────────────────

export const hedgeInterceptor: Interceptor<{ delay: number; maxAttempts?: number }> = {
  decorator: 'tHedge',
  order: 290,
  intercept(inv, options, proceed) {
    const max = Math.max(1, options.maxAttempts ?? 2);
    return new Promise((resolve, reject) => {
      let started = 0;
      let failed = 0;
      let settled = false;
      let timer: NodeJS.Timeout | undefined;
      let lastError: unknown;

      const launch = () => {
        started++;
        if (started > 1) emitSafe('runtime.hedge', { target: label(inv), attempt: started });
        proceed().then(
          value => {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);
            resolve(value);
          },
          error => {
            lastError = error;
            failed++;
            if (settled) return;
            if (failed === max) {
              settled = true;
              if (timer) clearTimeout(timer);
              reject(lastError);
            } else if (started < max && failed === started) {
              // Every attempt so far failed; start the next one now
              if (timer) clearTimeout(timer);
              launch();
            }
          }
        );
        if (started < max) {
          timer = setTimeout(() => { if (!settled && started < max) launch(); }, options.delay);
          timer.unref?.();
        }
      };
      launch();
    });
  }
};

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerResilienceInterceptors(): void {
  for (const interceptor of [
    rateLimitInterceptor,
    throttleInterceptor,
    debounceInterceptor,
    cacheInterceptor,
    cachePutInterceptor,
    cacheEvictInterceptor,
    cacheInvalidateInterceptor,
    dedupeInterceptor,
    fallbackInterceptor,
    circuitBreakerInterceptor,
    bulkheadInterceptor,
    concurrencyInterceptor,
    mutexInterceptor,
    lockInterceptor,
    hedgeInterceptor
  ]) {
    registerInterceptor(interceptor as Interceptor);
  }
}

/** Reset all in-process resilience state (for tests). */
export function resetResilienceState(): void {
  windows.clear();
  dedupe.clear();
  breakers.clear();
  bulkheads.clear();
  limits.clear();
  mutexes.clear();
  lockProvider = new LocalLockProvider();
  cacheStore = new MemoryCacheStore();
  counterStore = undefined;
}
