"use strict";
/**
 * Memory Middleware for AxilJS HTTP requests.
 * Attaches memory info to requests for debugging.
 * Flags requests that trigger significant memory increases.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.memoryMiddleware = memoryMiddleware;
const snapshot_1 = require("./snapshot");
// ─── Middleware ───────────────────────────────────────────────────────────────
/**
 * Per-request memory tracking middleware.
 * Detects requests that cause significant memory increases.
 *
 * Usage:
 *   app.use(memoryMiddleware())
 */
function memoryMiddleware(options = {}) {
    const { leakThresholdMb = 50, exposeHeader = false, logFlagged = true } = options;
    return (req, res, next) => {
        const before = (0, snapshot_1.takeSnapshot)();
        const originalEnd = res.raw.end.bind(res.raw);
        res.raw.end = function (...args) {
            const after = (0, snapshot_1.takeSnapshot)();
            const heapDeltaMb = parseFloat(((after.heapUsed - before.heapUsed) / 1024 / 1024).toFixed(2));
            // Add memory header if configured
            // Headers cannot be set once sent (streamed / res.write() responses)
            if (exposeHeader && !res.raw.headersSent) {
                res.raw.setHeader('X-Memory-Usage', `${after.heapUsedMb}MB`);
                if (heapDeltaMb > 0) {
                    res.raw.setHeader('X-Memory-Delta', `+${heapDeltaMb}MB`);
                }
            }
            // Flag suspicious memory increase
            if (heapDeltaMb > leakThresholdMb && logFlagged) {
                console.warn(`\x1b[33m[AxilJS Memory]\x1b[0m ` +
                    `Request caused +${heapDeltaMb}MB heap increase: ` +
                    `${req.method} ${req.path} ` +
                    `\x1b[90m(threshold: ${leakThresholdMb}MB)\x1b[0m`);
            }
            return originalEnd(...args);
        };
        next();
    };
}
//# sourceMappingURL=middleware.js.map