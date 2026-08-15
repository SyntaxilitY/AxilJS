/**
 * Rate limiting middleware.
 * Limits how many requests a client can make in a time window.
 * Uses an in-memory store (distributed store comes in Phase 4).
 *
 * When limit is exceeded:
 *   - Returns 429 Too Many Requests
 *   - Sets Retry-After header
 */

import { MiddlewareFn, axilError } from '@axiljs/common';

// ─── Options ─────────────────────────────────────────────────────────────────

export interface RateLimitOptions {
  // Time window in milliseconds (default: 60000 = 1 minute)
  windowMs?: number;

  // Max requests per window per client (default: 100)
  max?: number;

  // Message sent when limit is exceeded
  message?: string;

  // Function to extract client identifier
  // Default: uses IP address
  keyGenerator?: (req: { ip: string; headers: Record<string, any> }) => string;

  // Skip rate limiting for certain requests
  // Return true to skip
  skip?: (req: { ip: string; path: string; method: string }) => boolean;

  // Include rate limit headers in response (default: true)
  // X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset
  headers?: boolean;
}

// ─── In-Memory Store ──────────────────────────────────────────────────────────

interface ClientRecord {
  // Number of requests in current window
  count: number;

  // When the current window resets (Unix timestamp ms)
  resetAt: number;
}

// Store all client records
// In Phase 4, this becomes a distributed Redis store
const store = new Map<string, ClientRecord>();

// Clean up expired records every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of store.entries()) {
    if (now > record.resetAt) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);

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

  return (req, res, next) => {
    // Allow skipping rate limit for certain requests
    if (skip?.(req)) {
      return next();
    }

    const key = keyGenerator(req);
    const now = Date.now();

    // Get or create record for this client
    let record = store.get(key);

    if (!record || now > record.resetAt) {
      // First request or window expired - start fresh window
      record = {
        count: 1,
        resetAt: now + windowMs
      };
      store.set(key, record);
    } else {
      // Increment request count
      record.count++;
    }

    const remaining = Math.max(0, max - record.count);
    const resetSeconds = Math.ceil((record.resetAt - now) / 1000);

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
}