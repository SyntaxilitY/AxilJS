"use strict";
/**
 * Built-in request logger middleware.
 * Logs each request with method, path, status, and duration.
 *
 * Output example:
 *   [AxilJS] GET /users/123 → 200 OK  4ms
 *   [AxilJS] POST /users   → 201 Created  12ms
 *   [AxilJS] GET /missing  → 404 Not Found  1ms
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestLogger = requestLogger;
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
function methodColor(method) {
    const map = {
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
function statusColor(code) {
    if (code < 300)
        return colors.green;
    if (code < 400)
        return colors.cyan;
    if (code < 500)
        return colors.yellow;
    return colors.red;
}
/**
 * Format duration in human-readable form.
 */
function formatDuration(ms) {
    if (ms < 1000)
        return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
}
/**
 * Create request logger middleware.
 * Pass `false` to disable (useful in tests).
 */
function requestLogger(enabled = true) {
    return (req, res, next) => {
        if (!enabled)
            return next();
        const start = Date.now();
        const { method, path } = req;
        // Log after response is sent by intercepting res.raw.end
        const originalEnd = res.raw.end.bind(res.raw);
        // Override end to log after response is sent
        res.raw.end = function (...args) {
            const duration = Date.now() - start;
            const status = res.raw.statusCode;
            const mColor = methodColor(method);
            const sColor = statusColor(status);
            console.log(`${colors.gray}[AxilJS]${colors.reset} ` +
                `${mColor}${colors.bold}${method.padEnd(7)}${colors.reset} ` +
                `${path.padEnd(30)} ` +
                `${sColor}→ ${status}${colors.reset} ` +
                `${colors.gray}${formatDuration(duration)}${colors.reset}`);
            return originalEnd(...args);
        };
        next();
    };
}
//# sourceMappingURL=logger.js.map