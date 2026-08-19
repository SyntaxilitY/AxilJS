"use strict";
/**
 * Axil ORM Studio Server
 * Runs alongside the dev server on port+1.
 * Opens automatically when axil run is used.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.StudioServer = void 0;
const http_1 = require("http");
const url_1 = require("url");
const route_collector_js_1 = require("./collectors/route-collector.js");
const db_collector_js_1 = require("./collectors/db-collector.js");
const postman_js_1 = require("./generators/postman.js");
const insomnia_js_1 = require("./generators/insomnia.js");
const template_js_1 = require("./ui/template.js");
// QR code generator — optional dep
async function generateQR(text) {
    try {
        const qrcode = await import('qrcode');
        return await qrcode.toDataURL(text, {
            width: 300,
            margin: 2,
            color: { dark: '#000000', light: '#ffffff' }
        });
    }
    catch {
        return '';
    }
}
class StudioServer {
    server = null;
    config;
    dbCollector = null;
    cachedData = null;
    lastRefresh = 0;
    cwd;
    constructor(config) {
        this.config = config;
        this.cwd = process.cwd();
    }
    setDriver(driver, driverType) {
        this.dbCollector = new db_collector_js_1.DbCollector(driver, driverType);
    }
    async start() {
        await this.refreshData();
        this.server = (0, http_1.createServer)((req, res) => this.handleRequest(req, res));
        await new Promise((resolve, reject) => {
            this.server.listen(this.config.port, this.config.host, () => resolve());
            this.server.on('error', reject);
        });
        const studioUrl = `http://${this.config.host}:${this.config.port}`;
        console.log(`\x1b[36m[AxilJS Studio]\x1b[0m \x1b[1mhttp://localhost:${this.config.port}\x1b[0m`);
        // Auto-open browser
        this.openBrowser(studioUrl);
    }
    async stop() {
        if (this.server) {
            await new Promise(resolve => this.server.close(() => resolve()));
            this.server = null;
        }
    }
    async refreshData() {
        const now = Date.now();
        // Cache for 5 seconds
        if (this.cachedData && now - this.lastRefresh < 5000) {
            return this.cachedData;
        }
        const routeCollector = new route_collector_js_1.RouteCollector(this.cwd);
        const { routes, websockets, sse } = routeCollector.collect();
        const tables = this.dbCollector
            ? await this.dbCollector.collectTables()
            : [];
        const appUrl = `http://localhost:${this.config.appPort}`;
        const studioUrl = `http://localhost:${this.config.port}`;
        this.cachedData = {
            appName: this.config.appName,
            appUrl,
            studioUrl,
            dbDriver: this.config.dbDriver ?? null,
            routes,
            websockets,
            sse,
            tables,
            startedAt: new Date().toISOString()
        };
        this.lastRefresh = now;
        return this.cachedData;
    }
    async handleRequest(req, res) {
        const url = new url_1.URL(req.url ?? '/', `http://localhost:${this.config.port}`);
        const path = url.pathname;
        const method = req.method ?? 'GET';
        // CORS headers for development
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        if (method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }
        try {
            // ── Studio UI ──────────────────────────────────────────────────
            if (path === '/' || path === '/studio') {
                const data = await this.refreshData();
                const appQR = await generateQR(data.appUrl);
                const html = (0, template_js_1.generateHTML)({
                    appName: data.appName,
                    appUrl: data.appUrl,
                    studioPort: this.config.port,
                    qrDataUrl: appQR
                });
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(html);
                return;
            }
            // ── Studio Data API ────────────────────────────────────────────
            if (path === '/api/studio/data') {
                const data = await this.refreshData();
                this.json(res, data);
                return;
            }
            // ── Table rows ─────────────────────────────────────────────────
            if (path.startsWith('/api/studio/table/')) {
                const tableName = decodeURIComponent(path.replace('/api/studio/table/', ''));
                const limit = Number(url.searchParams.get('limit') ?? 50);
                const offset = Number(url.searchParams.get('offset') ?? 0);
                if (!this.dbCollector) {
                    this.json(res, { rows: [], total: 0 });
                    return;
                }
                const result = await this.dbCollector.getTableRows(tableName, limit, offset);
                this.json(res, result);
                return;
            }
            // ── Export: Postman ────────────────────────────────────────────
            if (path === '/api/studio/export/postman') {
                const data = await this.refreshData();
                const collection = (0, postman_js_1.generatePostmanCollection)(data.appName, data.appUrl, data.routes);
                this.json(res, collection);
                return;
            }
            // ── Export: Insomnia ───────────────────────────────────────────
            if (path === '/api/studio/export/insomnia') {
                const data = await this.refreshData();
                const collection = (0, insomnia_js_1.generateInsomniaCollection)(data.appName, data.appUrl, data.routes);
                this.json(res, collection);
                return;
            }
            // ── Export: OpenAPI ────────────────────────────────────────────
            if (path === '/api/studio/export/openapi') {
                const data = await this.refreshData();
                const spec = this.generateOpenAPI(data);
                this.json(res, spec);
                return;
            }
            // ── 404 ────────────────────────────────────────────────────────
            res.writeHead(404);
            res.end('Not found');
        }
        catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
        }
    }
    json(res, data) {
        const body = JSON.stringify(data);
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body)
        });
        res.end(body);
    }
    generateOpenAPI(data) {
        const paths = {};
        for (const route of data.routes) {
            const oaPath = route.path.replace(/:(\w+)/g, '{$1}');
            if (!paths[oaPath])
                paths[oaPath] = {};
            const method = route.method.toLowerCase();
            const params = (route.path.match(/:(\w+)/g) ?? []).map(p => ({
                name: p.slice(1),
                in: 'path',
                required: true,
                schema: { type: 'string' }
            }));
            paths[oaPath][method] = {
                summary: `${route.method} ${route.path}`,
                tags: [route.path.split('/')[1] ?? 'default'],
                parameters: params,
                ...((['post', 'put', 'patch'].includes(method))
                    ? {
                        requestBody: {
                            required: true,
                            content: {
                                'application/json': {
                                    schema: { type: 'object' }
                                }
                            }
                        }
                    }
                    : {}),
                responses: {
                    '200': { description: 'Success' },
                    '400': { description: 'Bad Request' },
                    '401': { description: 'Unauthorized' },
                    '404': { description: 'Not Found' },
                    '500': { description: 'Internal Server Error' }
                },
                security: route.middleware.includes('authenticate')
                    ? [{ bearerAuth: [] }]
                    : []
            };
        }
        return {
            openapi: '3.0.3',
            info: {
                title: `${data.appName} API`,
                description: 'Generated by AxilJS Studio',
                version: '1.0.0'
            },
            servers: [{ url: data.appUrl, description: 'Development server' }],
            components: {
                securitySchemes: {
                    bearerAuth: {
                        type: 'http',
                        scheme: 'bearer',
                        bearerFormat: 'JWT'
                    }
                }
            },
            paths
        };
    }
    openBrowser(url) {
        const { execSync } = require('child_process');
        try {
            const cmd = process.platform === 'win32'
                ? `start "" "${url}"`
                : process.platform === 'darwin'
                    ? `open "${url}"`
                    : `xdg-open "${url}"`;
            execSync(cmd, { stdio: 'ignore' });
        }
        catch {
            // Ignore — browser open is best effort
        }
    }
}
exports.StudioServer = StudioServer;
//# sourceMappingURL=server.js.map