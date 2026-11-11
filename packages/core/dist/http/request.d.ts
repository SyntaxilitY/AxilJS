/**
 * AxilJS Request implementation.
 * Wraps Node.js IncomingMessage and provides a clean API.
 */
import { IncomingMessage } from 'http';
import { axilRequest, HttpMethod, RouteParams, QueryParams, TrustProxy } from '@axiljs/common';
/** Options for building a Request. */
export interface RequestOptions {
    trustProxy?: TrustProxy;
}
/**
 * Decode a query-string / form-urlencoded component.
 * '+' means space; malformed %-escapes are kept as-is instead of throwing.
 * @internal
 */
export declare function safeDecode(str: string): string;
/**
 * Derive the client address from the socket and X-Forwarded-For.
 * @internal
 */
export declare function resolveClientIp(raw: IncomingMessage, trustProxy: TrustProxy): string;
export declare class Request implements axilRequest {
    raw: IncomingMessage;
    method: HttpMethod;
    url: string;
    path: string;
    params: RouteParams;
    query: QueryParams;
    headers: Record<string, string | string[] | undefined>;
    body: unknown;
    rawBody: string | undefined;
    ip: string;
    locals: Record<string, unknown>;
    constructor(raw: IncomingMessage, options?: RequestOptions);
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