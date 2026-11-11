/**
 * HTTP test client.
 * Makes requests to a running AxilJS application in tests.
 * No need to start an actual server - tests against the app directly.
 *
 * Usage:
 *   const client = createTestClient(app)
 *
 *   const res = await client.get('/users')
 *   expect(res.status).toBe(200)
 *   expect(res.body.data).toHaveLength(1)
 */
import { Application } from '@axiljs/core';
export interface TestResponse {
    status: number;
    headers: Record<string, string | string[]>;
    body: any;
    text: string;
}
/**
 * A pending request built by TestClient (get/post/…). Chain set/auth/send,
 * then await it for a TestResponse. Exported so helpers that return
 * `client.post(...)` can be declared in emitted .d.ts files.
 */
export declare class TestRequest implements PromiseLike<TestResponse> {
    private method;
    private path;
    private _headers;
    private _body;
    private _app;
    constructor(method: string, path: string, app: Application);
    /**
     * Set a request header.
     */
    set(name: string, value: string): this;
    /**
     * Set Authorization header with a Bearer token.
     */
    auth(token: string): this;
    /**
     * Set the request body.
     */
    send(body: unknown): this;
    /**
     * Make the request awaitable.
     * Allows: const res = await client.get('/users')
     */
    then<TResult1 = TestResponse, TResult2 = never>(resolve?: ((res: TestResponse) => TResult1 | PromiseLike<TResult1>) | null, reject?: ((err: any) => TResult2 | PromiseLike<TResult2>) | null): Promise<TResult1 | TResult2>;
    /**
     * Execute the request against the app.
     * Spins up a temporary server on a random port, makes the request, closes it.
     */
    private execute;
    /**
     * Make an HTTP request to the test server.
     */
    private makeRequest;
}
export declare class TestClient {
    private app;
    constructor(app: Application);
    get(path: string): TestRequest;
    post(path: string): TestRequest;
    put(path: string): TestRequest;
    patch(path: string): TestRequest;
    delete(path: string): TestRequest;
}
/**
 * Create a test client for an application.
 *
 * Usage:
 *   const client = createTestClient(app)
 *   const res = await client.get('/health')
 *   expect(res.status).toBe(200)
 */
export declare function createTestClient(app: Application): TestClient;
//# sourceMappingURL=test-client.d.ts.map