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
import { MiddlewareFn } from '@axiljs/common';
import type { AuditEvent, AuditMiddlewareOptions } from './types';
export type { AuditEvent };
/**
 * Emit a single auditable event on the global event bus.
 *
 * Subscribers (e.g. a database writer) listen for `'audit.log'`.
 */
export declare function auditLog(event: Omit<AuditEvent, 'timestamp'>, options?: {
    logToConsole?: boolean;
}): void;
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
export declare function auditMiddleware(options?: AuditMiddlewareOptions): MiddlewareFn;
//# sourceMappingURL=audit.d.ts.map