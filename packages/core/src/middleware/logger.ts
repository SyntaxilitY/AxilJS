/**
 * Built-in request logger middleware.
 * Logs each request with method, path, status, and duration.
 *
 * Output example:
 *   [@axiljsJS] GET /users/123 → 200 OK  4ms
 *   [@axiljsJS] POST /users   → 201 Created  12ms
 *   [@axiljsJS] GET /missing  → 404 Not Found  1ms
 */

import { MiddlewareFn } from '@axiljs/common';

// ANSI color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bold: '\x1b[1m'
};

/**
 * Get color for HTTP method.
 */
function methodColor(method: string): string {
  const map: Record<string, string> = {
    GET: colors.green,
    POST: colors.cyan,
    PUT: colors.yellow,
    PATCH: colors.yellow,
    DELETE: colors.red,
    OPTIONS: colors.gray,
    HEAD: colors.gray
  };
  return map[method] || colors.reset;
}

/**
 * Get color for HTTP status code.
 */
function statusColor(code: number): string {
  if (code < 300) return colors.green;
  if (code < 400) return colors.cyan;
  if (code < 500) return colors.yellow;
  return colors.red;
}

/**
 * Format duration in human-readable form.
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Create request logger middleware.
 * Pass `false` to disable (useful in tests).
 */
export function requestLogger(enabled: boolean = true): MiddlewareFn {
  return (req, res, next) => {
    if (!enabled) return next();

    const start = Date.now();
    const { method, path } = req;

    // Log after response is sent by intercepting res.raw.end
    const originalEnd = res.raw.end.bind(res.raw);

    // Override end to log after response is sent
    (res.raw as any).end = function (...args: any[]) {
      const duration = Date.now() - start;
      const status = res.raw.statusCode;

      const mColor = methodColor(method);
      const sColor = statusColor(status);

      console.log(
        `${colors.gray}[@axiljsJS]${colors.reset} ` +
          `${mColor}${colors.bold}${method.padEnd(7)}${colors.reset} ` +
          `${path.padEnd(30)} ` +
          `${sColor}→ ${status}${colors.reset} ` +
          `${colors.gray}${formatDuration(duration)}${colors.reset}`
      );

      return originalEnd(...args);
    };

    next();
  };
}