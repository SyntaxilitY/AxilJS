/**
 * AxilJS Response
 *
 * Wraps Node.js ServerResponse and provides:
 *
 * 1. Core HTTP response methods
 * 2. AxilJS convenience response methods
 * 3. SyntaxilitY API Response Manager compatible methods
 * 4. Pagination helpers
 *
 * Standard response format:
 *
 * {
 *   status: 200,
 *   code: "HTTP_200_OK",
 *   message: "Request successful",
 *   data: {}
 * }
 */
import { ServerResponse } from 'http';
import { axilResponse } from '@axiljs/common';
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
     * 204 / 304 responses must not carry a body or a body Content-Length
     * (RFC 9110 §15.3.5, §15.4.5). Node drops the body but would still send
     * the Content-Length header, so end the response bare instead.
     * Returns true if the response was ended here.
     */
    private endWithoutBody;
    /**
     * Internal response formatter.
     *
     * All standardized response methods use this method.
     */
    private sendResponse;
    /**
     * 200 OK
     *
     * res.success(users, 'Users fetched')
     */
    success(data?: unknown, message?: string): void;
    /**
     * 201 Created
     *
     * res.created(user, 'User created')
     */
    created(data?: unknown, message?: string): void;
    /**
     * 204 No Content
     */
    noContent(message?: string): void;
    /**
     * Paginated response.
     */
    paginated(data: unknown[], total: number, page: number, limit: number, message?: string): void;
    /**
     * 400 Bad Request
     */
    badRequest(message?: string, data?: unknown): void;
    /**
     * 401 Unauthorized
     */
    unauthorized(message?: string, data?: unknown): void;
    /**
     * 403 Forbidden
     */
    forbidden(message?: string, data?: unknown): void;
    /**
     * 404 Not Found
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
     */
    conflict(message?: string, data?: unknown): void;
    /**
     * 415 Unsupported Media Type
     */
    unsupportedMediaType(message?: string, data?: unknown): void;
    /**
     * 422 Unprocessable Entity
     */
    validationError(message?: string, data?: unknown): void;
    /**
     * 429 Too Many Requests
     */
    tooManyRequests(message?: string, data?: unknown): void;
    /**
     * 500 Internal Server Error
     */
    serverError(message?: string, data?: unknown): void;
    /**
     * 503 Service Unavailable
     */
    serviceUnavailable(message?: string, data?: unknown): void;
    /**
     * HTTP 200 OK
     *
     * SyntaxilitY compatible:
     *
     * res.HTTP_200_OK(data, message)
     */
    HTTP_200_OK(data?: unknown, message?: string): void;
    /**
     * HTTP 201 Created
     *
     * res.HTTP_201_CREATED(data, message)
     */
    HTTP_201_CREATED(data?: unknown, message?: string): void;
    /**
     * HTTP 400 Bad Request
     *
     * res.HTTP_400_BAD_REQUEST(message, data)
     */
    HTTP_400_BAD_REQUEST(message?: string, data?: unknown): void;
    /**
     * HTTP 401 Unauthorized
     *
     * res.HTTP_401_UNAUTHORIZED(message, data)
     */
    HTTP_401_UNAUTHORIZED(message?: string, data?: unknown): void;
    /**
     * HTTP 403 Forbidden
     *
     * res.HTTP_403_FORBIDDEN(message, data)
     */
    HTTP_403_FORBIDDEN(message?: string, data?: unknown): void;
    /**
     * HTTP 404 Not Found
     *
     * res.HTTP_404_NOT_FOUND(message, data)
     */
    HTTP_404_NOT_FOUND(message?: string, data?: unknown): void;
    /**
     * HTTP 409 Conflict
     *
     * res.HTTP_409_CONFLICT(message, data)
     */
    HTTP_409_CONFLICT(message?: string, data?: unknown): void;
    /**
     * HTTP 500 Internal Server Error
     *
     * res.HTTP_500_INTERNAL_SERVER_ERROR(message, data)
     */
    HTTP_500_INTERNAL_SERVER_ERROR(message?: string, data?: unknown): void;
    /**
     * HTTP 503 Service Unavailable
     *
     * res.HTTP_503_SERVICE_UNAVAILABLE(message, data)
     */
    HTTP_503_SERVICE_UNAVAILABLE(message?: string, data?: unknown): void;
    /**
     * HTTP 204 No Content
     *
     * res.HTTP_204_NO_CONTENT(message, data)
     */
    HTTP_204_NO_CONTENT(message?: string, data?: unknown): void;
    /**
     * HTTP 405 Method Not Allowed
     *
     * res.HTTP_405_METHOD_NOT_ALLOWED(message, data)
     */
    HTTP_405_METHOD_NOT_ALLOWED(message?: string, data?: unknown): void;
    /**
     * HTTP 406 Not Acceptable
     *
     * res.HTTP_406_NOT_ACCEPTABLE(message, data)
     */
    HTTP_406_NOT_ACCEPTABLE(message?: string, data?: unknown): void;
    /**
     * HTTP 415 Unsupported Media Type
     *
     * res.HTTP_415_UNSUPPORTED_MEDIA_TYPE(message, data)
     */
    HTTP_415_UNSUPPORTED_MEDIA_TYPE(message?: string, data?: unknown): void;
    /**
     * HTTP 429 Too Many Requests
     *
     * res.HTTP_429_TOO_MANY_REQUESTS(message, data)
     */
    HTTP_429_TOO_MANY_REQUESTS(message?: string, data?: unknown): void;
    /**
     * HTTP 422 Unprocessable Entity
     *
     * res.HTTP_422_UNPROCESSABLE_ENTITY(message, data)
     */
    HTTP_422_UNPROCESSABLE_ENTITY(message?: string, data?: unknown): void;
    /**
     * Extract pagination params from request query string.
     *
     * ?page=2&limit=20
     *
     * {
     *   page: 2,
     *   limit: 20,
     *   skip: 20
     * }
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