"use strict";
/**
 * Collects route information from AxilJS app source files.
 * Scans src/ directory for route definitions.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RouteCollector = void 0;
const fs_1 = require("fs");
const path_1 = require("path");
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];
class RouteCollector {
    cwd;
    constructor(cwd) {
        this.cwd = cwd;
    }
    collect() {
        const routes = [];
        const websockets = [];
        const sse = [];
        const srcDir = (0, path_1.join)(this.cwd, 'src');
        if (!(0, fs_1.existsSync)(srcDir)) {
            return { routes, websockets, sse };
        }
        const files = this.scanFiles(srcDir);
        for (const file of files) {
            try {
                const content = (0, fs_1.readFileSync)(file, 'utf-8');
                this.extractRoutes(content, routes);
                this.extractWebSockets(content, websockets);
                this.extractSSE(content, sse);
            }
            catch {
                // Skip unreadable files
            }
        }
        // Deduplicate routes
        const seen = new Set();
        return {
            routes: routes.filter(r => {
                const key = `${r.method}:${r.path}`;
                if (seen.has(key))
                    return false;
                seen.add(key);
                return true;
            }),
            websockets,
            sse
        };
    }
    scanFiles(dir) {
        const results = [];
        try {
            const items = (0, fs_1.readdirSync)(dir, { withFileTypes: true });
            for (const item of items) {
                if (item.name === 'node_modules')
                    continue;
                const full = (0, path_1.join)(dir, item.name);
                if (item.isDirectory()) {
                    results.push(...this.scanFiles(full));
                }
                else if (item.name.endsWith('.ts') || item.name.endsWith('.js')) {
                    results.push(full);
                }
            }
        }
        catch {
            // Skip
        }
        return results;
    }
    extractRoutes(content, routes) {
        // Match: app.get('/path', handler)
        // Match: router.post('/path', middleware, handler)
        // Match: this.register(app) patterns
        const pattern = new RegExp(`(?:app|router|this)\\.(${HTTP_METHODS.join('|')})\\s*\\(\\s*['"\`]([^'"\`]+)['"\`]`, 'gi');
        let match;
        while ((match = pattern.exec(content)) !== null) {
            const method = match[1].toUpperCase();
            const path = match[2];
            // Skip obviously wrong matches
            if (path.length > 200)
                continue;
            if (!path.startsWith('/'))
                continue;
            routes.push({
                method,
                path,
                handler: this.extractHandlerName(content, match.index),
                middleware: this.extractMiddleware(content, match.index)
            });
        }
    }
    extractWebSockets(content, websockets) {
        // Match: new WSServer(httpServer, { path: '/ws' })
        const pathPattern = /WSServer\s*\([^)]+path\s*:\s*['"`]([^'"`]+)['"`]/g;
        let match;
        while ((match = pathPattern.exec(content)) !== null) {
            const existing = websockets.find(w => w.path === match[1]);
            if (!existing) {
                websockets.push({
                    path: match[1],
                    events: this.extractWSEvents(content)
                });
            }
        }
    }
    extractWSEvents(content) {
        const events = [];
        // Match: wss.on('connection') or client.on('message')
        const pattern = /\.on\s*\(\s*['"`]([^'"`]+)['"`]/g;
        let match;
        while ((match = pattern.exec(content)) !== null) {
            if (!events.includes(match[1])) {
                events.push(match[1]);
            }
        }
        return events;
    }
    extractSSE(content, sse) {
        // Match: res.sse() or text/event-stream
        if (content.includes('text/event-stream') ||
            content.includes('res.sse') ||
            content.includes('SSEStream')) {
            // Try to find path
            const pathPattern = /['"`](\/[^'"`]*(?:stream|sse|events)[^'"`]*)['"`]/gi;
            let match;
            while ((match = pathPattern.exec(content)) !== null) {
                if (!sse.find(s => s.path === match[1])) {
                    sse.push({ path: match[1], events: ['message', 'error', 'close'] });
                }
            }
        }
    }
    extractHandlerName(content, index) {
        // Try to find the function name after the route path
        const slice = content.slice(index, index + 300);
        const match = slice.match(/,\s*(?:async\s+)?(?:(?:\w+\s*,\s*)*)((?:\w+\.)*\w+)\s*(?:\)|as)/);
        return match ? match[1] : 'anonymous';
    }
    extractMiddleware(content, index) {
        const middleware = [];
        const slice = content.slice(index, index + 300);
        if (slice.includes('authenticate') || slice.includes('auth')) {
            middleware.push('authenticate');
        }
        if (slice.includes('validate') || slice.includes('Validate')) {
            middleware.push('validate');
        }
        if (slice.includes('rateLimit') || slice.includes('throttle')) {
            middleware.push('rateLimit');
        }
        if (slice.includes('cors')) {
            middleware.push('cors');
        }
        return middleware;
    }
}
exports.RouteCollector = RouteCollector;
//# sourceMappingURL=route-collector.js.map