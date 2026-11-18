"use strict";
/**
 * AxilJS Router.
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
    // Registered routes in registration order (for introspection)
    entries;
    constructor(prefix = '') {
        this.trie = new trie_1.Trie();
        this.prefix = prefix;
        this.routerMiddleware = [];
        this.entries = [];
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
     * Register a HEAD route.
     * (Without one, HEAD requests are answered by the GET route by default.)
     */
    head(path, ...args) {
        return this.register('HEAD', path, args);
    }
    /**
     * Register a route for every HTTP method.
     * A route registered for a specific method on the same path wins.
     */
    all(path, ...args) {
        return this.register(trie_1.ALL_METHODS, path, args);
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
        const entry = {
            handler,
            middleware,
            path: fullPath,
            method
        };
        this.trie.insert(method, fullPath, entry);
        // Re-registering the same method + path shape replaces the route in the
        // trie (param names don't matter there), so replace it here too
        const shape = routeShape(method, fullPath);
        const existing = this.entries.findIndex(e => routeShape(e.method, e.path) === shape);
        if (existing >= 0)
            this.entries[existing] = entry;
        else
            this.entries.push(entry);
        return this;
    }
    /**
     * Every route registered on this router, in registration order.
     * Paths include this router's prefix; middleware is the router-level
     * middleware followed by the route's own (the order they run in).
     */
    routes() {
        return this.entries.map(entry => ({
            method: entry.method,
            path: entry.path,
            middleware: [...this.routerMiddleware, ...entry.middleware],
            handler: entry.handler
        }));
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
/** Method + path with param names erased ('GET /users/:') - the trie's identity for a route. */
function routeShape(method, path) {
    return method.toUpperCase() + ' ' + path.replace(/:[^/]+/g, ':');
}
//# sourceMappingURL=router.js.map