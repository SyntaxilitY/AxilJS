/**
 * AxilJS Application - The main class.
 * This is what developers create and configure.
 *
 * Usage:
 *   const app = new Application({ server: { port: 3000 } })
 *   app.use(bodyParser())
 *   app.get('/users', listUsers)
 *   await app.listen()
 */

import {
  createServer,
  IncomingMessage,
  ServerResponse,
  Server,
  ServerOptions
} from 'http';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  AppConfig,
  MiddlewareFn,
  ErrorMiddlewareFn,
  RouteHandler,
  HttpMethod,
  NotFoundError,
  axilError
} from '@axiljs/common';

import { Request } from './http/request';
import { Response } from './http/response';
import { Router, RouteInfo } from './router/router';
import {
  generateOpenAPI,
  excludeFromOpenAPI,
  OpenAPIOptions,
  OpenAPIDocument
} from './openapi';
import { MiddlewareChain } from './middleware/chain';
import { requestLogger } from './middleware/logger';
import { bodyParser } from './middleware/body-parser';

// Methods probed when building the Allow header of a 405 response
const KNOWN_METHODS: HttpMethod[] = [
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS'
];

let cachedVersion: string | undefined;

/**
 * The installed @axiljs/core version, read from its package.json.
 * Resolved relative to this file (src/ or dist/ are both one level below the
 * package root); falls back to 'unknown' if it can't be read.
 * @internal
 */
export function coreVersion(): string {
  if (cachedVersion !== undefined) return cachedVersion;
  cachedVersion = 'unknown';
  const dir = typeof __dirname === 'string' ? __dirname : '';
  if (!dir) return cachedVersion;

  for (const candidate of [join(dir, '..', 'package.json'), join(dir, '..', '..', 'package.json')]) {
    try {
      const pkg = JSON.parse(readFileSync(candidate, 'utf-8'));
      if (pkg && pkg.name === '@axiljs/core' && typeof pkg.version === 'string') {
        cachedVersion = pkg.version;
        break;
      }
    } catch {
      // Not readable here - try the next candidate
    }
  }
  return cachedVersion as string;
}

/**
 * Parse a size such as '1mb', '512kb', '100b' or '2048' into bytes.
 * @internal
 */
