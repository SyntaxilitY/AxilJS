/**
 * @axiljsJS Application - The main class.
 * This is what developers create and configure.
 *
 * Usage:
 *   const app = new Application({ server: { port: 3000 } })
 *   app.use(bodyParser())
 *   app.get('/users', listUsers)
 *   await app.listen()
 */

import { createServer, IncomingMessage, ServerResponse, Server } from 'http';
import {
  AppConfig,
  MiddlewareFn,
  ErrorMiddlewareFn,
  RouteHandler,
  HttpMethod,
  NotFoundError
} from '@axiljs/common';

import { Request } from './http/request';
import { Response } from './http/response';
import { Router } from './router/router';
import { MiddlewareChain } from './middleware/chain';
import { requestLogger } from './middleware/logger';
import { bodyParser } from './middleware/body-parser';

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
    this.config = {
      server: {
        port: 3000,
        host: '0.0.0.0',
        ...config.server
      },
      env: config.env || process.env.NODE_ENV || 'development',
      prettyJson: config.prettyJson ?? true,
      prefix: config.prefix || '',
      logging: config.logging ?? true,
      ...config
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

    // Body parsing for JSON, form data, etc.
    this.use(bodyParser());
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

  // ─── Request Handling ────────────────────────────────────────────────────────

  /**
   * Handle an incoming HTTP request.
   * This is the core request processing pipeline.
   */
  private async handleRequest(
    rawReq: IncomingMessage,
    rawRes: ServerResponse
  ): Promise<void> {
    // Create @axiljsJS request and response objects
    const req = new Request(rawReq);
    const res = new Response(rawRes);

    // Try to find a matching route
    const match = this.findRoute(req.method, req.path);

    if (!match) {
      // No route matched - 404
      const middleware = [...this.globalMiddleware];
      const notFoundHandler: RouteHandler = () => {
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
      // Only try routers where path starts with the prefix
      if (!path.startsWith(prefix)) continue;

      const match = router.match(method, path);
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
    const listenPort = port || this.config.server?.port || 3000;
    const listenHost = host || this.config.server?.host || '0.0.0.0';

    return new Promise((resolve, reject) => {
      this.server = createServer(
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
        // Print startup banner
        this.printBanner(listenPort, listenHost);
        resolve({ port: listenPort, host: listenHost });
      });
    });
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
    console.log(`\x1b[1m AxilJS\x1b[0m \x1b[90mv0.1.0\x1b[0m`)
    console.log('')
    console.log(`  \x1b[32m✓\x1b[0m Server running`)
    console.log(`  \x1b[32m✓\x1b[0m http://${host}:${port}`)
    console.log(`  \x1b[32m✓\x1b[0m Environment: \x1b[33m${env}\x1b[0m`)
    console.log('')
  }
}