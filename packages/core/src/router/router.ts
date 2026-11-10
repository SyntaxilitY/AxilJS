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

// ─── Router ───────────────────────────────────────────────────────────────────

export class Router {
  // The trie that stores all routes
  private trie: Trie<RouteEntry>;

  // Prefix applied to all routes registered on this router
  private prefix: string;

  // Middleware applied to all routes on this router
  private routerMiddleware: MiddlewareFn[];

  constructor(prefix: string = '') {
    this.trie = new Trie<RouteEntry>();
    this.prefix = prefix;
    this.routerMiddleware = [];
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