export function parseByteSize(size: string | number): number {
  if (typeof size === 'number') {
    if (!Number.isFinite(size) || size < 0) {
      throw new Error(`Invalid size: ${size}`);
    }
    return Math.floor(size);
  }

  const match = /^\s*(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?\s*$/i.exec(size);
  if (!match) {
    throw new Error(`Invalid size: '${size}'. Use e.g. '1mb', '500kb' or '1024'.`);
  }

  const units: Record<string, number> = {
    b: 1,
    kb: 1024,
    mb: 1024 * 1024,
    gb: 1024 * 1024 * 1024
  };

  return Math.floor(parseFloat(match[1]) * units[(match[2] || 'b').toLowerCase()]);
}

/**
 * The URL path of a mounted router's route, mirroring findRoute(): the
 * mount prefix is prepended unless the route path already starts with it
 * (prefix baked into the Router, matched via the full-path fallback).
 * @internal
 */
export function mountedPath(prefix: string, routePath: string): string {
  let base = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  if (!base) return routePath;
  if (!base.startsWith('/')) base = '/' + base;
  if (routePath === base || routePath.startsWith(base + '/')) return routePath;
  return routePath === '/' ? base : base + routePath;
}

export class Application {
  // Configuration
  private config: AppConfig;

  // The main router for this application
  private router: Router;

  // Global middleware (runs for every request)
  private globalMiddleware: MiddlewareFn[];

  // Global error handlers (runs when middleware/handler throws)
  private errorHandlers: ErrorMiddlewareFn[];

  // Child routers mounted at specific prefixes
  private mountedRouters: Array<{ prefix: string; router: Router }>;

  // Node.js HTTP server instance
  private server: Server | null;

  constructor(config: AppConfig = {}) {
    // Spread user config first so the merged/defaulted values below win
    // (spreading it last would discard the server defaults and let
    // explicit `undefined` values override the fallbacks)
    this.config = {
      ...config,
      server: {
        port: 3000,
        host: '0.0.0.0',
        ...config.server
      },
      env: config.env || process.env.NODE_ENV || 'development',
      prettyJson: config.prettyJson ?? true,
      prefix: config.prefix || '',
      logging: config.logging ?? true
    };

    this.router = new Router(this.config.prefix);
    this.globalMiddleware = [];
    this.errorHandlers = [];
    this.mountedRouters = [];
    this.server = null;

    // Register built-in middleware
    this.registerBuiltins();
  }

  /**
   * Register built-in middleware that all apps should have.
   */
  private registerBuiltins(): void {
    // Request logging (can be disabled via config)
    this.use(requestLogger(this.config.logging));

    // Body parsing for JSON, form data, etc. (server.bodyLimit, default 1 MB)
    const bodyLimit = this.config.server?.bodyLimit;
    this.use(
      bodyParser(bodyLimit !== undefined ? parseByteSize(bodyLimit) : undefined)
    );
  }

  // ─── Middleware Registration ─────────────────────────────────────────────────

  /**
   * Register global middleware or error handler.
   *
   * Usage:
   *   app.use(cors())
   *   app.use((err, req, res, next) => { ... }) // Error handler
   */
  use(middleware: MiddlewareFn | ErrorMiddlewareFn): Application {
    // Error handlers have 4 parameters - detect by function.length
    if (middleware.length === 4) {
      this.errorHandlers.push(middleware as ErrorMiddlewareFn);
    } else {
      this.globalMiddleware.push(middleware as MiddlewareFn);
    }
    return this;
  }

  // ─── Route Registration ──────────────────────────────────────────────────────

  get(path: string, ...args: [...MiddlewareFn[], RouteHandler]): Application {
    this.router.get(path, ...args);
    return this;
  }

  post(path: string, ...args: [...MiddlewareFn[], RouteHandler]): Application {
    this.router.post(path, ...args);
    return this;
  }

  put(path: string, ...args: [...MiddlewareFn[], RouteHandler]): Application {
    this.router.put(path, ...args);
    return this;
  }

  patch(path: string, ...args: [...MiddlewareFn[], RouteHandler]): Application {
    this.router.patch(path, ...args);
    return this;
  }

  delete(
    path: string,
    ...args: [...MiddlewareFn[], RouteHandler]
  ): Application {
    this.router.delete(path, ...args);
    return this;
  }

  head(path: string, ...args: [...MiddlewareFn[], RouteHandler]): Application {
    this.router.head(path, ...args);
    return this;
  }

  options(
    path: string,
    ...args: [...MiddlewareFn[], RouteHandler]
  ): Application {
    this.router.options(path, ...args);
    return this;
  }

  /**
   * Register a route for every HTTP method
   * (a route for a specific method on the same path wins).
   */
  all(path: string, ...args: [...MiddlewareFn[], RouteHandler]): Application {
    this.router.all(path, ...args);
    return this;
  }

  // ─── Router Mounting ─────────────────────────────────────────────────────────

  /**
   * Mount a child router at a prefix.
   *
   * Usage:
   *   const usersRouter = new Router()
   *   usersRouter.get('/', listUsers)
   *   usersRouter.get('/:id', getUser)
   *
   *   app.mount('/users', usersRouter)
   *   // Creates routes: GET /users, GET /users/:id
   */
  mount(prefix: string, router: Router): Application {
    this.mountedRouters.push({ prefix, router });
    return this;
  }

  // ─── Introspection & OpenAPI ─────────────────────────────────────────────────

  /**
   * Every registered route, in matching order: the app's own routes, then
   * each mounted router's (in mount order). A method + path that an
   * earlier source already serves is reported once, as the runtime does.
   *
   * - path: the URL a client requests. App routes include config.prefix;
   *   mounted routes get the mount prefix + the router's own prefix (the
   *   app prefix does not apply to mounted routers at runtime). A router
   *   whose prefix already starts with the mount prefix (new Router('/users')
   *   mounted at '/users') is reported without doubling it.
   * - middleware: global middleware, router middleware, route middleware -
   *   the order they run in (error handlers excluded).
   * - method: 'GET', 'POST', … or '*' for all() routes.
   */
  routes(): RouteInfo[] {
    const global = this.globalMiddleware;
    const seen = new Set<string>();
    const out: RouteInfo[] = [];

    const add = (route: RouteInfo, path: string): void => {
      const key = route.method.toUpperCase() + ' ' + path.replace(/:[^/]+/g, ':');
      if (seen.has(key)) return;
      seen.add(key);
      out.push({
        method: route.method,
        path,
        middleware: [...global, ...route.middleware],
        handler: route.handler
      });
    };

    for (const route of this.router.routes()) add(route, route.path);

    for (const { prefix, router } of this.mountedRouters) {
      for (const route of router.routes()) {
        add(route, mountedPath(prefix, route.path));
      }
    }

    return out;
  }

  /**
   * Generate an OpenAPI 3.1 document for the current routes.
   * See generateOpenAPI() in openapi.ts for what is emitted.
   */
  openapi(options: OpenAPIOptions): OpenAPIDocument {
    return generateOpenAPI(this, options);
  }

  /**
   * Serve the OpenAPI document as JSON with a GET route
   * (default path '/openapi.json'; config.prefix applies like any app route).
   * The document is generated on the first request and cached, so register
   * this after - or at least before the first request reaches - your routes.
   * The route itself is left out of the document.
   *
   *   app.serveOpenAPI({ title: 'Shop API', version: '1.0.0' })
   *   app.serveOpenAPI('/docs/openapi.json', { title: 'Shop API', version: '1.0.0' })
   */
  serveOpenAPI(options: OpenAPIOptions): Application;
  serveOpenAPI(path: string, options: OpenAPIOptions): Application;
  serveOpenAPI(
    pathOrOptions: string | OpenAPIOptions,
    maybeOptions?: OpenAPIOptions
  ): Application {
    const path = typeof pathOrOptions === 'string' ? pathOrOptions : '/openapi.json';
    const options = typeof pathOrOptions === 'string' ? maybeOptions : pathOrOptions;
    if (!options || typeof options !== 'object') {
      throw new TypeError('serveOpenAPI() needs options: { title, version }');
    }

    let cached: OpenAPIDocument | undefined;
    const handler: RouteHandler = (_req, res) => {
      if (!cached) cached = this.openapi(options);
      res.json(cached);
    };

    return this.get(path, excludeFromOpenAPI(handler));
  }

  // ─── Request Handling ────────────────────────────────────────────────────────

  /**
   * Handle an incoming HTTP request.
   * This is the core request processing pipeline.
   */
  private async handleRequest(
    rawReq: IncomingMessage,
    rawRes: ServerResponse
  ): Promise<void> {
    // Create AxilJS request and response objects
    const req = new Request(rawReq, {
      trustProxy: this.config.server?.trustProxy
    });
    const res = new Response(rawRes);

    // Try to find a matching route
    const match = this.matchRoute(req.method, req.path);

    if (!match) {
      // No route matched - 404, or 405 when enabled and only the method differs
      const middleware = [...this.globalMiddleware];
      const allowed = this.config.server?.methodNotAllowed
        ? this.allowedMethods(req.path)
        : [];

      const notFoundHandler: RouteHandler = (req, res) => {
        if (allowed.length > 0) {
          res.header('Allow', allowed.join(', '));

          // OPTIONS on a known path: answer with the allowed methods
          if (req.method === 'OPTIONS') {
            res.status(204).send('');
            return;
          }

          throw new axilError(
            `Method ${req.method} not allowed for ${req.path}`,
            405,
            'METHOD_NOT_ALLOWED'
          );
        }
        throw new NotFoundError(`Cannot ${req.method} ${req.path}`);
      };

      await MiddlewareChain.execute(
        middleware,
        notFoundHandler,
        this.errorHandlers,
        req,
        res
      );
      return;
    }

    // Set route params from the match
    req.params = match.params;

    // Build middleware chain:
    // global middleware → router middleware → route middleware → handler
    const middleware = [
      ...this.globalMiddleware,
      ...match.routerMiddleware,
      ...match.routeMiddleware
    ];

    await MiddlewareChain.execute(
      middleware,
      match.handler,
      this.errorHandlers,
      req,
      res
    );
  }

  /**
   * Find the route for a request, answering HEAD with the GET route when no
   * HEAD route exists (unless server.headFallback is false). Node omits the
   * body of HEAD responses, so the GET handler only contributes headers.
   */
  private matchRoute(method: string, path: string) {
    const match = this.findRoute(method, path);
    if (match || method !== 'HEAD' || this.config.server?.headFallback === false) {
      return match;
    }
    return this.findRoute('GET', path);
  }

  /**
   * Methods that have a route for this path (for the 405 Allow header).
   */
  private allowedMethods(path: string): string[] {
    return KNOWN_METHODS.filter(method => this.matchRoute(method, path));
  }

  /**
   * Find a matching route across the main router and all mounted routers.
   */
  private findRoute(
    method: string,
    path: string
  ): {
    handler: RouteHandler;
    params: Record<string, string>;
    routerMiddleware: MiddlewareFn[];
    routeMiddleware: MiddlewareFn[];
  } | null {
    // Check main router first
    const mainMatch = this.router.match(method, path);
    if (mainMatch) {
      return {
        handler: mainMatch.entry.handler,
        params: mainMatch.params,
        routerMiddleware: this.router.getRouterMiddleware(),
        routeMiddleware: mainMatch.entry.middleware
      };
    }

    // Check mounted routers
    for (const { prefix, router } of this.mountedRouters) {
      // Only try routers where path is under the prefix on a segment
      // boundary ('/users' must not match '/usersettings')
      const base = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
      if (base && path !== base && !path.startsWith(base + '/')) continue;

      // Routers are usually defined relative to the mount point
      // (router.get('/:id') mounted at '/users'), so match the path with
      // the prefix removed; fall back to the full path for routers that
      // were created with the prefix baked in (new Router('/users')).
      const relative = path.slice(base.length) || '/';
      const match =
        router.match(method, relative) || router.match(method, path);
      if (match) {
        return {
          handler: match.entry.handler,
          params: match.params,
          routerMiddleware: router.getRouterMiddleware(),
          routeMiddleware: match.entry.middleware
        };
      }
    }

    return null;
  }

  // ─── Server Lifecycle ────────────────────────────────────────────────────────

  /**
   * Start the HTTP server and begin accepting requests.
   *
   * @returns Promise that resolves when server is listening
   */
  async listen(
    port?: number,
    host?: string
  ): Promise<{ port: number; host: string }> {
    // ?? so port 0 (pick a free port) is honoured
    const listenPort = port ?? this.config.server?.port ?? 3000;
    const listenHost = host || this.config.server?.host || '0.0.0.0';

    return new Promise((resolve, reject) => {
      this.server = createServer(
        this.serverOptions(),
        async (rawReq, rawRes) => {
          // Handle each request - catch any unhandled errors
          try {
            await this.handleRequest(rawReq, rawRes);
          } catch (error) {
            // Catastrophic error - send 500 if possible
            if (!rawRes.headersSent) {
              rawRes.writeHead(500, { 'Content-Type': 'application/json' });
              rawRes.end(
                JSON.stringify({
                  error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Internal server error'
                  }
                })
              );
            }
          }
        }
      );

      this.server.on('error', reject);

      this.server.listen(listenPort, listenHost, () => {
        // Report the bound port (differs from listenPort when it was 0)
        const address = this.server?.address();
        const boundPort =
          address && typeof address === 'object' ? address.port : listenPort;

        // Print startup banner unless logging is off or running under tests
        if (this.config.logging !== false && this.config.env !== 'test') {
          this.printBanner(boundPort, listenHost);
        }
        resolve({ port: boundPort, host: listenHost });
      });
    });
  }

  /**
   * Node server options derived from the config.
   * server.timeout is the deadline for receiving a whole request (Node's
   * requestTimeout; slower clients get 408). Node checks it every
   * connectionsCheckingInterval (30 s by default), so that interval is
   * scaled down for short timeouts.
   */
  private serverOptions(): ServerOptions {
    const timeout = this.config.server?.timeout;
    if (timeout === undefined || !Number.isFinite(timeout) || timeout < 0) {
      return {};
    }
    if (timeout === 0) return { requestTimeout: 0 };

    return {
      requestTimeout: timeout,
      // Node requires headersTimeout <= requestTimeout (default 60 s)
      headersTimeout: Math.min(timeout, 60000),
      connectionsCheckingInterval: Math.max(
        10,
        Math.min(30000, Math.floor(timeout / 2))
      )
    };
  }

  /**
   * Stop the HTTP server gracefully.
   */
  async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      this.server.close(err => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  getServer(): Server | null {
    return this.server;
  }

  /**
 * Print startup information banner.
 */
  private printBanner(port: number, host: string): void {
    const env = this.config.env || 'development'

    console.log('')
    console.log('\x1b[36m\x1b[1m  █████╗ ██╗  ██╗██╗██╗          ██╗███████╗\x1b[0m')
    console.log('\x1b[36m\x1b[1m ██╔══██╗╚██╗██╔╝██║██║          ██║██╔════╝\x1b[0m')
    console.log('\x1b[36m\x1b[1m ███████║ ╚███╔╝ ██║██║          ██║███████╗\x1b[0m')
    console.log('\x1b[36m\x1b[1m ██╔══██║ ██╔██╗ ██║██║     ██   ██║╚════██║\x1b[0m')
    console.log('\x1b[36m\x1b[1m ██║  ██║██╔╝ ██╗██║███████╗╚█████╔╝███████║\x1b[0m')
    console.log('\x1b[36m\x1b[1m ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚══════╝ ╚════╝ ╚══════╝\x1b[0m')
    console.log('')
    console.log(`\x1b[1m AxilJS\x1b[0m \x1b[90mv${coreVersion()}\x1b[0m`)
    console.log('')
    console.log(`  \x1b[32m✓\x1b[0m Server running`)
    console.log(`  \x1b[32m✓\x1b[0m http://${host}:${port}`)
    console.log(`  \x1b[32m✓\x1b[0m Environment: \x1b[33m${env}\x1b[0m`)
    console.log('')
  }
}