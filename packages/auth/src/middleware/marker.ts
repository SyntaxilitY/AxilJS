/**
 * Marks middleware returned by the auth factories so tools can recognise
 * protected routes without depending on this package: @axiljs/core's
 * generateOpenAPI adds a bearer security requirement to routes that use it.
 */

import type { MiddlewareFn } from '@axiljs/common';

export const AUTH_MIDDLEWARE = Symbol.for('axiljs.auth');

export function markAuth(fn: MiddlewareFn, kind: string): MiddlewareFn {
  Object.defineProperty(fn, AUTH_MIDDLEWARE, { value: kind, enumerable: false });
  return fn;
}
