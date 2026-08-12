/**
 * REstJS Response implementation.
 * Wraps Node.js ServerResponse with a fluent, developer-friendly API.
 */
import { ServerResponse } from 'http';
import { REstResponse } from '@restjs/common';
export declare class Response implements REstResponse {
    raw: ServerResponse;
    statusCode: number;
    sent: boolean;
    constructor(raw: ServerResponse);
    /**
     * Set HTTP status code.
     * Returns this for chaining: res.status(404).json({ error: 'Not found' })
     */
    status(code: number): REstResponse;
    /**
     * Set a response header.
     * Returns this for chaining: res.header('X-Custom', 'value').json({})
     */
    header(name: string, value: string): REstResponse;
    /**
     * Send a JSON response.
     * Automatically sets Content-Type to application/json.
     */
    json(data: unknown): void;
    /**
     * Send a plain text response.
     */
    text(data: string): void;
    /**
     * Send an HTML response.
     */
    html(data: string): void;
    /**
     * Send a raw buffer or string response.
     * Content-Type must be set manually before calling this.
     */
    send(data: Buffer | string): void;
    /**
     * Redirect to another URL.
     * Default status code is 302 (temporary redirect).
     */
    redirect(url: string, code?: number): void;
}
//# sourceMappingURL=response.d.ts.map