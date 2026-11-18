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

import {
  RouteHandler,
  MiddlewareFn,
  HttpMethod,
  axilRequest,
  axilResponse
} from '@axiljs/common';

import { Trie, ALL_METHODS } from './trie';

// ─── Route Entry ──────────────────────────────────────────────────────────────

// What we store in the trie for each route
interface RouteEntry {
  // The final route handler
  handler: RouteHandler;

  // Route-specific middleware (runs before handler)
  middleware: MiddlewareFn[];

  // Full path for debugging
  path: string;

  // HTTP method for debugging
  method: string;
}

// ─── Route Info ───────────────────────────────────────────────────────────────

/**
 * A registered route, as reported by router.routes() / app.routes().
 */
export interface RouteInfo {
  // HTTP method ('GET', 'POST', …) or '*' for routes registered with all()
  method: string;

  // Route path with :params (and * wildcards), prefixes applied
  path: string;

  // Middleware that runs before the handler, in execution order
  middleware: MiddlewareFn[];

  // The final route handler
  handler: RouteHandler;
}

// ─── Router ───────────────────────────────────────────────────────────────────

export class Router {
  // The trie that stores all routes
  private trie: Trie<RouteEntry>;

  // Prefix applied to all routes registered on this router
  private prefix: string;

  // Middleware applied to all routes on this router
  private routerMiddleware: MiddlewareFn[];

  // Registered routes in registration order (for introspection)
  private entries: RouteEntry[];

  constructor(prefix: string = '') {
    this.trie = new Trie<RouteEntry>();
    this.prefix = prefix;
    this.routerMiddleware = [];
    this.entries = [];
  }

  /**
   * Register middleware that runs for all routes on this router.
   */
  use(middleware: MiddlewareFn): Router {
    this.routerMiddleware.push(middleware);
    return this;
  }

  /**
   * Register a GET route.
   */
  get(
    path: string,
    ...args: [...MiddlewareFn[], RouteHandler]
  ): Router {
    return this.register('GET', path, args);
  }

  /**
   * Register a POST route.
   */
  post(
    path: string,
    ...args: [...MiddlewareFn[], RouteHandler]
  ): Router {
    return this.register('POST', path, args);
  }

  /**
   * Register a PUT route.
   */
  put(
    path: string,
    ...args: [...MiddlewareFn[], RouteHandler]
  ): Router {
    return this.register('PUT', path, args);
  }

  /**
   * Register a PATCH route.
   */
  patch(
    path: string,
    ...args: [...MiddlewareFn[], RouteHandler]
  ): Router {
    return this.register('PATCH', path, args);
  }

  /**
   * Register a DELETE route.
   */
  delete(
    path: string,
    ...args: [...MiddlewareFn[], RouteHandler]
  ): Router {
    return this.register('DELETE', path, args);
  }

  /**
   * Register an OPTIONS route.
   */
  options(
    path: string,
    ...args: [...MiddlewareFn[], RouteHandler]
  ): Router {
    return this.register('OPTIONS', path, args);
  }

  /**
   * Register a HEAD route.
   * (Without one, HEAD requests are answered by the GET route by default.)
   */
  head(
    path: string,
    ...args: [...MiddlewareFn[], RouteHandler]
  ): Router {
    return this.register('HEAD', path, args);
  }

  /**
   * Register a route for every HTTP method.
   * A route registered for a specific method on the same path wins.
   */
  all(
    path: string,
    ...args: [...MiddlewareFn[], RouteHandler]
  ): Router {
    return this.register(ALL_METHODS, path, args);
  }

  /**
   * Internal route registration.
   * Separates middleware from the final handler.
   */
  private register(
    method: HttpMethod | typeof ALL_METHODS,
    path: string,
    args: (MiddlewareFn | RouteHandler)[]
  ): Router {
    // Last argument is always the route handler
    const handler = args[args.length - 1] as RouteHandler;

    // Everything before the handler is middleware
    const middleware = args.slice(0, -1) as MiddlewareFn[];

    // Combine router prefix with route path
    const fullPath = this.normalizePath(this.prefix + path);

    const entry: RouteEntry = {
      handler,
      middleware,
      path: fullPath,
      method
    };
    this.trie.insert(method, fullPath, entry);

    // Re-registering the same method + path shape replaces the route in the
    // trie (param names don't matter there), so replace it here too
    const shape = routeShape(method, fullPath);
    const existing = this.entries.findIndex(
      e => routeShape(e.method, e.path) === shape
    );
    if (existing >= 0) this.entries[existing] = entry;
    else this.entries.push(entry);

    return this;
  }

  /**
   * Every route registered on this router, in registration order.
   * Paths include this router's prefix; middleware is the router-level
   * middleware followed by the route's own (the order they run in).
   */
  routes(): RouteInfo[] {
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
  match(
    method: string,
    path: string
  ): { entry: RouteEntry; params: Record<string, string> } | null {
    const result = this.trie.find(method, path);
    if (!result) return null;

    return {
      entry: result.handler,
      params: result.params
    };
  }

  /**
   * Get all middleware registered on this router.
   * Used by the application to build the middleware chain.
   */
  getRouterMiddleware(): MiddlewareFn[] {
    return this.routerMiddleware;
  }

  /**
   * Normalize a path - ensure it starts with / and remove double slashes.
   */
  private normalizePath(path: string): string {
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

/** Method + path with param names erased ('GET /users/:') - the trie's identity for a route. */
function routeShape(method: string, path: string): string {
  return method.toUpperCase() + ' ' + path.replace(/:[^/]+/g, ':');
}
