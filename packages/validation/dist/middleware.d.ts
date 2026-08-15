/**
 * Validation middleware factory.
 * Validates request body, params, or query automatically.
 * Returns 422 with detailed errors if validation fails.
 *
 * Usage:
 *   import { validate, v } from '@axil/validation'
 *
 *   const createUserSchema = v.object({
 *     name:  v.string().min(2).max(100),
 *     email: v.string().email(),
 *     role:  v.enum(['admin', 'user']).optional()
 *   })
 *
 *   app.post('/users', validate({ body: createUserSchema }), createUser)
 */
import { MiddlewareFn } from '@axil/common';
import { BaseValidator } from './schema';
interface ValidateOptions {
    body?: BaseValidator<any>;
    params?: BaseValidator<any>;
    query?: BaseValidator<any>;
}
/**
 * Create validation middleware.
 * Validated data replaces the original (includes transforms like trim).
 */
export declare function validate(options: ValidateOptions): MiddlewareFn;
export {};
//# sourceMappingURL=middleware.d.ts.map