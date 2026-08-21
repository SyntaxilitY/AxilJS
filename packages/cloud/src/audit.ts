/**
 * Audit Logger.
 *
 * Immutable, event-driven audit trail for compliance & security.
 *
 * Key architectural difference from the original:
 *   - No `res.raw.end` monkey-patching (fragile, breaks streaming,
 *     causes double-writes with some frameworks).
 *   - Uses the Node.js `finish` / `close` lifecycle events on the
 *     underlying ServerResponse, with a guard flag to guarantee
 *     exactly-once emission per request.
 *
 * All events are emitted on the global AxilJS event bus so that
 * subscribers can persist them to Postgres, S3, WORM storage, etc.
 */

import { getGlobalEventBus } from '@axiljs/events';
import { MiddlewareFn }      from '@axiljs/common';
import type {
  AuditEvent,
  AuditMiddlewareOptions,
} from './types';

export type { AuditEvent };

// ─── auditLog ────────────────────────────────────────────────────────────────

/**
 * Emit a single auditable event on the global event bus.
 *
 * Subscribers (e.g. a database writer) listen for `'audit.log'`.
 */
export function auditLog(
  event: Omit<AuditEvent, 'timestamp'>,
  options: { logToConsole?: boolean } = {}
): void {
  const { logToConsole = true } = options;

  const full: AuditEvent = {
    ...event,
    timestamp: new Date().toISOString(),
  };

  getGlobalEventBus().emit('audit.log', full);

  if (logToConsole) {
    const icon = full.success ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
    console.log(
      `\x1b[90m[AUDIT]\x1b[0m ${full.actor.id} ${full.action} ${icon} ` +
      `(${full.timestamp})`
    );
  }
}

// ─── auditMiddleware ─────────────────────────────────────────────────────────

/**
 * HTTP middleware that automatically audits every request.
 *
 * Safe for production:
 *   • Listens to `finish` and `close` on `res.raw`.
 *   • Guard flag prevents duplicate events.
 *   • Captures request ID, tenant, actor, status, duration, user-agent.
 *
 * Usage:
 *   app.use(auditMiddleware())
 *   app.use(auditMiddleware({ logToConsole: false }))
 */
export function auditMiddleware(
  options: AuditMiddlewareOptions = {}
): MiddlewareFn {
  const { logToConsole = true } = options;

  return (req: any, res: any, next: (err?: Error) => void) => {
    const start = Date.now();
    let fired = false;

    const record = (): void => {
      if (fired) return;
      fired = true;

      const duration   = Date.now() - start;
      const statusCode = res.raw?.statusCode ?? 0;
      const user       = req.locals?.user;
      const tenant     = req.locals?.tenant;
      const requestId  = req.locals?.requestId;

      auditLog(
        {
          action: `${req.method} ${req.path}`,
          actor: user
            ? { id: user.id, type: user.type ?? 'user' }
            : { id: 'anonymous', type: 'api' },
          tenantId:  tenant?.id,
          requestId,
          metadata: {
            method:     req.method,
            path:       req.path,
            durationMs: duration,
            statusCode,
          },
          ip:        req.ip,
          userAgent: req.headers?.['user-agent'] as string | undefined,
          success:   statusCode >= 200 && statusCode < 400,
          error:     statusCode >= 400 ? `HTTP ${statusCode}` : undefined,
        },
        { logToConsole }
      );
    };

    // Attach to the underlying Node.js ServerResponse.
    // `finish` fires after the response is fully sent.
    // `close` fires if the client disconnects early.
    if (res.raw?.on) {
      res.raw.on('finish', record);
      res.raw.on('close', record);
    }

    next();
  };
}