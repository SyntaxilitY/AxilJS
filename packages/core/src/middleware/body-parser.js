"use strict";
/**
 * Built-in body parser middleware.
 * Reads the request body and parses it based on Content-Type.
 *
 * Supports:
 *   application/json          → parses JSON
 *   application/x-www-form-urlencoded → parses form data
 *   text/plain                → raw string
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.bodyParser = bodyParser;
const common_1 = require("@axiljs/common");
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
            const contentType = req.headers['content-type'] || '';
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
        const [key, value] = pair.split('=').map(decodeURIComponent);
        if (key)
            result[key] = value || '';
    });
    return result;
}
//# sourceMappingURL=body-parser.js.map