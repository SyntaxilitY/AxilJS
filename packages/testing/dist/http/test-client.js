"use strict";
/**
 * HTTP test client.
 * Makes requests to a running @axilJS application in tests.
 * No need to start an actual server - tests against the app directly.
 *
 * Usage:
 *   const client = createTestClient(app)
 *
 *   const res = await client.get('/users')
 *   expect(res.status).toBe(200)
 *   expect(res.body.data).toHaveLength(1)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestClient = void 0;
exports.createTestClient = createTestClient;
const http_1 = require("http");
// ─── Test Request Builder ─────────────────────────────────────────────────────
class TestRequest {
    method;
    path;
    _headers = {
        'Content-Type': 'application/json'
    };
    _body;
    // Store app reference explicitly to avoid closure issues
    _app;
    constructor(method, path, app) {
        this.method = method;
        this.path = path;
        // Assign to private field explicitly - fixes TS2663
        this._app = app;
    }
    /**
     * Set a request header.
     */
    set(name, value) {
        this._headers[name.toLowerCase()] = value;
        return this;
    }
    /**
     * Set Authorization header with a Bearer token.
     */
    auth(token) {
        this._headers['authorization'] = `Bearer ${token}`;
        return this;
    }
    /**
     * Set the request body.
     */
    send(body) {
        this._body = body;
        return this;
    }
    /**
     * Make the request awaitable.
     * Allows: const res = await client.get('/users')
     */
    then(resolve, reject) {
        this.execute().then(resolve).catch(reject);
    }
    /**
     * Execute the request against the app.
     * Spins up a temporary server on a random port, makes the request, closes it.
     */
    async execute() {
        // Capture app reference for use inside callbacks
        const appInstance = this._app;
        return new Promise((resolve, reject) => {
            // Create a temporary server using the app's request handler
            const server = (0, http_1.createServer)(async (req, res) => {
                try {
                    // Call the app's internal handleRequest method
                    await appInstance.handleRequest(req, res);
                }
                catch (err) {
                    if (!res.headersSent) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({
                            error: {
                                code: 'INTERNAL_ERROR',
                                message: 'Internal Server Error'
                            }
                        }));
                    }
                }
            });
            // Listen on port 0 = OS assigns a random available port
            server.listen(0, '127.0.0.1', () => {
                const address = server.address();
                this.makeRequest(address.port)
                    .then(response => {
                    server.close();
                    resolve(response);
                })
                    .catch(err => {
                    server.close();
                    reject(err);
                });
            });
            server.on('error', reject);
        });
    }
    /**
     * Make an HTTP request to the test server.
     */
    makeRequest(port) {
        return new Promise((resolve, reject) => {
            const bodyStr = this._body !== undefined ? JSON.stringify(this._body) : '';
            const headers = { ...this._headers };
            if (bodyStr) {
                headers['content-length'] = String(Buffer.byteLength(bodyStr));
            }
            // Use Node.js built-in http
            const http = require('http');
            const req = http.request({
                host: '127.0.0.1',
                port,
                path: this.path,
                method: this.method,
                headers
            }, (res) => {
                let data = '';
                res.on('data', (chunk) => {
                    data += chunk.toString();
                });
                res.on('end', () => {
                    let body = data;
                    // Try to parse JSON response
                    const contentType = res.headers['content-type'] || '';
                    if (contentType.includes('application/json')) {
                        try {
                            body = JSON.parse(data);
                        }
                        catch {
                            // Not valid JSON - keep as string
                        }
                    }
                    resolve({
                        status: res.statusCode || 0,
                        headers: res.headers,
                        body,
                        text: data
                    });
                });
                res.on('error', reject);
            });
            req.on('error', reject);
            if (bodyStr) {
                req.write(bodyStr);
            }
            req.end();
        });
    }
}
// ─── Test Client ──────────────────────────────────────────────────────────────
class TestClient {
    app;
    constructor(app) {
        this.app = app;
    }
    get(path) {
        return new TestRequest('GET', path, this.app);
    }
    post(path) {
        return new TestRequest('POST', path, this.app);
    }
    put(path) {
        return new TestRequest('PUT', path, this.app);
    }
    patch(path) {
        return new TestRequest('PATCH', path, this.app);
    }
    delete(path) {
        return new TestRequest('DELETE', path, this.app);
    }
}
exports.TestClient = TestClient;
/**
 * Create a test client for an application.
 *
 * Usage:
 *   const client = createTestClient(app)
 *   const res = await client.get('/health')
 *   expect(res.status).toBe(200)
 */
function createTestClient(app) {
    return new TestClient(app);
}
//# sourceMappingURL=test-client.js.map