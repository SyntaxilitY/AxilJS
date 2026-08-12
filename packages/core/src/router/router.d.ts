/**
 * REstJS Router.
 * Registers routes and matches incoming requests to handlers.
 * Uses the Trie for fast matching.
 *
 * Usage:
 *   const router = new Router()
 *   router.get('/users', listUsersHandler)
 *   router.post('/users', createUserHandler)
 *   router.get('/users/:id', getUserHandler)
 */
import { RouteHandler, MiddlewareFn } from '@restjs/common';
interface RouteEntry {
    handler: RouteHandler;
    middleware: MiddlewareFn[];
    path: string;
    method: string;
}
export declare class Router {
    private trie;
    private prefix;
    private routerMiddleware;
    constructor(prefix?: string);
    /**
     * Register middleware that runs for all routes on this router.
     */
    use(middleware: MiddlewareFn): Router;
    /**
     * Register a GET route.
     */
    get(path: string, ...args: [...MiddlewareFn[], RouteHandler]): Router;
    /**
     * Register a POST route.
     */
    post(path: string, ...args: [...MiddlewareFn[], RouteHandler]): Router;
    /**
     * Register a PUT route.
     */
    put(path: string, ...args: [...MiddlewareFn[], RouteHandler]): Router;
    /**
     * Register a PATCH route.
     */
    patch(path: string, ...args: [...MiddlewareFn[], RouteHandler]): Router;
    /**
     * Register a DELETE route.
     */
    delete(path: string, ...args: [...MiddlewareFn[], RouteHandler]): Router;
    /**
     * Register an OPTIONS route.
     */
    options(path: string, ...args: [...MiddlewareFn[], RouteHandler]): Router;
    /**
     * Internal route registration.
     * Separates middleware from the final handler.
     */
    private register;
    /**
     * Match an incoming request to a registered route.
     * Returns the route entry and extracted params, or null if no match.
     */
    match(method: string, path: string): {
        entry: RouteEntry;
        params: Record<string, string>;
    } | null;
    /**
     * Get all middleware registered on this router.
     * Used by the application to build the middleware chain.
     */
    getRouterMiddleware(): MiddlewareFn[];
    /**
     * Normalize a path - ensure it starts with / and remove double slashes.
     */
    private normalizePath;
}
export {};
//# sourceMappingURL=router.d.ts.map