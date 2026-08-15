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
import { axilResponse }   from '@axiljs/common';

export class Response implements axilResponse {
  public raw: ServerResponse;
  public statusCode: number;
  public sent: boolean;

  constructor(raw: ServerResponse) {
    this.raw        = raw;
    this.statusCode = 200;
    this.sent       = false;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CORE METHODS — unchanged from original
  // ═══════════════════════════════════════════════════════════════════════════

  status(code: number): axilResponse {
    this.statusCode    = code;
    this.raw.statusCode = code;
    return this;
  }

  header(name: string, value: string): axilResponse {
    this.raw.setHeader(name, value);
    return this;
  }

  json(data: unknown): void {
    if (this.sent) return;
    const body = JSON.stringify(data);
    this.raw.setHeader('Content-Type', 'application/json; charset=utf-8');
    this.raw.setHeader('Content-Length', Buffer.byteLength(body));
    this.raw.end(body);
    this.sent = true;
  }

  text(data: string): void {
    if (this.sent) return;
    this.raw.setHeader('Content-Type', 'text/plain; charset=utf-8');
    this.raw.setHeader('Content-Length', Buffer.byteLength(data));
    this.raw.end(data);
    this.sent = true;
  }

  html(data: string): void {
    if (this.sent) return;
    this.raw.setHeader('Content-Type', 'text/html; charset=utf-8');
    this.raw.setHeader('Content-Length', Buffer.byteLength(data));
    this.raw.end(data);
    this.sent = true;
  }

  send(data: Buffer | string): void {
    if (this.sent) return;
    const buffer = typeof data === 'string' ? Buffer.from(data) : data;
    this.raw.setHeader('Content-Length', buffer.length);
    this.raw.end(buffer);
    this.sent = true;
  }

  redirect(url: string, code: number = 302): void {
    if (this.sent) return;
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
  private sendResponse(
    statusCode: number,
    code:       string,
    message:    string,
    data:       unknown = {}
  ): void {
    if (this.sent) return;

    this.statusCode     = statusCode;
    this.raw.statusCode = statusCode;

    const body = JSON.stringify({
      status:  statusCode,
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
  success(data: unknown, message: string = 'Request successful'): void {
    this.sendResponse(200, 'HTTP_200_OK', message, data);
  }

  /**
   * 201 Created
   *
   * res.created(newUser, 'User created')
   *
   * → { status: 201, code: "HTTP_201_CREATED", message: "User created", data: {...} }
   */
  created(data: unknown, message: string = 'Resource created successfully'): void {
    this.sendResponse(201, 'HTTP_201_CREATED', message, data);
  }

  /**
   * 204 No Content
   *
   * res.noContent()
   *
   * → { status: 204, code: "HTTP_204_NO_CONTENT", message: "No content", data: {} }
   */
  noContent(message: string = 'No content'): void {
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
  paginated(
    data:    unknown[],
    total:   number,
    page:    number,
    limit:   number,
    message: string = 'Request successful'
  ): void {
    const paginatedData = {
      metadata: data,
      pagination: {
        total,
        page,
        limit,
        totalPages:  Math.ceil(total / limit),
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
  badRequest(message: string = 'Bad request', data: unknown = {}): void {
    this.sendResponse(400, 'HTTP_400_BAD_REQUEST', message, data);
  }

  /**
   * 401 Unauthorized
   *
   * res.unauthorized('Invalid token')
   */
  unauthorized(message: string = 'Unauthorized access', data: unknown = {}): void {
    this.sendResponse(401, 'HTTP_401_UNAUTHORIZED', message, data);
  }

  /**
   * 403 Forbidden
   *
   * res.forbidden('Admin access required')
   */
  forbidden(message: string = 'Permission denied', data: unknown = {}): void {
    this.sendResponse(403, 'HTTP_403_FORBIDDEN', message, data);
  }

  /**
   * 404 Not Found
   *
   * res.notFound('User not found')
   */
  notFound(message: string = 'Resource not found', data: unknown = {}): void {
    this.sendResponse(404, 'HTTP_404_NOT_FOUND', message, data);
  }

  /**
   * 405 Method Not Allowed
   */
  methodNotAllowed(message: string = 'Method not allowed', data: unknown = {}): void {
    this.sendResponse(405, 'HTTP_405_METHOD_NOT_ALLOWED', message, data);
  }

  /**
   * 406 Not Acceptable
   */
  notAcceptable(message: string = 'Not acceptable', data: unknown = {}): void {
    this.sendResponse(406, 'HTTP_406_NOT_ACCEPTABLE', message, data);
  }

  /**
   * 409 Conflict
   *
   * res.conflict('Email already exists')
   */
  conflict(message: string = 'Resource conflict', data: unknown = {}): void {
    this.sendResponse(409, 'HTTP_409_CONFLICT', message, data);
  }

  /**
   * 415 Unsupported Media Type
   */
  unsupportedMediaType(message: string = 'Unsupported media type', data: unknown = {}): void {
    this.sendResponse(415, 'HTTP_415_UNSUPPORTED_MEDIA_TYPE', message, data);
  }

  /**
   * 422 Unprocessable Entity — Validation errors
   *
   * res.validationError('Validation failed')
   */
  validationError(message: string = 'Unprocessable entity', data: unknown = {}): void {
    this.sendResponse(422, 'HTTP_422_UNPROCESSABLE_ENTITY', message, data);
  }

  /**
   * 429 Too Many Requests
   *
   * res.tooManyRequests('Rate limit exceeded')
   */
  tooManyRequests(message: string = 'Too many requests', data: unknown = {}): void {
    this.sendResponse(429, 'HTTP_429_TOO_MANY_REQUESTS', message, data);
  }

  /**
   * 500 Internal Server Error
   *
   * res.serverError('Database connection failed')
   */
  serverError(message: string = 'Internal server error', data: unknown = {}): void {
    this.sendResponse(500, 'HTTP_500_INTERNAL_SERVER_ERROR', message, data);
  }

  /**
   * 503 Service Unavailable
   *
   * res.serviceUnavailable('Service down for maintenance')
   */
  serviceUnavailable(message: string = 'Service unavailable', data: unknown = {}): void {
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
  static getPaginationParams(req: {
    query: Record<string, string | string[] | undefined>
  }): { page: number; limit: number; skip: number } {
    const page  = parseInt(String(req.query.page  || '1'), 10) || 1;
    const limit = parseInt(String(req.query.limit || '100'), 10) || 100;
    const skip  = (page - 1) * limit;
    return { page, limit, skip };
  }
}