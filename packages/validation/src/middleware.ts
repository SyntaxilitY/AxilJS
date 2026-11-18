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

import { MiddlewareFn, ValidationError } from '@axiljs/common';
import { BaseValidator } from './schema';

// ─── Validate Options ─────────────────────────────────────────────────────────

export interface ValidateOptions {
  // Validate request body
  body?: BaseValidator<any>;

  // Validate route params
  params?: BaseValidator<any>;

  // Validate query string
  query?: BaseValidator<any>;
}

/** The schemas a validate() middleware checks (only the ones given). */
export type ValidationSchemas = Readonly<ValidateOptions>;

/**
 * Well-known key under which validate() middleware exposes its schemas.
 * Symbol.for() so tools can read it without importing this package
 * (e.g. generateOpenAPI() in @axiljs/core).
 */
export const VALIDATION_SCHEMAS: unique symbol = Symbol.for('axiljs.validation.schemas');

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
export function validate(options: ValidateOptions): ValidatedMiddleware {
  const middleware: MiddlewareFn = (req, res, next) => {
    const allErrors: any[] = [];

    // Validate body
    if (options.body) {
      const result = options.body.parse(req.body);
      if (!result.success) {
        allErrors.push(
          ...(result.errors || []).map(e => ({ ...e, source: 'body' }))
        );
      } else {
        // Replace body with validated (and transformed) data
        req.body = result.data;
      }
    }

    // Validate params
    if (options.params) {
      const result = options.params.parse(req.params);
      if (!result.success) {
        allErrors.push(
          ...(result.errors || []).map(e => ({ ...e, source: 'params' }))
        );
      } else {
        req.params = result.data;
      }
    }

    // Validate query
    if (options.query) {
      const result = options.query.parse(req.query);
      if (!result.success) {
        allErrors.push(
          ...(result.errors || []).map(e => ({ ...e, source: 'query' }))
        );
      } else {
        req.query = result.data;
      }
    }

    if (allErrors.length > 0) {
      return next(
        new ValidationError('Request validation failed', allErrors)
      );
    }

    next();
  };

  // Expose the schemas (behaviour unchanged): only the locations given
  const schemas: ValidateOptions = {};
  if (options.body) schemas.body = options.body;
  if (options.params) schemas.params = options.params;
  if (options.query) schemas.query = options.query;
  Object.freeze(schemas);

  Object.defineProperty(middleware, 'schemas', { value: schemas, enumerable: false });
  Object.defineProperty(middleware, VALIDATION_SCHEMAS, { value: schemas, enumerable: false });

  return middleware as ValidatedMiddleware;
}
