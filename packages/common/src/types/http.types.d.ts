/**
 * Core HTTP types used across the entire REstJS ecosystem.
 * These are the foundation - every request and response uses these.
 */
import { IncomingMessage, ServerResponse } from 'http';
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS';
export type RouteParams = Record<string, string>;
export type QueryParams = Record<string, string | string[]>;
/**
 * REstJS Request - wraps Node's IncomingMessage with useful additions.
 * Developers work with this, never raw IncomingMessage.
 */
export interface REstRequest {
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
}
/**
 * REstJS Response - wraps Node's ServerResponse with a fluent API.
 * Chain methods: res.status(200).json({ ok: true })
 */
export interface REstResponse {
    raw: ServerResponse;
    status(code: number): REstResponse;
    header(name: string, value: string): REstResponse;
    json(data: unknown): void;
    text(data: string): void;
    html(data: string): void;
    send(data: Buffer | string): void;
    redirect(url: string, code?: number): void;
    sent: boolean;
    statusCode: number;
}
/**
 * Middleware function signature.
 * Call next() to pass to next middleware.
 * Call next(error) to pass to error handler.
 */
export type MiddlewareFn = (req: REstRequest, res: REstResponse, next: (error?: Error) => void) => void | Promise<void>;
/**
 * Error handling middleware - receives the error as first argument.
 */
export type ErrorMiddlewareFn = (error: Error, req: REstRequest, res: REstResponse, next: (error?: Error) => void) => void | Promise<void>;
/**
 * Final handler for a matched route.
 * Unlike middleware, it does not receive next().
 */
export type RouteHandler = (req: REstRequest, res: REstResponse) => void | Promise<void>;
//# sourceMappingURL=http.types.d.ts.map