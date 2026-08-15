/**
 * Audit Logger.
 * Immutable, event-driven audit trail for compliance and security.
 * Uses the global event bus from Phase 4.
 *
 * All actions are logged with:
 *   - Who (user ID)
 *   - What (action)
 *   - When (timestamp)
 *   - Where (tenant, IP, user agent)
 *   - Result (success/failure)
 */
import { MiddlewareFn } from '@axil/common';
export interface AuditEvent {
    action: string;
    actor: {
        id: string | number;
        type: 'user' | 'system' | 'api';
    };
    tenantId?: string;
    target?: {
        type: string;
        id: string | number;
    };
    metadata: Record<string, unknown>;
    ip?: string;
    userAgent?: string;
    success: boolean;
    error?: string;
    timestamp: string;
}
/**
 * Log an auditable event on the global event bus.
 * Subscribers can persist these to a database, S3, or WORM storage.
 */
export declare function auditLog(event: Omit<AuditEvent, 'timestamp'>): void;
/**
 * Middleware that automatically audits all HTTP requests.
 * Attach globally or per-route.
 *
 * Usage:
 *   app.use(auditMiddleware())
 */
export declare function auditMiddleware(): MiddlewareFn;
//# sourceMappingURL=audit.d.ts.map