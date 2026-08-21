/**
 * Correlation ID Middleware.
 *
 * Assigns a unique request ID to every incoming request and
 * propagates a correlation ID across service boundaries.
 *
 * Both IDs are attached to `req.locals` and injected into
 * response headers for downstream tracing.
 *
 * Integrates with @axiljs/observability Tracer.
 *
 * Usage:
 *   app.use(correlationId())
 *   // req.locals.requestId    → 'req_a1b2c3d4'
 *   // req.locals.correlationId → 'corr_x9y8z7w6'
 */

import { randomBytes } from 'crypto';
import { MiddlewareFn } from '@axiljs/common';
import type { CorrelationOptions } from './types';

export type { CorrelationOptions };

function generateId(prefix: string): string {
  return `${prefix}_${randomBytes(8).toString('hex')}`;
}

export function correlationId(options: CorrelationOptions = {}): MiddlewareFn {
  const {
    headerName = 'x-correlation-id',
    requestIdHeader = 'x-request-id',
    generateIfMissing = true,
  } = options;

  return (req: any, res: any, next: (err?: Error) => void) => {
    if (!req.locals) req.locals = {};

    // Request ID — always unique per request
    const reqId = req.headers[requestIdHeader] as string
      ?? (generateIfMissing ? generateId('req') : undefined);

    // Correlation ID — shared across a chain of service calls
    const corrId = req.headers[headerName] as string
      ?? (generateIfMissing ? generateId('corr') : undefined);

    if (reqId) req.locals.requestId = reqId;
    if (corrId) req.locals.correlationId = corrId;

    // Echo back in response headers
    if (res.raw?.setHeader) {
      if (reqId) res.raw.setHeader(requestIdHeader, reqId);
      if (corrId) res.raw.setHeader(headerName, corrId);
    }

    next();
  };
}