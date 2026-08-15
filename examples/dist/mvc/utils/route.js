"use strict";
/**
 * Route helper.
 * Preserves the tuple type: [...MiddlewareFn[], RouteHandler]
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.route = route;
function route(...handlers) {
    return handlers;
}
//# sourceMappingURL=route.js.map