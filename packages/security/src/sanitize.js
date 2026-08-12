"use strict";
/**
 * Input sanitization utilities.
 * Prevents XSS by escaping HTML in user input.
 * Prevents SQL injection patterns from reaching the database.
 *
 * Note: SQL injection protection is primarily the ORM's job (Phase 3).
 * This is a defense-in-depth layer.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.escapeHtml = escapeHtml;
exports.sanitizeObject = sanitizeObject;
exports.sanitize = sanitize;
// ─── HTML Escaping ────────────────────────────────────────────────────────────
// Characters that have special meaning in HTML
const HTML_ESCAPE_MAP = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;'
};
/**
 * Escape HTML special characters in a string.
 * Use when outputting user input into HTML.
 */
function escapeHtml(str) {
    return str.replace(/[&<>"'/]/g, char => HTML_ESCAPE_MAP[char] || char);
}
/**
 * Recursively sanitize all string values in an object.
 * Applied to request body by the sanitize middleware.
 */
function sanitizeObject(obj) {
    if (typeof obj === 'string') {
        return escapeHtml(obj);
    }
    if (Array.isArray(obj)) {
        return obj.map(sanitizeObject);
    }
    if (obj !== null && typeof obj === 'object') {
        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
            sanitized[key] = sanitizeObject(value);
        }
        return sanitized;
    }
    // Numbers, booleans, null, undefined - return as-is
    return obj;
}
/**
 * Create sanitization middleware.
 * Escapes HTML in request data to prevent XSS.
 *
 * Usage:
 *   app.use(sanitize())
 *   app.use(sanitize({ body: true, query: true, params: false }))
 */
function sanitize(options = {}) {
    const { body: sanitizeBody = true, query: sanitizeQuery = true, params: sanitizeParams = false } = options;
    return (req, _res, next) => {
        // Sanitize request body
        if (sanitizeBody && req.body) {
            req.body = sanitizeObject(req.body);
        }
        // Sanitize query params
        if (sanitizeQuery && req.query) {
            for (const key of Object.keys(req.query)) {
                const value = req.query[key];
                if (typeof value === 'string') {
                    req.query[key] = escapeHtml(value);
                }
                else if (Array.isArray(value)) {
                    req.query[key] = value.map(v => typeof v === 'string' ? escapeHtml(v) : v);
                }
            }
        }
        // Sanitize route params
        if (sanitizeParams && req.params) {
            for (const key of Object.keys(req.params)) {
                req.params[key] = escapeHtml(req.params[key]);
            }
        }
        next();
    };
}
//# sourceMappingURL=sanitize.js.map