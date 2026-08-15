/**
 * Route helper.
 * Preserves the tuple type: [...MiddlewareFn[], RouteHandler]
 */

import type { MiddlewareFn, RouteHandler } from '@axiljs/core'

export function route(
  ...handlers: [...MiddlewareFn[], RouteHandler]
): [...MiddlewareFn[], RouteHandler] {
  return handlers
}