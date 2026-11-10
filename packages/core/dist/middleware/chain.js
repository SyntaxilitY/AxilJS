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
const common_1 = require("@axiljs/common");
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
        /**
         * Run the middleware at position i. Each middleware gets its own next():
         * the first call advances the chain, any further call is ignored (with a
         * warning outside production) so a middleware that calls next() twice
         * cannot run the rest of the chain - and the handler - a second time.
         */
        const run = async (i, error) => {
            if (error) {
                // An error occurred - skip remaining middleware and run error handlers
                await runErrorHandlers(error, errorHandlers, req, res);
                return;
            }
            if (i >= queue.length) {
                // No more middleware and no response sent - this is fine, move on
                return;
            }
            const currentMiddleware = queue[i];
            let called = false;
            const next = async (err) => {
                if (called) {
                    warnMultipleNext(req.method, req.path);
                    return;
                }
                called = true;
                await run(i + 1, err);
            };
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
        await run(0);
    }
}
exports.MiddlewareChain = MiddlewareChain;
/** Warn (outside production) that a next() was called more than once. */
function warnMultipleNext(method, path) {
    if (process.env.NODE_ENV === 'production')
        return;
    console.warn(`[AxilJS] next() called multiple times by the same middleware (${method} ${path}); ignoring the extra call.`);
}
/**
 * Run error handling middleware in order.
 * If no error handler sends a response, send a default 500.
 */
async function runErrorHandlers(error, handlers, req, res) {
    const run = async (index, err) => {
        const currentError = err || error;
        if (index >= handlers.length) {
            // No more error handlers - send default error response if not sent
            // Headers already flushed (streaming/SSE/raw writes) - we can't send
            // an error body anymore; just terminate the response. Trying res.json
            // here would throw ERR_HTTP_HEADERS_SENT, and since next() is often
            // not awaited by middleware, that becomes an unhandled rejection.
            if (!res.sent && res.raw?.headersSent) {
                if (!res.raw.writableEnded)
                    res.raw.end();
                return;
            }
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
        const handler = handlers[index];
        // Same once-only guard as the main chain
        let called = false;
        const next = async (nextErr) => {
            if (called) {
                warnMultipleNext(req.method, req.path);
                return;
            }
            called = true;
            await run(index + 1, nextErr);
        };
        try {
            await handler(currentError, req, res, next);
        }
        catch (handlerError) {
            // Error handler itself threw - skip to next error handler
            if (called)
                return;
            called = true;
            await run(index + 1, handlerError instanceof Error
                ? handlerError
                : new Error(String(handlerError)));
        }
    };
    await run(0);
}
//# sourceMappingURL=chain.js.map