/**
 * Rate limiting middleware.
 * Limits how many requests a client can make in a time window.
 * Uses an in-memory store (distributed store comes in Phase 4).
 *
 * When limit is exceeded:
 *   - Returns 429 Too Many Requests
 *   - Sets Retry-After header
 */

import { MiddlewareFn, axilError, axilRequest } from '@axiljs/common';

// ─── Options ─────────────────────────────────────────────────────────────────

export interface RateLimitOptions {
  // Time window in milliseconds (default: 60000 = 1 minute)
  windowMs?: number;

  // Max requests per window per client (default: 100)
  max?: number;

  // Message sent when limit is exceeded
  message?: string;

  // Function to extract client identifier. Receives the full request
  // (ip, headers, params, path, method, locals, ...), e.g. to limit per
  // route param: keyGenerator: req => `webhook:${req.params.source}`
  // Default: uses IP address
  keyGenerator?: (req: axilRequest) => string;

  // Skip rate limiting for certain requests (receives the full request)
  // Return true to skip
  skip?: (req: axilRequest) => boolean;

  // Include rate limit headers in response (default: true)
  // X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
  headers?: boolean;

  // Where hit counts live (default: a new MemoryStore per rateLimit() call).
  // Plug in a shared store (Redis, database, ...) for multi-instance apps.
  store?: RateLimitStore;
}

// ─── Store Interface ──────────────────────────────────────────────────────────

export interface RateLimitRecord {
  // Number of requests in the current window (including this one)
  count: number;

  // When the current window resets (Unix timestamp ms)
  resetAt: number;
}

export interface RateLimitStore {
  // Count a hit for key; start a new window of windowMs if none is active
  increment(
    key: string,
    windowMs: number
  ): Promise<RateLimitRecord> | RateLimitRecord;

  // Forget a key (e.g. after a successful login)
  reset(key: string): Promise<void> | void;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

type ClientRecord = RateLimitRecord;

// One store per rateLimit() instance, so limiters with different
// windows/limits don't share (and corrupt) each other's counters.
// In Phase 4, this becomes a distributed Redis store
const stores = new Set<Map<string, ClientRecord>>();

// Clean up expired records every 5 minutes to prevent memory leaks.
// unref() so this timer never keeps the process alive on its own.
setInterval(() => {
  const now = Date.now();
  for (const store of stores) {
    for (const [key, record] of store.entries()) {
      if (now > record.resetAt) {
        store.delete(key);
      }
    }
  }
}, 5 * 60 * 1000).unref();

/**
 * Default in-process store. Counts are per process - use a shared store
 * when running several instances behind a load balancer.
 */
export class MemoryStore implements RateLimitStore {
  private records = new Map<string, ClientRecord>();

  constructor() {
    // Swept by the shared cleanup timer above
    stores.add(this.records);
  }

  increment(key: string, windowMs: number): RateLimitRecord {
    const now = Date.now();
    let record = this.records.get(key);

    if (!record || now > record.resetAt) {
      // First request or window expired - start fresh window
      record = { count: 1, resetAt: now + windowMs };
      this.records.set(key, record);
    } else {
      // Increment request count
      record.count++;
    }

    return { count: record.count, resetAt: record.resetAt };
  }

  reset(key: string): void {
    this.records.delete(key);
  }

  /** Drop every record and stop tracking this store in the cleanup timer. */
  shutdown(): void {
    this.records.clear();
    stores.delete(this.records);
  }
}

// ─── Rate Limit Error ─────────────────────────────────────────────────────────

export class TooManyRequestsError extends axilError {
  constructor(message = 'Too many requests, please try again later') {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
    this.name = 'TooManyRequestsError';
  }
}

// ─── Middleware Factory ───────────────────────────────────────────────────────

/**
 * Create rate limiting middleware.
 *
 * Usage:
 *   app.use(rateLimit())
 *   app.use(rateLimit({ windowMs: 60000, max: 50 }))
 *
 *   // Stricter limits on specific routes
 *   app.post('/auth/login', rateLimit({ max: 5, windowMs: 900000 }), handler)
 */
export function rateLimit(options: RateLimitOptions = {}): MiddlewareFn {
  const {
    windowMs = 60 * 1000,
    max = 100,
    message = 'Too many requests, please try again later',
    keyGenerator = (req) => req.ip,
    skip,
    headers = true
  } = options;

  const store: RateLimitStore = options.store ?? new MemoryStore();

  return (req, res, next) => {
    // Allow skipping rate limit for certain requests
    if (skip?.(req)) {
      return next();
    }

    const key = keyGenerator(req);

    const apply = (record: RateLimitRecord): void => {
      const now = Date.now();
      const remaining = Math.max(0, max - record.count);
      const resetSeconds = Math.max(0, Math.ceil((record.resetAt - now) / 1000));

      // Set rate limit headers
      if (headers) {
        res.header('X-RateLimit-Limit', String(max));
        res.header('X-RateLimit-Remaining', String(remaining));
        res.header('X-RateLimit-Reset', String(record.resetAt));
      }

      // Check if limit exceeded
      if (record.count > max) {
        res.header('Retry-After', String(resetSeconds));
        return next(new TooManyRequestsError(message));
      }

      next();
    };

    let result: Promise<RateLimitRecord> | RateLimitRecord;
    try {
      result = store.increment(key, windowMs);
    } catch (error) {
      return next(error instanceof Error ? error : new Error(String(error)));
    }

    // Synchronous stores (the default MemoryStore) stay synchronous
    if (result && typeof (result as Promise<RateLimitRecord>).then === 'function') {
      return (result as Promise<RateLimitRecord>).then(apply, error =>
        next(error instanceof Error ? error : new Error(String(error)))
      );
    }

    apply(result as RateLimitRecord);
  };
}
