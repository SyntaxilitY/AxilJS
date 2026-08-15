/**
 * AxilJS Response — wraps Node.js ServerResponse.
 *
 * Includes SyntaxilitY API Response Manager built-in.
 * Every response method automatically formats as:
 *
 *   {
 *     "status": 200,
 *     "code": "HTTP_200_OK",
 *     "message": "...",
 *     "data": { ... }
 *   }
 *
 * Developer just calls:
 *   res.success(data, 'message')
 *   res.created(data)
 *   res.paginated(items, total, page, limit)
 *   res.notFound('User not found')
 *   res.unauthorized()
 *   res.forbidden()
 *
 * No import needed. No configuration. Built into the framework.
 */
import { ServerResponse } from 'http';
import { axilResponse } from '@axil/common';
export declare class Response implements axilResponse {
    raw: ServerResponse;
    statusCode: number;
    sent: boolean;
    constructor(raw: ServerResponse);
    status(code: number): axilResponse;
    header(name: string, value: string): axilResponse;
    json(data: unknown): void;
    text(data: string): void;
    html(data: string): void;
    send(data: Buffer | string): void;
    redirect(url: string, code?: number): void;
    /**
     * Internal method — sends a standardized JSON response.
     * All SyntaxilitY response methods use this internally.
     */
    private sendResponse;
    /**
     * 200 OK
     *
     * res.success(users, 'Users fetched')
     *
     * → { status: 200, code: "HTTP_200_OK", message: "Users fetched", data: [...] }
     */
    success(data: unknown, message?: string): void;
    /**
     * 201 Created
     *
     * res.created(newUser, 'User created')
     *
     * → { status: 201, code: "HTTP_201_CREATED", message: "User created", data: {...} }
     */
    created(data: unknown, message?: string): void;
    /**
     * 204 No Content
     *
     * res.noContent()
     *
     * → { status: 204, code: "HTTP_204_NO_CONTENT", message: "No content", data: {} }
     */
    noContent(message?: string): void;
    /**
     * 200 OK with pagination — uses SyntaxilitY PaginationHelper format.
     *
     * res.paginated(users, 42, 1, 10, 'Users fetched')
     *
     * → {
     *     status: 200,
     *     code: "HTTP_200_OK",
     *     message: "Users fetched",
     *     data: {
     *       metadata: [...],
     *       pagination: {
     *         total: 42,
     *         page: 1,
     *         limit: 10,
     *         totalPages: 5,
     *         hasNextPage: true,
     *         hasPrevPage: false
     *       }
     *     }
     *   }
     */
    paginated(data: unknown[], total: number, page: number, limit: number, message?: string): void;
    /**
     * 400 Bad Request
     *
     * res.badRequest('Invalid input')
     */
    badRequest(message?: string, data?: unknown): void;
    /**
     * 401 Unauthorized
     *
     * res.unauthorized('Invalid token')
     */
    unauthorized(message?: string, data?: unknown): void;
    /**
     * 403 Forbidden
     *
     * res.forbidden('Admin access required')
     */
    forbidden(message?: string, data?: unknown): void;
    /**
     * 404 Not Found
     *
     * res.notFound('User not found')
     */
    notFound(message?: string, data?: unknown): void;
    /**
     * 405 Method Not Allowed
     */
    methodNotAllowed(message?: string, data?: unknown): void;
    /**
     * 406 Not Acceptable
     */
    notAcceptable(message?: string, data?: unknown): void;
    /**
     * 409 Conflict
     *
     * res.conflict('Email already exists')
     */
    conflict(message?: string, data?: unknown): void;
    /**
     * 415 Unsupported Media Type
     */
    unsupportedMediaType(message?: string, data?: unknown): void;
    /**
     * 422 Unprocessable Entity — Validation errors
     *
     * res.validationError('Validation failed')
     */
    validationError(message?: string, data?: unknown): void;
    /**
     * 429 Too Many Requests
     *
     * res.tooManyRequests('Rate limit exceeded')
     */
    tooManyRequests(message?: string, data?: unknown): void;
    /**
     * 500 Internal Server Error
     *
     * res.serverError('Database connection failed')
     */
    serverError(message?: string, data?: unknown): void;
    /**
     * 503 Service Unavailable
     *
     * res.serviceUnavailable('Service down for maintenance')
     */
    serviceUnavailable(message?: string, data?: unknown): void;
    /**
     * Extract pagination params from request query string.
     *
     * const { page, limit, skip } = Response.getPaginationParams(req)
     *
     * ?page=2&limit=20 → { page: 2, limit: 20, skip: 20 }
     * no params        → { page: 1, limit: 100, skip: 0 }
     */
    static getPaginationParams(req: {
        query: Record<string, string | string[] | undefined>;
    }): {
        page: number;
        limit: number;
        skip: number;
    };
}
//# sourceMappingURL=response.d.ts.map