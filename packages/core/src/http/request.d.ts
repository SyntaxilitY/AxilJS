/**
 * @axilJS Request implementation.
 * Wraps Node.js IncomingMessage and provides a clean API.
 */
import { IncomingMessage } from 'http';
import { @axilRequest, HttpMethod, RouteParams, QueryParams } from '@axil/common';
export declare class Request implements @axilRequest {
    raw: IncomingMessage;
    method: HttpMethod;
    url: string;
    path: string;
    params: RouteParams;
    query: QueryParams;
    headers: Record<string, string | string[] | undefined>;
    body: unknown;
    ip: string;
    locals: Record<string, unknown>;
    constructor(raw: IncomingMessage);
    /**
     * Parse query string into key-value object.
     * Handles arrays: ?tag=js&tag=ts → { tag: ['js', 'ts'] }
     */
    private parseQuery;
    /**
     * Read the raw request body as a string.
     * Called internally by body parser middleware.
     */
    readBody(limit?: number): Promise<string>;
}
//# sourceMappingURL=request.d.ts.map