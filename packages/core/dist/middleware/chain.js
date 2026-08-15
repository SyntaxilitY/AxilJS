"use strict";
/**
 * Middleware chain executor.
 * Runs middleware functions in order, then calls the final handler.
 *
 * This is the core of the middleware system.
 * Works like Express/Koa middleware but with async/await support built-in.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MiddlewareChain = void 0;
const common_1 = require("@axil/common");
class MiddlewareChain {
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
    static async execute(middleware, handler, errorHandlers, req, res) {
        // Build the execution queue: all middleware + final handler
        // We convert the handler to look like middleware for uniform handling
        const queue = [
            ...middleware,
            // Wrap handler as middleware so we can put it at the end of the queue
            async (req, res, next) => {
                try {
                    await handler(req, res);
                }
                catch (error) {
                    next(error instanceof Error ? error : new Error(String(error)));
                }
            }
        ];
        // Index tracker - which middleware are we currently on
        let index = 0;
        /**
         * next() function passed to each middleware.
         * Calling it advances to the next middleware in the queue.
         */
        const next = async (error) => {
            if (error) {
                // An error occurred - skip remaining middleware and run error handlers
                await runErrorHandlers(error, errorHandlers, req, res);
                return;
            }
            if (index >= queue.length) {
                // No more middleware and no response sent - this is fine, move on
                return;
            }
            const currentMiddleware = queue[index++];
            try {
                // Execute current middleware, passing next so it can continue the chain
                await currentMiddleware(req, res, next);
            }
            catch (err) {
                // Middleware threw an error - run error handlers
                await runErrorHandlers(err instanceof Error ? err : new Error(String(err)), errorHandlers, req, res);
            }
        };
        // Start the chain
        await next();
    }
}
exports.MiddlewareChain = MiddlewareChain;
/**
 * Run error handling middleware in order.
 * If no error handler sends a response, send a default 500.
 */
async function runErrorHandlers(error, handlers, req, res) {
    let index = 0;
    const next = async (err) => {
        const currentError = err || error;
        if (index >= handlers.length) {
            // No more error handlers - send default error response if not sent
            if (!res.sent) {
                const statusCode = currentError instanceof common_1.axilError
                    ? currentError.statusCode
                    : 500;
                const code = currentError instanceof common_1.axilError
                    ? currentError.code
                    : 'INTERNAL_ERROR';
                // In production, don't expose internal error messages
                const message = process.env.NODE_ENV === 'production' && statusCode === 500
                    ? 'Internal server error'
                    : currentError.message;
                res.status(statusCode).json({
                    error: {
                        code,
                        message,
                        // Include stack trace only in development
                        ...(process.env.NODE_ENV !== 'production' && {
                            stack: currentError.stack
                        })
                    }
                });
            }
            return;
        }
        const handler = handlers[index++];
        try {
            await handler(currentError, req, res, next);
        }
        catch (handlerError) {
            // Error handler itself threw - skip to next error handler
            await next(handlerError instanceof Error
                ? handlerError
                : new Error(String(handlerError)));
        }
    };
    await next();
}
//# sourceMappingURL=chain.js.map