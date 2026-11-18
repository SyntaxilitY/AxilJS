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
import { MiddlewareFn } from '@axiljs/common';
import { BaseValidator } from './schema';
export interface ValidateOptions {
    body?: BaseValidator<any>;
    params?: BaseValidator<any>;
    query?: BaseValidator<any>;
}
/** The schemas a validate() middleware checks (only the ones given). */
export type ValidationSchemas = Readonly<ValidateOptions>;
/**
 * Well-known key under which validate() middleware exposes its schemas.
 * Symbol.for() so tools can read it without importing this package
 * (e.g. generateOpenAPI() in @axiljs/core).
 */
export declare const VALIDATION_SCHEMAS: unique symbol;
/**
 * Middleware returned by validate(). Besides being a MiddlewareFn it
 * carries the schemas it validates, for introspection / documentation:
 *
 *   const mw = validate({ body: createUser })
 *   mw.schemas.body                 // createUser
 *   mw[Symbol.for('axiljs.validation.schemas')].body   // same object
 *   mw.schemas.body?.toJSONSchema() // JSON Schema 2020-12
 *
 * Both properties are read-only, non-enumerable and frozen.
 */
export type ValidatedMiddleware = MiddlewareFn & {
    readonly schemas: ValidationSchemas;
    readonly [VALIDATION_SCHEMAS]: ValidationSchemas;
};
/**
 * Create validation middleware.
 * Validated data replaces the original (includes transforms like trim).
 */
export declare function validate(options: ValidateOptions): ValidatedMiddleware;
//# sourceMappingURL=middleware.d.ts.map