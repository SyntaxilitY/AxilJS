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
export interface RateLimitOptions {
    windowMs?: number;
    max?: number;
    message?: string;
    keyGenerator?: (req: {
        ip: string;
        headers: Record<string, any>;
    }) => string;
    skip?: (req: {
        ip: string;
        path: string;
        method: string;
    }) => boolean;
    headers?: boolean;
}
export declare class TooManyRequestsError extends axilError {
    constructor(message?: string);
}
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
export declare function rateLimit(options?: RateLimitOptions): MiddlewareFn;
//# sourceMappingURL=rate-limit.d.ts.map