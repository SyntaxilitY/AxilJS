"use strict";
/**
 * AxilJS Request implementation.
 * Wraps Node.js IncomingMessage and provides a clean API.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Request = void 0;
exports.safeDecode = safeDecode;
exports.resolveClientIp = resolveClientIp;
const common_1 = require("@axiljs/common");
/**
 * Decode a query-string / form-urlencoded component.
 * '+' means space; malformed %-escapes are kept as-is instead of throwing.
 * @internal
 */
function safeDecode(str) {
    const plus = str.replace(/\+/g, ' ');
    try {
        return decodeURIComponent(plus);
    }
    catch {
        return plus;
    }
}
/**
 * Derive the client address from the socket and X-Forwarded-For.
 * @internal
 */
function resolveClientIp(raw, trustProxy) {
    const socketAddr = raw.socket?.remoteAddress || '127.0.0.1';
    if (trustProxy === false)
        return socketAddr;
    const header = raw.headers['x-forwarded-for'];
    const forwarded = (Array.isArray(header) ? header.join(',') : header || '')
        .split(',')
        .map(part => part.trim())
        .filter(Boolean);
    // Historical default: trust the left-most X-Forwarded-For entry
    if (trustProxy === true)
        return forwarded[0] || socketAddr;
    // Addresses from the closest hop (the socket) outwards to the client
    const hops = [socketAddr, ...forwarded.reverse()];
    if (typeof trustProxy === 'number') {
        const n = Math.max(0, Math.floor(trustProxy));
        return hops[Math.min(n, hops.length - 1)];
    }
    if (typeof trustProxy === 'function') {
        for (let i = 0; i < hops.length - 1; i++) {
            if (!trustProxy(hops[i], i))
                return hops[i];
        }
        return hops[hops.length - 1];
    }
    return socketAddr;
}
class Request {
    raw;
    method;
    url;
    path;
    params;
    query;
    headers;
    body;
    // Unparsed request body text, set by the body parser (e.g. for webhook
    // signature verification); undefined when there was no body
    rawBody;
    ip;
    locals;
    constructor(raw, options = {}) {
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
        this.rawBody = undefined;
        // Get client IP - X-Forwarded-For is only honoured when trustProxy opts
        // in; trusting it by default would let any client spoof its address
        this.ip = resolveClientIp(raw, options.trustProxy ?? false);
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
            // Split on the first '=' only so values may contain '='
            const eqIndex = pair.indexOf('=');
            const key = safeDecode(eqIndex === -1 ? pair : pair.slice(0, eqIndex));
            const value = eqIndex === -1 ? '' : safeDecode(pair.slice(eqIndex + 1));
            if (!key)
                continue;
            // Own-property check: inherited names (constructor, toString,
            // __proto__) must not be treated as existing values
            const existing = Object.prototype.hasOwnProperty.call(result, key)
                ? result[key]
                : undefined;
            const next = existing === undefined
                ? value || ''
                : Array.isArray(existing)
                    ? [...existing, value || '']
                    : [existing, value || ''];
            // defineProperty so a "__proto__" key can't replace the prototype
            Object.defineProperty(result, key, {
                value: next,
                enumerable: true,
                writable: true,
                configurable: true
            });
        }
        return result;
    }
    /**
     * Read the raw request body as a string.
     * Called internally by body parser middleware.
     */
    async readBody(limit = 1024 * 1024) {
        return new Promise((resolve, reject) => {
            // Collect raw Buffers and decode once at the end - decoding per chunk
            // corrupts multi-byte UTF-8 characters split across chunk boundaries
            const chunks = [];
            let size = 0;
            let tooLarge = false;
            this.raw.on('data', (chunk) => {
                if (tooLarge)
                    return;
                size += chunk.length;
                // Reject if body exceeds size limit
                if (size > limit) {
                    tooLarge = true;
                    chunks.length = 0;
                    reject(new common_1.axilError(`Request body exceeds limit of ${limit} bytes`, 413, 'PAYLOAD_TOO_LARGE'));
                    return;
                }
                chunks.push(chunk);
            });
            this.raw.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
            this.raw.on('error', reject);
        });
    }
}
exports.Request = Request;
//# sourceMappingURL=request.js.map