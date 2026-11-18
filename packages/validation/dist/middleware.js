"use strict";
/**
 * Validation middleware factory.
 * Validates request body, params, or query automatically.
 * Returns 422 with detailed errors if validation fails.
 *
 * Usage:
 *   import { validate, v } from '@axiljs/validation'
 *
 *   const createUserSchema = v.object({
 *     name:  v.string().min(2).max(100),
 *     email: v.string().email(),
 *     role:  v.enum(['admin', 'user']).optional()
 *   })
 *
 *   app.post('/users', validate({ body: createUserSchema }), createUser)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VALIDATION_SCHEMAS = void 0;
exports.validate = validate;
const common_1 = require("@axiljs/common");
/**
 * Well-known key under which validate() middleware exposes its schemas.
 * Symbol.for() so tools can read it without importing this package
 * (e.g. generateOpenAPI() in @axiljs/core).
 */
exports.VALIDATION_SCHEMAS = Symbol.for('axiljs.validation.schemas');
/**
 * Create validation middleware.
 * Validated data replaces the original (includes transforms like trim).
 */
function validate(options) {
    const middleware = (req, res, next) => {
        const allErrors = [];
        // Validate body
        if (options.body) {
            const result = options.body.parse(req.body);
            if (!result.success) {
                allErrors.push(...(result.errors || []).map(e => ({ ...e, source: 'body' })));
            }
            else {
                // Replace body with validated (and transformed) data
                req.body = result.data;
            }
        }
        // Validate params
        if (options.params) {
            const result = options.params.parse(req.params);
            if (!result.success) {
                allErrors.push(...(result.errors || []).map(e => ({ ...e, source: 'params' })));
            }
            else {
                req.params = result.data;
            }
        }
        // Validate query
        if (options.query) {
            const result = options.query.parse(req.query);
            if (!result.success) {
                allErrors.push(...(result.errors || []).map(e => ({ ...e, source: 'query' })));
            }
            else {
                req.query = result.data;
            }
        }
        if (allErrors.length > 0) {
            return next(new common_1.ValidationError('Request validation failed', allErrors));
        }
        next();
    };
    // Expose the schemas (behaviour unchanged): only the locations given
    const schemas = {};
    if (options.body)
        schemas.body = options.body;
    if (options.params)
        schemas.params = options.params;
    if (options.query)
        schemas.query = options.query;
    Object.freeze(schemas);
    Object.defineProperty(middleware, 'schemas', { value: schemas, enumerable: false });
    Object.defineProperty(middleware, exports.VALIDATION_SCHEMAS, { value: schemas, enumerable: false });
    return middleware;
}
//# sourceMappingURL=middleware.js.map