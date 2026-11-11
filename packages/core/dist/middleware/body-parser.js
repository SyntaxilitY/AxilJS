"use strict";
/**
 * Built-in body parser middleware.
 * Reads the request body and parses it based on Content-Type.
 *
 * Supports:
 *   application/json          → parses JSON
 *   application/x-www-form-urlencoded → parses form data
 *   text/plain                → raw string
 *
 * The unparsed text is always kept as req.rawBody (and req.locals.rawBody).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.bodyParser = bodyParser;
const common_1 = require("@axiljs/common");
const request_1 = require("../http/request");
/**
 * Create body parser middleware.
 *
 * @param limit Maximum body size in bytes (default: 1MB)
 */
function bodyParser(limit = 1024 * 1024) {
    return async (req, res, next) => {
        // Skip body parsing for methods that shouldn't have a body
        if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
            return next();
        }
        try {
            // Read raw body from the request stream
            const rawBody = await req.readBody(limit);
            if (!rawBody) {
                // No body - that's fine
                return next();
            }
            // Keep the exact body text (webhook signatures are computed over it).
            // req.rawBody is on core's Request; locals.rawBody serves code typed
            // against the axilRequest interface.
            req.rawBody = rawBody;
            req.locals.rawBody = rawBody;
            // Media types are case-insensitive (RFC 9110 §8.3.1)
            const contentType = (req.headers['content-type'] || '').toLowerCase();
            if (contentType.includes('application/json')) {
                // Parse JSON body
                try {
                    req.body = JSON.parse(rawBody);
                }
                catch {
                    throw new common_1.BadRequestError('Invalid JSON body');
                }
            }
            else if (contentType.includes('application/x-www-form-urlencoded')) {
                // Parse URL-encoded form data
                req.body = parseFormData(rawBody);
            }
            else {
                // Unknown content type - store as raw string
                req.body = rawBody;
            }
            next();
        }
        catch (error) {
            next(error instanceof Error ? error : new Error(String(error)));
        }
    };
}
/**
 * Parse URL-encoded form data string into an object.
 * "name=John&age=30" → { name: 'John', age: '30' }
 */
function parseFormData(data) {
    const result = {};
    data.split('&').forEach(pair => {
        // Split on first '=' only; '+' is a space; malformed escapes don't throw
        const eqIndex = pair.indexOf('=');
        const key = (0, request_1.safeDecode)(eqIndex === -1 ? pair : pair.slice(0, eqIndex));
        const value = eqIndex === -1 ? '' : (0, request_1.safeDecode)(pair.slice(eqIndex + 1));
        if (key) {
            // defineProperty so a "__proto__" key can't replace the prototype
            Object.defineProperty(result, key, {
                value: value || '',
                enumerable: true,
                writable: true,
                configurable: true
            });
        }
    });
    return result;
}
//# sourceMappingURL=body-parser.js.map