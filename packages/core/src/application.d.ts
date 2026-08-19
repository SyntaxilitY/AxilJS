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
import { Server } from 'http';
import { AppConfig, MiddlewareFn, ErrorMiddlewareFn, RouteHandler } from '@axiljs/common';
import { Router } from './router/router';
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