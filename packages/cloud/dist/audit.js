"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditLog = auditLog;
exports.auditMiddleware = auditMiddleware;
const events_1 = require("@restjs/events");
// ─── auditLog ─────────────────────────────────────────────────────────────────
/**
 * Log an auditable event on the global event bus.
 * Subscribers can persist these to a database, S3, or WORM storage.
 */
function auditLog(event) {
    const fullEvent = {
        ...event,
        timestamp: new Date().toISOString()
    };
    // Emit on global event bus — any subscriber can persist it
    (0, events_1.getGlobalEventBus)().emit('audit.log', fullEvent);
    console.log(`\x1b[90m[AUDIT]\x1b[0m ${fullEvent.actor.id} ` +
        `${fullEvent.action} ` +
        `${fullEvent.success ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'}`);
}
// ─── auditMiddleware ──────────────────────────────────────────────────────────
/**
 * Middleware that automatically audits all HTTP requests.
 * Attach globally or per-route.
 *
 * Usage:
 *   app.use(auditMiddleware())
 */
function auditMiddleware() {
    return (req, res, next) => {
        const start = Date.now();
        const originalEnd = res.raw.end.bind(res.raw);
        res.raw.end = function (...args) {
            const duration = Date.now() - start;
            const user = req.locals?.user;
            const tenant = req.locals?.tenant;
            auditLog({
                action: `${req.method} ${req.path}`,
                actor: user
                    ? { id: user.id, type: 'user' }
                    : { id: 'anonymous', type: 'api' },
                tenantId: tenant?.id,
                metadata: {
                    method: req.method,
                    path: req.path,
                    durationMs: duration,
                    statusCode: res.raw.statusCode
                },
                ip: req.ip,
                userAgent: req.headers['user-agent'],
                success: res.raw.statusCode < 400,
                error: res.raw.statusCode >= 400
                    ? `HTTP ${res.raw.statusCode}`
                    : undefined
            });
            return originalEnd(...args);
        };
        next();
    };
}
//# sourceMappingURL=audit.js.map