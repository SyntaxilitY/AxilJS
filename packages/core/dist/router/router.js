"use strict";
/**
 * @axilJS Router.
 * Registers routes and matches incoming requests to handlers.
 * Uses the Trie for fast matching.
 *
 * Usage:
 *   const router = new Router()
 *   router.get('/users', listUsersHandler)
 *   router.post('/users', createUserHandler)
 *   router.get('/users/:id', getUserHandler)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Router = void 0;
const trie_1 = require("./trie");
// ─── Router ───────────────────────────────────────────────────────────────────
class Router {
    // The trie that stores all routes
    trie;
    // Prefix applied to all routes registered on this router
    prefix;
    // Middleware applied to all routes on this router
    routerMiddleware;
    constructor(prefix = '') {
        this.trie = new trie_1.Trie();
        this.prefix = prefix;
        this.routerMiddleware = [];
    }
    /**
     * Register middleware that runs for all routes on this router.
     */
    use(middleware) {
        this.routerMiddleware.push(middleware);
        return this;
    }
    /**
     * Register a GET route.
     */
    get(path, ...args) {
        return this.register('GET', path, args);
    }
    /**
     * Register a POST route.
     */
    post(path, ...args) {
        return this.register('POST', path, args);
    }
    /**
     * Register a PUT route.
     */
    put(path, ...args) {
        return this.register('PUT', path, args);
    }
    /**
     * Register a PATCH route.
     */
    patch(path, ...args) {
        return this.register('PATCH', path, args);
    }
    /**
     * Register a DELETE route.
     */
    delete(path, ...args) {
        return this.register('DELETE', path, args);
    }
    /**
     * Register an OPTIONS route.
     */
    options(path, ...args) {
        return this.register('OPTIONS', path, args);
    }
    /**
     * Internal route registration.
     * Separates middleware from the final handler.
     */
    register(method, path, args) {
        // Last argument is always the route handler
        const handler = args[args.length - 1];
        // Everything before the handler is middleware
        const middleware = args.slice(0, -1);
        // Combine router prefix with route path
        const fullPath = this.normalizePath(this.prefix + path);
        this.trie.insert(method, fullPath, {
            handler,
            middleware,
            path: fullPath,
            method
        });
        return this;
    }
    /**
     * Match an incoming request to a registered route.
     * Returns the route entry and extracted params, or null if no match.
     */
    match(method, path) {
        const result = this.trie.find(method, path);
        if (!result)
            return null;
        return {
            entry: result.handler,
            params: result.params
        };
    }
    /**
     * Get all middleware registered on this router.
     * Used by the application to build the middleware chain.
     */
    getRouterMiddleware() {
        return this.routerMiddleware;
    }
    /**
     * Normalize a path - ensure it starts with / and remove double slashes.
     */
    normalizePath(path) {
        // Ensure starts with /
        if (!path.startsWith('/')) {
            path = '/' + path;
        }
        // Remove double slashes
        path = path.replace(/\/+/g, '/');
        // Remove trailing slash (except root /)
        if (path.length > 1 && path.endsWith('/')) {
            path = path.slice(0, -1);
        }
        return path;
    }
}
exports.Router = Router;
//# sourceMappingURL=router.js.map