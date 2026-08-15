"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.Application = void 0;
const http_1 = require("http");
const common_1 = require("@axiljs/common");
const request_1 = require("./http/request");
const response_1 = require("./http/response");
const router_1 = require("./router/router");
const chain_1 = require("./middleware/chain");
const logger_1 = require("./middleware/logger");
const body_parser_1 = require("./middleware/body-parser");
class Application {
    // Configuration
    config;
    // The main router for this application
    router;
    // Global middleware (runs for every request)
    globalMiddleware;
    // Global error handlers (runs when middleware/handler throws)
    errorHandlers;
    // Child routers mounted at specific prefixes
    mountedRouters;
    // Node.js HTTP server instance
    server;
    constructor(config = {}) {
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
        this.router = new router_1.Router(this.config.prefix);
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
    registerBuiltins() {
        // Request logging (can be disabled via config)
        this.use((0, logger_1.requestLogger)(this.config.logging));
        // Body parsing for JSON, form data, etc.
        this.use((0, body_parser_1.bodyParser)());
    }
    // ─── Middleware Registration ─────────────────────────────────────────────────
    /**
     * Register global middleware or error handler.
     *
     * Usage:
     *   app.use(cors())
     *   app.use((err, req, res, next) => { ... }) // Error handler
     */
    use(middleware) {
        // Error handlers have 4 parameters - detect by function.length
        if (middleware.length === 4) {
            this.errorHandlers.push(middleware);
        }
        else {
            this.globalMiddleware.push(middleware);
        }
        return this;
    }
    // ─── Route Registration ──────────────────────────────────────────────────────
    get(path, ...args) {
        this.router.get(path, ...args);
        return this;
    }
    post(path, ...args) {
        this.router.post(path, ...args);
        return this;
    }
    put(path, ...args) {
        this.router.put(path, ...args);
        return this;
    }
    patch(path, ...args) {
        this.router.patch(path, ...args);
        return this;
    }
    delete(path, ...args) {
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
    mount(prefix, router) {
        this.mountedRouters.push({ prefix, router });
        return this;
    }
    // ─── Request Handling ────────────────────────────────────────────────────────
    /**
     * Handle an incoming HTTP request.
     * This is the core request processing pipeline.
     */
    async handleRequest(rawReq, rawRes) {
        // Create @axiljsJS request and response objects
        const req = new request_1.Request(rawReq);
        const res = new response_1.Response(rawRes);
        // Try to find a matching route
        const match = this.findRoute(req.method, req.path);
        if (!match) {
            // No route matched - 404
            const middleware = [...this.globalMiddleware];
            const notFoundHandler = () => {
                throw new common_1.NotFoundError(`Cannot ${req.method} ${req.path}`);
            };
            await chain_1.MiddlewareChain.execute(middleware, notFoundHandler, this.errorHandlers, req, res);
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
        await chain_1.MiddlewareChain.execute(middleware, match.handler, this.errorHandlers, req, res);
    }
    /**
     * Find a matching route across the main router and all mounted routers.
     */
    findRoute(method, path) {
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
            if (!path.startsWith(prefix))
                continue;
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
    async listen(port, host) {
        const listenPort = port || this.config.server?.port || 3000;
        const listenHost = host || this.config.server?.host || '0.0.0.0';
        return new Promise((resolve, reject) => {
            this.server = (0, http_1.createServer)(async (rawReq, rawRes) => {
                // Handle each request - catch any unhandled errors
                try {
                    await this.handleRequest(rawReq, rawRes);
                }
                catch (error) {
                    // Catastrophic error - send 500 if possible
                    if (!rawRes.headersSent) {
                        rawRes.writeHead(500, { 'Content-Type': 'application/json' });
                        rawRes.end(JSON.stringify({
                            error: {
                                code: 'INTERNAL_ERROR',
                                message: 'Internal server error'
                            }
                        }));
                    }
                }
            });
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
    async close() {
        return new Promise((resolve, reject) => {
            if (!this.server) {
                resolve();
                return;
            }
            this.server.close(err => {
                if (err)
                    reject(err);
                else
                    resolve();
            });
        });
    }
    /**
     * Print startup information banner.
     */
    printBanner(port, host) {
        const env = this.config.env || 'development';
        console.log('');
        console.log('\x1b[36m\x1b[1m ██████╗ ███████╗███████╗████████╗     ██╗███████╗\x1b[0m');
        console.log('\x1b[36m\x1b[1m ██╔══██╗██╔════╝██╔════╝╚══██╔══╝     ██║██╔════╝\x1b[0m');
        console.log('\x1b[36m\x1b[1m ██████╔╝█████╗  ███████╗   ██║        ██║███████╗\x1b[0m');
        console.log('\x1b[36m\x1b[1m ██╔══██╗██╔══╝  ╚════██║   ██║   ██   ██║╚════██║\x1b[0m');
        console.log('\x1b[36m\x1b[1m ██║  ██║███████╗███████║   ██║   ╚█████╔╝███████║\x1b[0m');
        console.log('\x1b[36m\x1b[1m ╚═╝  ╚═╝╚══════╝╚══════╝   ╚═╝    ╚════╝ ╚══════╝\x1b[0m');
        console.log('');
        console.log(`\x1b[1m @axiljsJS\x1b[0m \x1b[90mv0.1.0\x1b[0m`);
        console.log('');
        console.log(`  \x1b[32m✓\x1b[0m Server running`);
        console.log(`  \x1b[32m✓\x1b[0m http://${host}:${port}`);
        console.log(`  \x1b[32m✓\x1b[0m Environment: \x1b[33m${env}\x1b[0m`);
        console.log('');
    }
}
exports.Application = Application;
//# sourceMappingURL=application.js.map