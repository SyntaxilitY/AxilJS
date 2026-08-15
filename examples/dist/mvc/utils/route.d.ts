/**
 * Route helper.
 * Preserves the tuple type: [...MiddlewareFn[], RouteHandler]
 */
import type { MiddlewareFn, RouteHandler } from '@axiljs/core';
export declare function route(...handlers: [...MiddlewareFn[], RouteHandler]): [...MiddlewareFn[], RouteHandler];
//# sourceMappingURL=route.d.ts.map