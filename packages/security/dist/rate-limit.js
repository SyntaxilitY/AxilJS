"use strict";
/**
 * Rate limiting middleware.
 * Limits how many requests a client can make in a time window.
 * Uses an in-memory store (distributed store comes in Phase 4).
 *
 * When limit is exceeded:
 *   - Returns 429 Too Many Requests
 *   - Sets Retry-After header
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TooManyRequestsError = exports.MemoryStore = void 0;
exports.rateLimit = rateLimit;
const common_1 = require("@axiljs/common");
// One store per rateLimit() instance, so limiters with different
// windows/limits don't share (and corrupt) each other's counters.
// In Phase 4, this becomes a distributed Redis store
const stores = new Set();
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
class MemoryStore {
    records = new Map();
    constructor() {
        // Swept by the shared cleanup timer above
        stores.add(this.records);
    }
    increment(key, windowMs) {
        const now = Date.now();
        let record = this.records.get(key);
        if (!record || now > record.resetAt) {
            // First request or window expired - start fresh window
            record = { count: 1, resetAt: now + windowMs };
            this.records.set(key, record);
        }
        else {
            // Increment request count
            record.count++;
        }
        return { count: record.count, resetAt: record.resetAt };
    }
    reset(key) {
        this.records.delete(key);
    }
    /** Drop every record and stop tracking this store in the cleanup timer. */
    shutdown() {
        this.records.clear();
        stores.delete(this.records);
    }
}
exports.MemoryStore = MemoryStore;
// ─── Rate Limit Error ─────────────────────────────────────────────────────────
class TooManyRequestsError extends common_1.axilError {
    constructor(message = 'Too many requests, please try again later') {
        super(message, 429, 'RATE_LIMIT_EXCEEDED');
        this.name = 'TooManyRequestsError';
    }
}
exports.TooManyRequestsError = TooManyRequestsError;
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
function rateLimit(options = {}) {
    const { windowMs = 60 * 1000, max = 100, message = 'Too many requests, please try again later', keyGenerator = (req) => req.ip, skip, headers = true } = options;
    const store = options.store ?? new MemoryStore();
    return (req, res, next) => {
        // Allow skipping rate limit for certain requests
        if (skip?.(req)) {
            return next();
        }
        const key = keyGenerator(req);
        const apply = (record) => {
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
        let result;
        try {
            result = store.increment(key, windowMs);
        }
        catch (error) {
            return next(error instanceof Error ? error : new Error(String(error)));
        }
        // Synchronous stores (the default MemoryStore) stay synchronous
        if (result && typeof result.then === 'function') {
            return result.then(apply, error => next(error instanceof Error ? error : new Error(String(error))));
        }
        apply(result);
    };
}
//# sourceMappingURL=rate-limit.js.map