/**
 * Tenant-Aware Rate Limiter.
 *
 * Enforces per-tenant, per-endpoint request limits using a fixed window
 * (default) or a sliding window counter (`algorithm: 'sliding'`).
 * Works out of the box in single-instance mode;
 * swap the backing store to Redis for horizontal scaling.
 *
 * Integrates with @axiljs/cloud multi-tenancy and @axiljs/security.
 *
 * Usage:
 *   app.use(tenantRateLimiter({
 *     defaultRule: { max: 100, windowMs: 60_000 },
 *     tenantRules: { 'enterprise-corp': { max: 10000, windowMs: 60_000 } }
 *   }))
 */

import { MiddlewareFn } from '@axiljs/common';
import type { Tenant, RateLimitRule, RateLimitResult, TenantRateLimiterOptions } from './types';

export type { RateLimitRule, RateLimitResult, TenantRateLimiterOptions };

// ─── Window Stores ───────────────────────────────────────────────────────────

interface HitResult {
  /** Requests counted against the limit (estimated for 'sliding'). */
  count: number;
  /** Whether this request exceeded the limit. */
  limited: boolean;
  /** Epoch ms when the current window ends. */
  resetAt: number;
}

interface WindowStore {
  hit(key: string, max: number, windowMs: number): HitResult;
  prune(): void;
}

interface WindowEntry {
  count: number;
  resetAt: number;
}

/** Fixed window: one counter per key that resets when the window ends. */
class FixedWindowStore implements WindowStore {
  private store = new Map<string, WindowEntry>();

  hit(key: string, max: number, windowMs: number): HitResult {
    const now = Date.now();
    let entry = this.store.get(key);

    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      this.store.set(key, entry);
    }

    entry.count++;
    return { count: entry.count, limited: entry.count > max, resetAt: entry.resetAt };
  }

  /** Periodic cleanup of expired windows. */
  prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now >= entry.resetAt) this.store.delete(key);
    }
  }
}

interface SlidingEntry {
  windowStart: number;
  current: number;
  previous: number;
  windowMs: number;
}

/**
 * Sliding window counter: keeps the current and previous window counts and
 * estimates the requests in the last `windowMs` as
 *   previous * (remaining overlap of the previous window) + current.
 * Rejected requests are not counted, so a client recovers smoothly.
 */
class SlidingWindowStore implements WindowStore {
  private store = new Map<string, SlidingEntry>();

  hit(key: string, max: number, windowMs: number): HitResult {
    const now = Date.now();
    let entry = this.store.get(key);

    if (!entry || entry.windowMs !== windowMs) {
      entry = { windowStart: now, current: 0, previous: 0, windowMs };
      this.store.set(key, entry);
    } else if (now >= entry.windowStart + windowMs) {
      const elapsedWindows = Math.floor((now - entry.windowStart) / windowMs);
      entry.previous = elapsedWindows === 1 ? entry.current : 0;
      entry.current = 0;
      entry.windowStart += elapsedWindows * windowMs;
    }

    const overlap = (windowMs - (now - entry.windowStart)) / windowMs;
    const estimated = entry.previous * overlap + entry.current;
    const resetAt = entry.windowStart + windowMs;

    if (estimated + 1 > max) {
      return { count: Math.ceil(estimated) + 1, limited: true, resetAt };
    }

    entry.current++;
    return { count: Math.ceil(estimated + 1), limited: false, resetAt };
  }

  prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now >= entry.windowStart + 2 * entry.windowMs) this.store.delete(key);
    }
  }
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export function tenantRateLimiter(options: TenantRateLimiterOptions): MiddlewareFn {
  const {
    defaultRule,
    tenantRules = {},
    keyExtractor,
    algorithm = 'fixed',
  } = options;

  const store: WindowStore = algorithm === 'sliding'
    ? new SlidingWindowStore()
    : new FixedWindowStore();

  // Auto-prune every 5 minutes
  const pruneInterval = setInterval(() => store.prune(), 300_000);
  if (pruneInterval.unref) pruneInterval.unref();

  return (req: any, res: any, next: (err?: Error) => void) => {
    const tenant = req.locals?.tenant as Tenant | undefined;
    const tenantId = tenant?.id ?? 'anonymous';

    // Resolve the applicable rule
    // Own-property lookup: tenant IDs like "constructor" must not hit Object.prototype
    const rule: RateLimitRule =
      (Object.prototype.hasOwnProperty.call(tenantRules, tenantId) ? tenantRules[tenantId] : undefined)
      ?? defaultRule;

    // Build the rate-limit key
    const key = keyExtractor
      ? keyExtractor(req)
      : `${tenantId}:${req.method}:${req.path}`;

    const result = store.hit(key, rule.max, rule.windowMs);
    const remaining = Math.max(0, rule.max - result.count);

    // Set standard rate-limit headers
    if (res.raw?.setHeader) {
      res.raw.setHeader('X-RateLimit-Limit', rule.max);
      res.raw.setHeader('X-RateLimit-Remaining', remaining);
      res.raw.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));
      res.raw.setHeader('X-RateLimit-Tenant', tenantId);
    }

    if (result.limited) {
      const retryAfterMs = Math.max(0, result.resetAt - Date.now());

      if (typeof res.status === 'function' && typeof res.json === 'function') {
        res.status(429).json({
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Rate limit exceeded for tenant "${tenantId}".`,
            retryAfterMs,
          },
        });
        return;
      }

      // Any other shape: end whichever raw Node response we can find with 429.
      // Never fall through to next() for an over-limit request.
      const raw = typeof res.end === 'function' ? res : res.raw;
      if (raw && typeof raw.end === 'function') {
        const body = JSON.stringify({ error: 'Rate limit exceeded' });
        const headers = {
          'Content-Type': 'application/json',
          'Retry-After': String(Math.ceil(retryAfterMs / 1000)),
        };
        if (!raw.headersSent && typeof raw.writeHead === 'function') {
          raw.writeHead(429, headers);
        } else if (!raw.headersSent) {
          raw.statusCode = 429;
          if (typeof raw.setHeader === 'function') {
            for (const [k, v] of Object.entries(headers)) raw.setHeader(k, v);
          }
        }
        raw.end(body);
        return;
      }

      // No way to respond at all: hand a 429 error to the error pipeline
      const err = new Error(`Rate limit exceeded for tenant "${tenantId}".`) as Error & { status?: number; statusCode?: number };
      err.status = 429;
      err.statusCode = 429;
      return next(err);
    }

    next();
  };
}
