"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.Application = void 0;
exports.parseByteSize = parseByteSize;
const http_1 = require("http");
const common_1 = require("@axiljs/common");
const request_1 = require("./http/request");
const response_1 = require("./http/response");
const router_1 = require("./router/router");
const chain_1 = require("./middleware/chain");
const logger_1 = require("./middleware/logger");
const body_parser_1 = require("./middleware/body-parser");
// Methods probed when building the Allow header of a 405 response
const KNOWN_METHODS = [
    'GET',
    'HEAD',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
    'OPTIONS'
];
/**
 * Parse a size such as '1mb', '512kb', '100b' or '2048' into bytes.
 * @internal
 */
function parseByteSize(size) {
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
    const units = {
        b: 1,
        kb: 1024,
        mb: 1024 * 1024,
        gb: 1024 * 1024 * 1024
    };
    return Math.floor(parseFloat(match[1]) * units[(match[2] || 'b').toLowerCase()]);
}
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
        // Body parsing for JSON, form data, etc. (server.bodyLimit, default 1 MB)
        const bodyLimit = this.config.server?.bodyLimit;
        this.use((0, body_parser_1.bodyParser)(bodyLimit !== undefined ? parseByteSize(bodyLimit) : undefined));
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
    head(path, ...args) {
        this.router.head(path, ...args);
        return this;
    }
    options(path, ...args) {
        this.router.options(path, ...args);
        return this;
    }
    /**
     * Register a route for every HTTP method
     * (a route for a specific method on the same path wins).
     */
    all(path, ...args) {
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
        // Create AxilJS request and response objects
        const req = new request_1.Request(rawReq, {
            trustProxy: this.config.server?.trustProxy
        });
        const res = new response_1.Response(rawRes);
        // Try to find a matching route
        const match = this.matchRoute(req.method, req.path);
        if (!match) {
            // No route matched - 404, or 405 when enabled and only the method differs
            const middleware = [...this.globalMiddleware];
            const allowed = this.config.server?.methodNotAllowed
                ? this.allowedMethods(req.path)
                : [];
            const notFoundHandler = (req, res) => {
                if (allowed.length > 0) {
                    res.header('Allow', allowed.join(', '));
                    // OPTIONS on a known path: answer with the allowed methods
                    if (req.method === 'OPTIONS') {
                        res.status(204).send('');
                        return;
                    }
                    throw new common_1.axilError(`Method ${req.method} not allowed for ${req.path}`, 405, 'METHOD_NOT_ALLOWED');
                }
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
     * Find the route for a request, answering HEAD with the GET route when no
     * HEAD route exists (unless server.headFallback is false). Node omits the
     * body of HEAD responses, so the GET handler only contributes headers.
     */
    matchRoute(method, path) {
        const match = this.findRoute(method, path);
        if (match || method !== 'HEAD' || this.config.server?.headFallback === false) {
            return match;
        }
        return this.findRoute('GET', path);
    }
    /**
     * Methods that have a route for this path (for the 405 Allow header).
     */
    allowedMethods(path) {
        return KNOWN_METHODS.filter(method => this.matchRoute(method, path));
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
            // Only try routers where path is under the prefix on a segment
            // boundary ('/users' must not match '/usersettings')
            const base = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
            if (base && path !== base && !path.startsWith(base + '/'))
                continue;
            // Routers are usually defined relative to the mount point
            // (router.get('/:id') mounted at '/users'), so match the path with
            // the prefix removed; fall back to the full path for routers that
            // were created with the prefix baked in (new Router('/users')).
            const relative = path.slice(base.length) || '/';
            const match = router.match(method, relative) || router.match(method, path);
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
        // ?? so port 0 (pick a free port) is honoured
        const listenPort = port ?? this.config.server?.port ?? 3000;
        const listenHost = host || this.config.server?.host || '0.0.0.0';
        return new Promise((resolve, reject) => {
            this.server = (0, http_1.createServer)(this.serverOptions(), async (rawReq, rawRes) => {
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
                // Report the bound port (differs from listenPort when it was 0)
                const address = this.server?.address();
                const boundPort = address && typeof address === 'object' ? address.port : listenPort;
                // Print startup banner
                this.printBanner(boundPort, listenHost);
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
    serverOptions() {
        const timeout = this.config.server?.timeout;
        if (timeout === undefined || !Number.isFinite(timeout) || timeout < 0) {
            return {};
        }
        if (timeout === 0)
            return { requestTimeout: 0 };
        return {
            requestTimeout: timeout,
            // Node requires headersTimeout <= requestTimeout (default 60 s)
            headersTimeout: Math.min(timeout, 60000),
            connectionsCheckingInterval: Math.max(10, Math.min(30000, Math.floor(timeout / 2)))
        };
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
    getServer() {
        return this.server;
    }
    /**
   * Print startup information banner.
   */
    printBanner(port, host) {
        const env = this.config.env || 'development';
        console.log('');
        console.log('\x1b[36m\x1b[1m  █████╗ ██╗  ██╗██╗██╗          ██╗███████╗\x1b[0m');
        console.log('\x1b[36m\x1b[1m ██╔══██╗╚██╗██╔╝██║██║          ██║██╔════╝\x1b[0m');
        console.log('\x1b[36m\x1b[1m ███████║ ╚███╔╝ ██║██║          ██║███████╗\x1b[0m');
        console.log('\x1b[36m\x1b[1m ██╔══██║ ██╔██╗ ██║██║     ██   ██║╚════██║\x1b[0m');
        console.log('\x1b[36m\x1b[1m ██║  ██║██╔╝ ██╗██║███████╗╚█████╔╝███████║\x1b[0m');
        console.log('\x1b[36m\x1b[1m ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝╚══════╝ ╚════╝ ╚══════╝\x1b[0m');
        console.log('');
        console.log(`\x1b[1m AxilJS\x1b[0m \x1b[90mv0.1.0\x1b[0m`);
        console.log('');
        console.log(`  \x1b[32m✓\x1b[0m Server running`);
        console.log(`  \x1b[32m✓\x1b[0m http://${host}:${port}`);
        console.log(`  \x1b[32m✓\x1b[0m Environment: \x1b[33m${env}\x1b[0m`);
        console.log('');
    }
}
exports.Application = Application;
//# sourceMappingURL=application.js.map