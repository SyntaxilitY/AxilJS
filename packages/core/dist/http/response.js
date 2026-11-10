"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.Response = void 0;
class Response {
    raw;
    statusCode;
    sent;
    constructor(raw) {
        this.raw = raw;
        this.statusCode = 200;
        this.sent = false;
    }
    // ============================================================================
    // CORE HTTP METHODS
    // ============================================================================
    status(code) {
        this.statusCode = code;
        this.raw.statusCode = code;
        return this;
    }
    header(name, value) {
        this.raw.setHeader(name, value);
        return this;
    }
    json(data) {
        if (this.sent)
            return;
        // JSON.stringify(undefined) is undefined, which would crash below
        const body = JSON.stringify(data) ?? 'null';
        this.raw.setHeader('Content-Type', 'application/json; charset=utf-8');
        this.raw.setHeader('Content-Length', Buffer.byteLength(body));
        this.raw.end(body);
        this.sent = true;
    }
    text(data) {
        if (this.sent)
            return;
        this.raw.setHeader('Content-Type', 'text/plain; charset=utf-8');
        this.raw.setHeader('Content-Length', Buffer.byteLength(data));
        this.raw.end(data);
        this.sent = true;
    }
    html(data) {
        if (this.sent)
            return;
        this.raw.setHeader('Content-Type', 'text/html; charset=utf-8');
        this.raw.setHeader('Content-Length', Buffer.byteLength(data));
        this.raw.end(data);
        this.sent = true;
    }
    send(data) {
        if (this.sent)
            return;
        if (this.endWithoutBody())
            return;
        const buffer = typeof data === 'string'
            ? Buffer.from(data)
            : data;
        this.raw.setHeader('Content-Length', buffer.length);
        this.raw.end(buffer);
        this.sent = true;
    }
    redirect(url, code = 302) {
        if (this.sent)
            return;
        this.raw.writeHead(code, {
            Location: url
        });
        this.raw.end();
        this.sent = true;
    }
    /**
     * 204 / 304 responses must not carry a body or a body Content-Length
     * (RFC 9110 §15.3.5, §15.4.5). Node drops the body but would still send
     * the Content-Length header, so end the response bare instead.
     * Returns true if the response was ended here.
     */
    endWithoutBody() {
        const code = this.raw.statusCode;
        if (code !== 204 && code !== 304)
            return false;
        this.raw.removeHeader('Content-Length');
        this.raw.end();
        this.sent = true;
        return true;
    }
    // ============================================================================
    // INTERNAL STANDARD RESPONSE HANDLER
    // ============================================================================
    /**
     * Internal response formatter.
     *
     * All standardized response methods use this method.
     */
    sendResponse(statusCode, code, message, data = {}) {
        if (this.sent)
            return;
        this.statusCode = statusCode;
        this.raw.statusCode = statusCode;
        if (this.endWithoutBody())
            return;
        const body = JSON.stringify({
            status: statusCode,
            code,
            message,
            data
        });
        this.raw.setHeader('Content-Type', 'application/json; charset=utf-8');
        this.raw.setHeader('Content-Length', Buffer.byteLength(body));
        this.raw.end(body);
        this.sent = true;
    }
    // ============================================================================
    // AXILJS CONVENIENCE METHODS
    // ============================================================================
    /**
     * 200 OK
     *
     * res.success(users, 'Users fetched')
     */
    success(data = {}, message = 'Request successful') {
        this.sendResponse(200, 'HTTP_200_OK', message, data);
    }
    /**
     * 201 Created
     *
     * res.created(user, 'User created')
     */
    created(data = {}, message = 'Resource created successfully') {
        this.sendResponse(201, 'HTTP_201_CREATED', message, data);
    }
    /**
     * 204 No Content
     */
    noContent(message = 'No content') {
        this.sendResponse(204, 'HTTP_204_NO_CONTENT', message);
    }
    /**
     * Paginated response.
     */
    paginated(data, total, page, limit, message = 'Request successful') {
        const paginatedData = {
            metadata: data,
            pagination: {
                total,
                page,
                limit,
                // limit 0 (or negative) would give Infinity/negative page counts
                totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
                hasNextPage: limit > 0 && page * limit < total,
                hasPrevPage: page > 1
            }
        };
        this.sendResponse(200, 'HTTP_200_OK', message, paginatedData);
    }
    /**
     * 400 Bad Request
     */
    badRequest(message = 'Bad request', data = {}) {
        this.sendResponse(400, 'HTTP_400_BAD_REQUEST', message, data);
    }
    /**
     * 401 Unauthorized
     */
    unauthorized(message = 'Unauthorized access', data = {}) {
        this.sendResponse(401, 'HTTP_401_UNAUTHORIZED', message, data);
    }
    /**
     * 403 Forbidden
     */
    forbidden(message = 'Permission denied', data = {}) {
        this.sendResponse(403, 'HTTP_403_FORBIDDEN', message, data);
    }
    /**
     * 404 Not Found
     */
    notFound(message = 'Resource not found', data = {}) {
        this.sendResponse(404, 'HTTP_404_NOT_FOUND', message, data);
    }
    /**
     * 405 Method Not Allowed
     */
    methodNotAllowed(message = 'Method not allowed', data = {}) {
        this.sendResponse(405, 'HTTP_405_METHOD_NOT_ALLOWED', message, data);
    }
    /**
     * 406 Not Acceptable
     */
    notAcceptable(message = 'Not acceptable', data = {}) {
        this.sendResponse(406, 'HTTP_406_NOT_ACCEPTABLE', message, data);
    }
    /**
     * 409 Conflict
     */
    conflict(message = 'Resource conflict', data = {}) {
        this.sendResponse(409, 'HTTP_409_CONFLICT', message, data);
    }
    /**
     * 415 Unsupported Media Type
     */
    unsupportedMediaType(message = 'Unsupported media type', data = {}) {
        this.sendResponse(415, 'HTTP_415_UNSUPPORTED_MEDIA_TYPE', message, data);
    }
    /**
     * 422 Unprocessable Entity
     */
    validationError(message = 'Unprocessable entity', data = {}) {
        this.sendResponse(422, 'HTTP_422_UNPROCESSABLE_ENTITY', message, data);
    }
    /**
     * 429 Too Many Requests
     */
    tooManyRequests(message = 'Too many requests', data = {}) {
        this.sendResponse(429, 'HTTP_429_TOO_MANY_REQUESTS', message, data);
    }
    /**
     * 500 Internal Server Error
     */
    serverError(message = 'Internal server error', data = {}) {
        this.sendResponse(500, 'HTTP_500_INTERNAL_SERVER_ERROR', message, data);
    }
    /**
     * 503 Service Unavailable
     */
    serviceUnavailable(message = 'Service unavailable', data = {}) {
        this.sendResponse(503, 'HTTP_503_SERVICE_UNAVAILABLE', message, data);
    }
    // ============================================================================
    // SYNTAXILITY API RESPONSE MANAGER COMPATIBILITY METHODS
    // ============================================================================
    /**
     * HTTP 200 OK
     *
     * SyntaxilitY compatible:
     *
     * res.HTTP_200_OK(data, message)
     */
    HTTP_200_OK(data = {}, message = 'Request successful') {
        this.sendResponse(200, 'HTTP_200_OK', message, data);
    }
    /**
     * HTTP 201 Created
     *
     * res.HTTP_201_CREATED(data, message)
     */
    HTTP_201_CREATED(data = {}, message = 'Resource created successfully') {
        this.sendResponse(201, 'HTTP_201_CREATED', message, data);
    }
    /**
     * HTTP 400 Bad Request
     *
     * res.HTTP_400_BAD_REQUEST(message, data)
     */
    HTTP_400_BAD_REQUEST(message = 'Bad request', data = {}) {
        this.sendResponse(400, 'HTTP_400_BAD_REQUEST', message, data);
    }
    /**
     * HTTP 401 Unauthorized
     *
     * res.HTTP_401_UNAUTHORIZED(message, data)
     */
    HTTP_401_UNAUTHORIZED(message = 'Unauthorized access', data = {}) {
        this.sendResponse(401, 'HTTP_401_UNAUTHORIZED', message, data);
    }
    /**
     * HTTP 403 Forbidden
     *
     * res.HTTP_403_FORBIDDEN(message, data)
     */
    HTTP_403_FORBIDDEN(message = 'Permission denied', data = {}) {
        this.sendResponse(403, 'HTTP_403_FORBIDDEN', message, data);
    }
    /**
     * HTTP 404 Not Found
     *
     * res.HTTP_404_NOT_FOUND(message, data)
     */
    HTTP_404_NOT_FOUND(message = 'Resource not found', data = {}) {
        this.sendResponse(404, 'HTTP_404_NOT_FOUND', message, data);
    }
    /**
     * HTTP 409 Conflict
     *
     * res.HTTP_409_CONFLICT(message, data)
     */
    HTTP_409_CONFLICT(message = 'Resource conflict', data = {}) {
        this.sendResponse(409, 'HTTP_409_CONFLICT', message, data);
    }
    /**
     * HTTP 500 Internal Server Error
     *
     * res.HTTP_500_INTERNAL_SERVER_ERROR(message, data)
     */
    HTTP_500_INTERNAL_SERVER_ERROR(message = 'Internal server error', data = {}) {
        this.sendResponse(500, 'HTTP_500_INTERNAL_SERVER_ERROR', message, data);
    }
    /**
     * HTTP 503 Service Unavailable
     *
     * res.HTTP_503_SERVICE_UNAVAILABLE(message, data)
     */
    HTTP_503_SERVICE_UNAVAILABLE(message = 'Service unavailable', data = {}) {
        this.sendResponse(503, 'HTTP_503_SERVICE_UNAVAILABLE', message, data);
    }
    /**
     * HTTP 204 No Content
     *
     * res.HTTP_204_NO_CONTENT(message, data)
     */
    HTTP_204_NO_CONTENT(message = 'No content', data = {}) {
        this.sendResponse(204, 'HTTP_204_NO_CONTENT', message, data);
    }
    /**
     * HTTP 405 Method Not Allowed
     *
     * res.HTTP_405_METHOD_NOT_ALLOWED(message, data)
     */
    HTTP_405_METHOD_NOT_ALLOWED(message = 'Method not allowed', data = {}) {
        this.sendResponse(405, 'HTTP_405_METHOD_NOT_ALLOWED', message, data);
    }
    /**
     * HTTP 406 Not Acceptable
     *
     * res.HTTP_406_NOT_ACCEPTABLE(message, data)
     */
    HTTP_406_NOT_ACCEPTABLE(message = 'Not acceptable', data = {}) {
        this.sendResponse(406, 'HTTP_406_NOT_ACCEPTABLE', message, data);
    }
    /**
     * HTTP 415 Unsupported Media Type
     *
     * res.HTTP_415_UNSUPPORTED_MEDIA_TYPE(message, data)
     */
    HTTP_415_UNSUPPORTED_MEDIA_TYPE(message = 'Unsupported media type', data = {}) {
        this.sendResponse(415, 'HTTP_415_UNSUPPORTED_MEDIA_TYPE', message, data);
    }
    /**
     * HTTP 429 Too Many Requests
     *
     * res.HTTP_429_TOO_MANY_REQUESTS(message, data)
     */
    HTTP_429_TOO_MANY_REQUESTS(message = 'Too many requests', data = {}) {
        this.sendResponse(429, 'HTTP_429_TOO_MANY_REQUESTS', message, data);
    }
    /**
     * HTTP 422 Unprocessable Entity
     *
     * res.HTTP_422_UNPROCESSABLE_ENTITY(message, data)
     */
    HTTP_422_UNPROCESSABLE_ENTITY(message = 'Unprocessable entity', data = {}) {
        this.sendResponse(422, 'HTTP_422_UNPROCESSABLE_ENTITY', message, data);
    }
    // ============================================================================
    // PAGINATION HELPER
    // ============================================================================
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
    static getPaginationParams(req) {
        const page = parseInt(String(req.query.page || '1'), 10) || 1;
        const limit = parseInt(String(req.query.limit || '100'), 10) || 100;
        const skip = (page - 1) * limit;
        return {
            page,
            limit,
            skip
        };
    }
}
exports.Response = Response;
//# sourceMappingURL=response.js.map