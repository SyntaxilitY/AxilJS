"use strict";
/**
 * Helmet middleware.
 * Sets security-related HTTP headers on every response.
 * Each header protects against a specific attack vector.
 *
 * No external dependencies - pure header setting.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.helmet = helmet;
const DEFAULT_CSP = [
    "default-src 'self'",
    "base-uri 'self'",
    "font-src 'self' https: data:",
    "form-action 'self'",
    "frame-ancestors 'self'",
    "img-src 'self' data: https:",
    "object-src 'none'",
    "script-src 'self'",
    "script-src-attr 'none'",
    "style-src 'self' https: 'unsafe-inline'",
    'upgrade-insecure-requests'
].join('; ');
/**
 * Create helmet security headers middleware.
 *
 * Usage:
 *   app.use(helmet())
 *   app.use(helmet({ frameOptions: 'SAMEORIGIN' }))
 */
function helmet(options = {}) {
    const { contentSecurityPolicy = true, frameOptions = 'DENY', hsts = true, noSniff = true, xssFilter = true, referrerPolicy = 'no-referrer', permissionsPolicy = true, hidePoweredBy = true } = options;
    return (req, res, next) => {
        // Remove X-Powered-By (prevents server fingerprinting)
        if (hidePoweredBy) {
            res.raw.removeHeader('X-Powered-By');
        }
        // Content-Security-Policy
        if (contentSecurityPolicy !== false) {
            const cspValue = typeof contentSecurityPolicy === 'string'
                ? contentSecurityPolicy
                : DEFAULT_CSP;
            res.header('Content-Security-Policy', cspValue);
        }
        // X-Frame-Options (clickjacking protection)
        if (frameOptions !== false) {
            res.header('X-Frame-Options', frameOptions);
        }
        // Strict-Transport-Security (HTTPS enforcement)
        if (hsts !== false) {
            const maxAge = typeof hsts === 'object' ? (hsts.maxAge ?? 15552000) : 15552000;
            const includeSubDomains = typeof hsts === 'object'
                ? (hsts.includeSubDomains ?? true)
                : true;
            const hstsValue = `max-age=${maxAge}` +
                (includeSubDomains ? '; includeSubDomains' : '');
            res.header('Strict-Transport-Security', hstsValue);
        }
        // X-Content-Type-Options (MIME sniffing protection)
        if (noSniff) {
            res.header('X-Content-Type-Options', 'nosniff');
        }
        // X-XSS-Protection (legacy XSS filter)
        if (xssFilter) {
            res.header('X-XSS-Protection', '1; mode=block');
        }
        // Referrer-Policy
        if (referrerPolicy !== false) {
            res.header('Referrer-Policy', referrerPolicy);
        }
        // Permissions-Policy (@axilrict browser APIs)
        if (permissionsPolicy) {
            res.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
        }
        next();
    };
}
//# sourceMappingURL=helmet.js.map