/**
 * Middleware chain executor.
 * Runs middleware functions in order, then calls the final handler.
 *
 * This is the core of the middleware system.
 * Works like Express/Koa middleware but with async/await support built-in.
 */
import { MiddlewareFn, ErrorMiddlewareFn, RouteHandler, @axiljsRequest, @axiljsResponse } from '@axiljs/common';
export declare class MiddlewareChain {
    /**
     * Execute a list of middleware functions followed by a route handler.
     * Each middleware must call next() to continue the chain.
     * If any middleware throws or passes an error to next(), error handlers run.
     *
     * @param middleware    Array of middleware functions to run in order
     * @param handler       Final route handler
     * @param errorHandlers Error handling middleware to run on errors
     * @param req           The request object
     * @param res           The response object
     */
    static execute(middleware: MiddlewareFn[], handler: RouteHandler, errorHandlers: ErrorMiddlewareFn[], req: @axiljsRequest, res: @axiljsResponse): Promise<void>;
}
//# sourceMappingURL=chain.d.ts.map