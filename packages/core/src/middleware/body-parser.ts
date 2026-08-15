/**
 * Built-in body parser middleware.
 * Reads the request body and parses it based on Content-Type.
 *
 * Supports:
 *   application/json          → parses JSON
 *   application/x-www-form-urlencoded → parses form data
 *   text/plain                → raw string
 */

import { MiddlewareFn, BadRequestError } from '@axil/common';
import { Request } from '../http/request';

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

      const contentType = (req.headers['content-type'] as string) || '';

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
    const [key, value] = pair.split('=').map(decodeURIComponent);
    if (key) result[key] = value || '';
  });

  return result;
}