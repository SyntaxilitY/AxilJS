/**
 * Memory Middleware for REstJS HTTP requests.
 * Attaches memory info to requests for debugging.
 * Flags requests that trigger significant memory increases.
 */
import { MiddlewareFn } from '@restjs/common';
export interface MemoryMiddlewareOptions {
    leakThresholdMb?: number;
    exposeHeader?: boolean;
    logFlagged?: boolean;
}
/**
 * Per-request memory tracking middleware.
 * Detects requests that cause significant memory increases.
 *
 * Usage:
 *   app.use(memoryMiddleware())
 */
export declare function memoryMiddleware(options?: MemoryMiddlewareOptions): MiddlewareFn;
//# sourceMappingURL=middleware.d.ts.map