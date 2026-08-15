/**
 * Route helper.
 * Preserves the tuple type: [...MiddlewareFn[], RouteHandler]
 */

import type { MiddlewareFn, RouteHandler } from '@axil/core'

export function route(
  ...handlers: [...MiddlewareFn[], RouteHandler]
): [...MiddlewareFn[], RouteHandler] {
  return handlers
}