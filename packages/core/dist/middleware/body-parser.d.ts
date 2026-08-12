/**
 * Built-in body parser middleware.
 * Reads the request body and parses it based on Content-Type.
 *
 * Supports:
 *   application/json          → parses JSON
 *   application/x-www-form-urlencoded → parses form data
 *   text/plain                → raw string
 */
import { MiddlewareFn } from '@restjs/common';
/**
 * Create body parser middleware.
 *
 * @param limit Maximum body size in bytes (default: 1MB)
 */
export declare function bodyParser(limit?: number): MiddlewareFn;
//# sourceMappingURL=body-parser.d.ts.map