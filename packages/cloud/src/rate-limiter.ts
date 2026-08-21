/**
 * Tenant-Aware Rate Limiter.
 *
 * Enforces per-tenant, per-endpoint request limits using a sliding
 * window counter.  Works out of the box in single-instance mode;
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

// ─── Sliding Window Store ────────────────────────────────────────────────────

interface WindowEntry {
  count: number;
  resetAt: number;
}

class SlidingWindowStore {
  private store = new Map<string, WindowEntry>();

  hit(key: string, windowMs: number): WindowEntry {
    const now = Date.now();
    let entry = this.store.get(key);

    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      this.store.set(key, entry);
    }

    entry.count++;
    return entry;
  }

  get(key: string): WindowEntry | undefined {
    const entry = this.store.get(key);
    if (entry && Date.now() >= entry.resetAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry;
  }

  /** Periodic cleanup of expired windows. */
  prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now >= entry.resetAt) this.store.delete(key);
    }
  }
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export function tenantRateLimiter(options: TenantRateLimiterOptions): MiddlewareFn {
  const {
    defaultRule,
    tenantRules = {},
    keyExtractor,
  } = options;

  const store = new SlidingWindowStore();

  // Auto-prune every 5 minutes
  const pruneInterval = setInterval(() => store.prune(), 300_000);
  if (pruneInterval.unref) pruneInterval.unref();

  return (req: any, res: any, next: (err?: Error) => void) => {
    const tenant = req.locals?.tenant as Tenant | undefined;
    const tenantId = tenant?.id ?? 'anonymous';

    // Resolve the applicable rule
    const rule: RateLimitRule = tenantRules[tenantId] ?? defaultRule;

    // Build the rate-limit key
    const key = keyExtractor
      ? keyExtractor(req)
      : `${tenantId}:${req.method}:${req.path}`;

    const entry = store.hit(key, rule.windowMs);
    const remaining = Math.max(0, rule.max - entry.count);

    // Set standard rate-limit headers
    if (res.raw?.setHeader) {
      res.raw.setHeader('X-RateLimit-Limit', rule.max);
      res.raw.setHeader('X-RateLimit-Remaining', remaining);
      res.raw.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000));
      res.raw.setHeader('X-RateLimit-Tenant', tenantId);
    }

    if (entry.count > rule.max) {
      if (res.status && res.json) {
        res.status(429).json({
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Rate limit exceeded for tenant "${tenantId}".`,
            retryAfterMs: entry.resetAt - Date.now(),
          },
        });
        return;
      }
      // Fallback for raw Node responses
      if (res.writeHead) {
        res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': Math.ceil((entry.resetAt - Date.now()) / 1000) });
        res.end(JSON.stringify({ error: 'Rate limit exceeded' }));
        return;
      }
    }

    next();
  };
}