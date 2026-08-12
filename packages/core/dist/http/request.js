"use strict";
/**
 * REstJS Request implementation.
 * Wraps Node.js IncomingMessage and provides a clean API.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Request = void 0;
class Request {
    raw;
    method;
    url;
    path;
    params;
    query;
    headers;
    body;
    ip;
    locals;
    constructor(raw) {
        this.raw = raw;
        // Normalize method to uppercase
        this.method = (raw.method || 'GET').toUpperCase();
        // Full URL including query string
        this.url = raw.url || '/';
        // Parse path and query string from URL
        const urlParts = this.url.split('?');
        this.path = urlParts[0];
        this.query = this.parseQuery(urlParts[1] || '');
        // Headers from raw request
        this.headers = raw.headers;
        // Route params are populated by the router when a route matches
        this.params = {};
        // Body is populated by body parser middleware
        this.body = null;
        // Get client IP - check proxy headers first
        this.ip =
            raw.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                raw.socket?.remoteAddress ||
                '127.0.0.1';
        // Empty locals store for middleware to populate
        this.locals = {};
    }
    /**
     * Parse query string into key-value object.
     * Handles arrays: ?tag=js&tag=ts → { tag: ['js', 'ts'] }
     */
    parseQuery(queryString) {
        if (!queryString)
            return {};
        const result = {};
        const pairs = queryString.split('&');
        for (const pair of pairs) {
            const [key, value] = pair.split('=').map(decodeURIComponent);
            if (!key)
                continue;
            const existing = result[key];
            if (existing !== undefined) {
                // Already exists - convert to array or append
                result[key] = Array.isArray(existing)
                    ? [...existing, value || '']
                    : [existing, value || ''];
            }
            else {
                result[key] = value || '';
            }
        }
        return result;
    }
    /**
     * Read the raw request body as a string.
     * Called internally by body parser middleware.
     */
    async readBody(limit = 1024 * 1024) {
        return new Promise((resolve, reject) => {
            let body = '';
            let size = 0;
            this.raw.on('data', (chunk) => {
                size += chunk.length;
                // Reject if body exceeds size limit
                if (size > limit) {
                    reject(new Error(`Request body exceeds limit of ${limit} bytes`));
                    return;
                }
                body += chunk.toString();
            });
            this.raw.on('end', () => resolve(body));
            this.raw.on('error', reject);
        });
    }
}
exports.Request = Request;
//# sourceMappingURL=request.js.map