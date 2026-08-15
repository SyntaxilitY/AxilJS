"use strict";
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
    // ═══════════════════════════════════════════════════════════════════════════
    // CORE METHODS — unchanged from original
    // ═══════════════════════════════════════════════════════════════════════════
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
        const body = JSON.stringify(data);
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
        const buffer = typeof data === 'string' ? Buffer.from(data) : data;
        this.raw.setHeader('Content-Length', buffer.length);
        this.raw.end(buffer);
        this.sent = true;
    }
    redirect(url, code = 302) {
        if (this.sent)
            return;
        this.raw.writeHead(code, { Location: url });
        this.raw.end();
        this.sent = true;
    }
    // ═══════════════════════════════════════════════════════════════════════════
    // SYNTAXILITY API RESPONSE MANAGER — built into the framework
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * Internal method — sends a standardized JSON response.
     * All SyntaxilitY response methods use this internally.
     */
    sendResponse(statusCode, code, message, data = {}) {
        if (this.sent)
            return;
        this.statusCode = statusCode;
        this.raw.statusCode = statusCode;
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
    // ── Success Responses ───────────────────────────────────────────────────────
    /**
     * 200 OK
     *
     * res.success(users, 'Users fetched')
     *
     * → { status: 200, code: "HTTP_200_OK", message: "Users fetched", data: [...] }
     */
    success(data, message = 'Request successful') {
        this.sendResponse(200, 'HTTP_200_OK', message, data);
    }
    /**
     * 201 Created
     *
     * res.created(newUser, 'User created')
     *
     * → { status: 201, code: "HTTP_201_CREATED", message: "User created", data: {...} }
     */
    created(data, message = 'Resource created successfully') {
        this.sendResponse(201, 'HTTP_201_CREATED', message, data);
    }
    /**
     * 204 No Content
     *
     * res.noContent()
     *
     * → { status: 204, code: "HTTP_204_NO_CONTENT", message: "No content", data: {} }
     */
    noContent(message = 'No content') {
        this.sendResponse(204, 'HTTP_204_NO_CONTENT', message);
    }
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
    paginated(data, total, page, limit, message = 'Request successful') {
        const paginatedData = {
            metadata: data,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
                hasNextPage: page * limit < total,
                hasPrevPage: page > 1
            }
        };
        this.sendResponse(200, 'HTTP_200_OK', message, paginatedData);
    }
    // ── Error Responses ─────────────────────────────────────────────────────────
    /**
     * 400 Bad Request
     *
     * res.badRequest('Invalid input')
     */
    badRequest(message = 'Bad request', data = {}) {
        this.sendResponse(400, 'HTTP_400_BAD_REQUEST', message, data);
    }
    /**
     * 401 Unauthorized
     *
     * res.unauthorized('Invalid token')
     */
    unauthorized(message = 'Unauthorized access', data = {}) {
        this.sendResponse(401, 'HTTP_401_UNAUTHORIZED', message, data);
    }
    /**
     * 403 Forbidden
     *
     * res.forbidden('Admin access required')
     */
    forbidden(message = 'Permission denied', data = {}) {
        this.sendResponse(403, 'HTTP_403_FORBIDDEN', message, data);
    }
    /**
     * 404 Not Found
     *
     * res.notFound('User not found')
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
     *
     * res.conflict('Email already exists')
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
     * 422 Unprocessable Entity — Validation errors
     *
     * res.validationError('Validation failed')
     */
    validationError(message = 'Unprocessable entity', data = {}) {
        this.sendResponse(422, 'HTTP_422_UNPROCESSABLE_ENTITY', message, data);
    }
    /**
     * 429 Too Many Requests
     *
     * res.tooManyRequests('Rate limit exceeded')
     */
    tooManyRequests(message = 'Too many requests', data = {}) {
        this.sendResponse(429, 'HTTP_429_TOO_MANY_REQUESTS', message, data);
    }
    /**
     * 500 Internal Server Error
     *
     * res.serverError('Database connection failed')
     */
    serverError(message = 'Internal server error', data = {}) {
        this.sendResponse(500, 'HTTP_500_INTERNAL_SERVER_ERROR', message, data);
    }
    /**
     * 503 Service Unavailable
     *
     * res.serviceUnavailable('Service down for maintenance')
     */
    serviceUnavailable(message = 'Service unavailable', data = {}) {
        this.sendResponse(503, 'HTTP_503_SERVICE_UNAVAILABLE', message, data);
    }
    // ═══════════════════════════════════════════════════════════════════════════
    // PAGINATION HELPER — static method for extracting page/limit from request
    // ═══════════════════════════════════════════════════════════════════════════
    /**
     * Extract pagination params from request query string.
     *
     * const { page, limit, skip } = Response.getPaginationParams(req)
     *
     * ?page=2&limit=20 → { page: 2, limit: 20, skip: 20 }
     * no params        → { page: 1, limit: 100, skip: 0 }
     */
    static getPaginationParams(req) {
        const page = parseInt(String(req.query.page || '1'), 10) || 1;
        const limit = parseInt(String(req.query.limit || '100'), 10) || 100;
        const skip = (page - 1) * limit;
        return { page, limit, skip };
    }
}
exports.Response = Response;
//# sourceMappingURL=response.js.map