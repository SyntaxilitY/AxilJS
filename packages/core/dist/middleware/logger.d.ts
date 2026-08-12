/**
 * Built-in request logger middleware.
 * Logs each request with method, path, status, and duration.
 *
 * Output example:
 *   [REstJS] GET /users/123 → 200 OK  4ms
 *   [REstJS] POST /users   → 201 Created  12ms
 *   [REstJS] GET /missing  → 404 Not Found  1ms
 */
import { MiddlewareFn } from '@restjs/common';
/**
 * Create request logger middleware.
 * Pass `false` to disable (useful in tests).
 */
export declare function requestLogger(enabled?: boolean): MiddlewareFn;
//# sourceMappingURL=logger.d.ts.map