/**
 * Built-in CORS middleware.
 * Handles Cross-Origin Resource Sharing headers.
 */

import { MiddlewareFn } from '@restjs/common';

export interface CorsOptions {
  // Allowed origins (default: '*')
  // Can be a string, array of strings, or function
  origin?: string | string[] | ((origin: string) => boolean);

  // Allowed HTTP methods (default: common methods)
  methods?: string[];

  // Allowed headers
  allowedHeaders?: string[];

  // Headers to expose to the client
  exposedHeaders?: string[];

  // Allow credentials (default: false)
  credentials?: boolean;

  // Preflight cache duration in seconds (default: 86400)
  maxAge?: number;
}

const DEFAULT_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const DEFAULT_HEADERS = ['Content-Type', 'Authorization'];

/**
 * Create CORS middleware.
 *
 * Usage:
 *   app.use(cors()) // Allow all origins
 *   app.use(cors({ origin: 'https://example.com' }))
 *   app.use(cors({ origin: ['https://app.com', 'https://admin.com'] }))
 */
export function cors(options: CorsOptions = {}): MiddlewareFn {
  const {
    origin = '*',
    methods = DEFAULT_METHODS,
    allowedHeaders = DEFAULT_HEADERS,
    exposedHeaders = [],
    credentials = false,
    maxAge = 86400
  } = options;

  return (req, res, next) => {
    const requestOrigin = req.headers['origin'] as string || '';

    // Determine the allowed origin value to send back
    let allowOrigin: string;

    if (typeof origin === 'function') {
      // Custom function to validate origin
      allowOrigin = origin(requestOrigin) ? requestOrigin : '';
    } else if (Array.isArray(origin)) {
      // Array of allowed origins
      allowOrigin = origin.includes(requestOrigin) ? requestOrigin : '';
    } else {
      // String: '*' or specific origin
      allowOrigin = origin;
    }

    // Set CORS headers
    if (allowOrigin) {
      res.header('Access-Control-Allow-Origin', allowOrigin);
    }

    if (credentials) {
      res.header('Access-Control-Allow-Credentials', 'true');
    }

    if (exposedHeaders.length > 0) {
      res.header(
        'Access-Control-Expose-Headers',
        exposedHeaders.join(', ')
      );
    }

    // Handle preflight OPTIONS request
    if (req.method === 'OPTIONS') {
      res.header('Access-Control-Allow-Methods', methods.join(', '));
      res.header(
        'Access-Control-Allow-Headers',
        allowedHeaders.join(', ')
      );
      res.header('Access-Control-Max-Age', String(maxAge));

      // Respond to preflight immediately - no need to continue chain
      res.status(204).send('');
      return;
    }

    next();
  };
}