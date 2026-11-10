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
import { Server } from 'http';
import { AppConfig, MiddlewareFn, ErrorMiddlewareFn, RouteHandler } from '@axiljs/common';
import { Router } from './router/router';
/**
 * Parse a size such as '1mb', '512kb', '100b' or '2048' into bytes.
 * @internal
 */
export declare function parseByteSize(size: string | number): number;
export declare class Application {
    private config;
    private router;
    private globalMiddleware;
    private errorHandlers;
    private mountedRouters;
    private server;
    constructor(config?: AppConfig);
    /**
     * Register built-in middleware that all apps should have.
     */
    private registerBuiltins;
    /**
     * Register global middleware or error handler.
     *
     * Usage:
     *   app.use(cors())
     *   app.use((err, req, res, next) => { ... }) // Error handler
     */
    use(middleware: MiddlewareFn | ErrorMiddlewareFn): Application;
    get(path: string, ...args: [...MiddlewareFn[], RouteHandler]): Application;
    post(path: string, ...args: [...MiddlewareFn[], RouteHandler]): Application;
    put(path: string, ...args: [...MiddlewareFn[], RouteHandler]): Application;
    patch(path: string, ...args: [...MiddlewareFn[], RouteHandler]): Application;
    delete(path: string, ...args: [...MiddlewareFn[], RouteHandler]): Application;
    head(path: string, ...args: [...MiddlewareFn[], RouteHandler]): Application;
    options(path: string, ...args: [...MiddlewareFn[], RouteHandler]): Application;
    /**
     * Register a route for every HTTP method
     * (a route for a specific method on the same path wins).
     */
    all(path: string, ...args: [...MiddlewareFn[], RouteHandler]): Application;
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
    mount(prefix: string, router: Router): Application;
    /**
     * Handle an incoming HTTP request.
     * This is the core request processing pipeline.
     */
    private handleRequest;
    /**
     * Find the route for a request, answering HEAD with the GET route when no
     * HEAD route exists (unless server.headFallback is false). Node omits the
     * body of HEAD responses, so the GET handler only contributes headers.
     */
    private matchRoute;
    /**
     * Methods that have a route for this path (for the 405 Allow header).
     */
    private allowedMethods;
    /**
     * Find a matching route across the main router and all mounted routers.
     */
    private findRoute;
    /**
     * Start the HTTP server and begin accepting requests.
     *
     * @returns Promise that resolves when server is listening
     */
    listen(port?: number, host?: string): Promise<{
        port: number;
        host: string;
    }>;
    /**
     * Node server options derived from the config.
     * server.timeout is the deadline for receiving a whole request (Node's
     * requestTimeout; slower clients get 408). Node checks it every
     * connectionsCheckingInterval (30 s by default), so that interval is
     * scaled down for short timeouts.
     */
    private serverOptions;
    /**
     * Stop the HTTP server gracefully.
     */
    close(): Promise<void>;
    getServer(): Server | null;
    /**
   * Print startup information banner.
   */
    private printBanner;
}
//# sourceMappingURL=application.d.ts.map