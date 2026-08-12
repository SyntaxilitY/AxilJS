/**
 * HTTP test client.
 * Makes requests to a running REstJS application in tests.
 * No need to start an actual server - tests against the app directly.
 *
 * Usage:
 *   const client = createTestClient(app)
 *
 *   const res = await client.get('/users')
 *   expect(res.status).toBe(200)
 *   expect(res.body.data).toHaveLength(1)
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { Application } from '@restjs/core';

// ─── Test Response ────────────────────────────────────────────────────────────

export interface TestResponse {
  // HTTP status code
  status: number;

  // Response headers
  headers: Record<string, string | string[]>;

  // Parsed JSON body (or raw string if not JSON)
  body: any;

  // Raw response text
  text: string;
}

// ─── Test Request Builder ─────────────────────────────────────────────────────

class TestRequest {
  private _headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  private _body: unknown;

  // Store app reference explicitly to avoid closure issues
  private _app: Application;

  constructor(
    private method: string,
    private path: string,
    app: Application
  ) {
    // Assign to private field explicitly - fixes TS2663
    this._app = app;
  }

  /**
   * Set a request header.
   */
  set(name: string, value: string): this {
    this._headers[name.toLowerCase()] = value;
    return this;
  }

  /**
   * Set Authorization header with a Bearer token.
   */
  auth(token: string): this {
    this._headers['authorization'] = `Bearer ${token}`;
    return this;
  }

  /**
   * Set the request body.
   */
  send(body: unknown): this {
    this._body = body;
    return this;
  }

  /**
   * Make the request awaitable.
   * Allows: const res = await client.get('/users')
   */
  then(
    resolve: (res: TestResponse) => void,
    reject: (err: Error) => void
  ): void {
    this.execute().then(resolve).catch(reject);
  }

  /**
   * Execute the request against the app.
   * Spins up a temporary server on a random port, makes the request, closes it.
   */
  private async execute(): Promise<TestResponse> {
    // Capture app reference for use inside callbacks
    const appInstance = this._app;

    return new Promise((resolve, reject) => {
      // Create a temporary server using the app's request handler
      const server = createServer(
        async (req: IncomingMessage, res: ServerResponse) => {
          try {
            // Call the app's internal handleRequest method
            await (appInstance as any).handleRequest(req, res);
          } catch (err) {
            if (!res.headersSent) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  error: {
                    code: 'INTERNAL_ERROR',
                    message: 'Internal Server Error'
                  }
                })
              );
            }
          }
        }
      );

      // Listen on port 0 = OS assigns a random available port
      server.listen(0, '127.0.0.1', () => {
        const address = server.address() as { port: number };

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
  private makeRequest(port: number): Promise<TestResponse> {
    return new Promise((resolve, reject) => {
      const bodyStr =
        this._body !== undefined ? JSON.stringify(this._body) : '';

      const headers: Record<string, string> = { ...this._headers };

      if (bodyStr) {
        headers['content-length'] = String(Buffer.byteLength(bodyStr));
      }

      // Use Node.js built-in http
      const http = require('http');

      const req = http.request(
        {
          host:    '127.0.0.1',
          port,
          path:    this.path,
          method:  this.method,
          headers
        },
        (res: IncomingMessage) => {
          let data = '';

          res.on('data', (chunk: Buffer) => {
            data += chunk.toString();
          });

          res.on('end', () => {
            let body: any = data;

            // Try to parse JSON response
            const contentType = (res.headers['content-type'] as string) || '';
            if (contentType.includes('application/json')) {
              try {
                body = JSON.parse(data);
              } catch {
                // Not valid JSON - keep as string
              }
            }

            resolve({
              status:  res.statusCode || 0,
              headers: res.headers as Record<string, string | string[]>,
              body,
              text:    data
            });
          });

          res.on('error', reject);
        }
      );

      req.on('error', reject);

      if (bodyStr) {
        req.write(bodyStr);
      }

      req.end();
    });
  }
}

// ─── Test Client ──────────────────────────────────────────────────────────────

export class TestClient {
  constructor(private app: Application) {}

  get(path: string): TestRequest {
    return new TestRequest('GET', path, this.app);
  }

  post(path: string): TestRequest {
    return new TestRequest('POST', path, this.app);
  }

  put(path: string): TestRequest {
    return new TestRequest('PUT', path, this.app);
  }

  patch(path: string): TestRequest {
    return new TestRequest('PATCH', path, this.app);
  }

  delete(path: string): TestRequest {
    return new TestRequest('DELETE', path, this.app);
  }
}

/**
 * Create a test client for an application.
 *
 * Usage:
 *   const client = createTestClient(app)
 *   const res = await client.get('/health')
 *   expect(res.status).toBe(200)
 */
export function createTestClient(app: Application): TestClient {
  return new TestClient(app);
}