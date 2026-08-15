/**
 * Memory Middleware for @axilJS HTTP requests.
 * Attaches memory info to requests for debugging.
 * Flags requests that trigger significant memory increases.
 */

import { MiddlewareFn } from '@axil/common';
import { takeSnapshot } from './snapshot';

// ─── Options ─────────────────────────────────────────────────────────────────

export interface MemoryMiddlewareOptions {
  // Flag requests that increase heap by more than this (MB) (default: 50)
  leakThresholdMb?: number;

  // Add X-Memory-Usage header to responses (default: false)
  exposeHeader?: boolean;

  // Log flagged requests (default: true)
  logFlagged?: boolean;
}

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * Per-request memory tracking middleware.
 * Detects requests that cause significant memory increases.
 *
 * Usage:
 *   app.use(memoryMiddleware())
 */
export function memoryMiddleware(
  options: MemoryMiddlewareOptions = {}
): MiddlewareFn {
  const {
    leakThresholdMb = 50,
    exposeHeader    = false,
    logFlagged      = true
  } = options;

  return (req, res, next) => {
    const before      = takeSnapshot();
    const originalEnd = (res.raw as any).end.bind(res.raw);

    (res.raw as any).end = function (...args: any[]) {
      const after       = takeSnapshot();
      const heapDeltaMb = parseFloat(
        ((after.heapUsed - before.heapUsed) / 1024 / 1024).toFixed(2)
      );

      // Add memory header if configured
      if (exposeHeader) {
        res.raw.setHeader(
          'X-Memory-Usage',
          `${after.heapUsedMb}MB`
        );

        if (heapDeltaMb > 0) {
          res.raw.setHeader(
            'X-Memory-Delta',
            `+${heapDeltaMb}MB`
          );
        }
      }

      // Flag suspicious memory increase
      if (heapDeltaMb > leakThresholdMb && logFlagged) {
        console.warn(
          `\x1b[33m[@axilJS Memory]\x1b[0m ` +
          `Request caused +${heapDeltaMb}MB heap increase: ` +
          `${req.method} ${req.path} ` +
          `\x1b[90m(threshold: ${leakThresholdMb}MB)\x1b[0m`
        );
      }

      return originalEnd(...args);
    };

    next();
  };
}