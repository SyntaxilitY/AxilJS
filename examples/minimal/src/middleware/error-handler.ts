/**
 * Error handler: turns thrown errors into one JSON shape.
 *
 *   { "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }
 *
 * axilError subclasses (NotFoundError, ValidationError, ...) keep their status
 * and code; anything else is a 500 whose message is hidden in production.
 */

import { axilError } from '@axiljs/core'
import type { ErrorMiddlewareFn } from '@axiljs/core'

export function errorHandler(env: string): ErrorMiddlewareFn {
  // Four parameters: that is how Application.use() recognises an error handler
  return (err, req, res, _next) => {
    const known  = err instanceof axilError
    const status = known ? err.statusCode : 500

    if (status >= 500) console.error(`[${req.method} ${req.path}]`, err)

    res.status(status).json({
      error: {
        code:    known ? err.code : 'INTERNAL_ERROR',
        message: status >= 500 && env === 'production' ? 'Internal server error' : err.message,
        ...(known && err.details !== undefined ? { details: err.details } : {})
      }
    })
  }
}
