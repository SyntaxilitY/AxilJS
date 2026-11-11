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

import { MiddlewareFn, BadRequestError } from '@axiljs/common';
import { Request, safeDecode } from '../http/request';

/**
 * Create body parser middleware.
 *
 * @param limit Maximum body size in bytes (default: 1MB)
 */
export function bodyParser(limit: number = 1024 * 1024): MiddlewareFn {
  return async (req, res, next) => {
    // Skip body parsing for methods that shouldn't have a body
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }

    try {
      // Read raw body from the request stream
      const rawBody = await (req as unknown as Request).readBody(limit);

      if (!rawBody) {
        // No body - that's fine
        return next();
      }

      // Keep the exact body text (webhook signatures are computed over it).
      // req.rawBody is on core's Request; locals.rawBody serves code typed
      // against the axilRequest interface.
      (req as unknown as Request).rawBody = rawBody;
      req.locals.rawBody = rawBody;

      // Media types are case-insensitive (RFC 9110 §8.3.1)
      const contentType = ((req.headers['content-type'] as string) || '').toLowerCase();

      if (contentType.includes('application/json')) {
        // Parse JSON body
        try {
          req.body = JSON.parse(rawBody);
        } catch {
          throw new BadRequestError('Invalid JSON body');
        }
      } else if (
        contentType.includes('application/x-www-form-urlencoded')
      ) {
        // Parse URL-encoded form data
        req.body = parseFormData(rawBody);
      } else {
        // Unknown content type - store as raw string
        req.body = rawBody;
      }

      next();
    } catch (error) {
      next(error instanceof Error ? error : new Error(String(error)));
    }
  };
}

/**
 * Parse URL-encoded form data string into an object.
 * "name=John&age=30" → { name: 'John', age: '30' }
 */
function parseFormData(data: string): Record<string, string> {
  const result: Record<string, string> = {};

  data.split('&').forEach(pair => {
    // Split on first '=' only; '+' is a space; malformed escapes don't throw
    const eqIndex = pair.indexOf('=');
    const key = safeDecode(eqIndex === -1 ? pair : pair.slice(0, eqIndex));
    const value = eqIndex === -1 ? '' : safeDecode(pair.slice(eqIndex + 1));
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