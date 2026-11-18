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

/**
 * Report a body to @axiljs/runtime's sensitive data lineage before it is
 * sent, without depending on that package. In enforce mode the hook throws
 * (IntentViolationError), which reaches the app's error handler through the
 * handler's res.* call; nothing has been written yet.
 */
function checkSensitiveSink(body: unknown): void {
  const sink = (globalThis as any)[Symbol.for('axiljs.sensitive.sink')];
  if (typeof sink === 'function') sink('response', body);
}

export class Response implements axilResponse {
  public raw: ServerResponse;
  public statusCode: number;
  public sent: boolean;

  constructor(raw: ServerResponse) {
    this.raw = raw;
    this.statusCode = 200;
    this.sent = false;
  }

  // ============================================================================
  // CORE HTTP METHODS
  // ============================================================================

  status(code: number): axilResponse {
    this.statusCode = code;
    this.raw.statusCode = code;
    return this;
  }

  header(name: string, value: string): axilResponse {
    this.raw.setHeader(name, value);
    return this;
  }

  json(data: unknown): void {
    if (this.sent) return;
    checkSensitiveSink(data);

    // JSON.stringify(undefined) is undefined, which would crash below
    const body = JSON.stringify(data) ?? 'null';

    this.raw.setHeader(
      'Content-Type',
      'application/json; charset=utf-8'
    );

    this.raw.setHeader(
      'Content-Length',
      Buffer.byteLength(body)
    );

    this.raw.end(body);
    this.sent = true;
  }

  text(data: string): void {
    if (this.sent) return;
    checkSensitiveSink(data);

    this.raw.setHeader(
      'Content-Type',
      'text/plain; charset=utf-8'
    );

    this.raw.setHeader(
      'Content-Length',
      Buffer.byteLength(data)
    );

    this.raw.end(data);
    this.sent = true;
  }

  html(data: string): void {
    if (this.sent) return;
    checkSensitiveSink(data);

    this.raw.setHeader(
      'Content-Type',
      'text/html; charset=utf-8'
    );

    this.raw.setHeader(
      'Content-Length',
      Buffer.byteLength(data)
    );

    this.raw.end(data);
    this.sent = true;
  }

  send(data: Buffer | string): void {
    if (this.sent) return;

    if (this.endWithoutBody()) return;
    checkSensitiveSink(data);

    const buffer =
      typeof data === 'string'
        ? Buffer.from(data)
        : data;

    this.raw.setHeader(
      'Content-Length',
      buffer.length
    );

    this.raw.end(buffer);
    this.sent = true;
  }

  redirect(url: string, code: number = 302): void {
    if (this.sent) return;

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
  private endWithoutBody(): boolean {
    const code = this.raw.statusCode;
    if (code !== 204 && code !== 304) return false;

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
  private sendResponse(
    statusCode: number,
    code: string,
    message: string,
    data: unknown = {}
  ): void {
    if (this.sent) return;
    checkSensitiveSink({ message, data });

    this.statusCode = statusCode;
    this.raw.statusCode = statusCode;

    if (this.endWithoutBody()) return;

    const body = JSON.stringify({
      status: statusCode,
      code,
      message,
      data
    });

    this.raw.setHeader(
      'Content-Type',
      'application/json; charset=utf-8'
    );

    this.raw.setHeader(
      'Content-Length',
      Buffer.byteLength(body)
    );

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
  success(
    data: unknown = {},
    message: string = 'Request successful'
  ): void {
    this.sendResponse(
      200,
      'HTTP_200_OK',
      message,
      data
    );
  }

  /**
   * 201 Created
   *
   * res.created(user, 'User created')
   */
  created(
    data: unknown = {},
    message: string = 'Resource created successfully'
  ): void {
    this.sendResponse(
      201,
      'HTTP_201_CREATED',
      message,
      data
    );
  }

  /**
   * 204 No Content
   */
  noContent(
    message: string = 'No content'
  ): void {
    this.sendResponse(
      204,
      'HTTP_204_NO_CONTENT',
      message
    );
  }

  /**
   * Paginated response.
   */
  paginated(
    data: unknown[],
    total: number,
    page: number,
    limit: number,
    message: string = 'Request successful'
  ): void {
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

    this.sendResponse(
      200,
      'HTTP_200_OK',
      message,
      paginatedData
    );
  }

  /**
   * 400 Bad Request
   */
  badRequest(
    message: string = 'Bad request',
    data: unknown = {}
  ): void {
    this.sendResponse(
      400,
      'HTTP_400_BAD_REQUEST',
      message,
      data
    );
  }

  /**
   * 401 Unauthorized
   */
  unauthorized(
    message: string = 'Unauthorized access',
    data: unknown = {}
  ): void {
    this.sendResponse(
      401,
      'HTTP_401_UNAUTHORIZED',
      message,
      data
    );
  }

  /**
   * 403 Forbidden
   */
  forbidden(
    message: string = 'Permission denied',
    data: unknown = {}
  ): void {
    this.sendResponse(
      403,
      'HTTP_403_FORBIDDEN',
      message,
      data
    );
  }

  /**
   * 404 Not Found
   */
  notFound(
    message: string = 'Resource not found',
    data: unknown = {}
  ): void {
    this.sendResponse(
      404,
      'HTTP_404_NOT_FOUND',
      message,
      data
    );
  }

  /**
   * 405 Method Not Allowed
   */
  methodNotAllowed(
    message: string = 'Method not allowed',
    data: unknown = {}
  ): void {
    this.sendResponse(
      405,
      'HTTP_405_METHOD_NOT_ALLOWED',
      message,
      data
    );
  }

  /**
   * 406 Not Acceptable
   */
  notAcceptable(
    message: string = 'Not acceptable',
    data: unknown = {}
  ): void {
    this.sendResponse(
      406,
      'HTTP_406_NOT_ACCEPTABLE',
      message,
      data
    );
  }

  /**
   * 409 Conflict
   */
  conflict(
    message: string = 'Resource conflict',
    data: unknown = {}
  ): void {
    this.sendResponse(
      409,
      'HTTP_409_CONFLICT',
      message,
      data
    );
  }

  /**
   * 415 Unsupported Media Type
   */
  unsupportedMediaType(
    message: string = 'Unsupported media type',
    data: unknown = {}
  ): void {
    this.sendResponse(
      415,
      'HTTP_415_UNSUPPORTED_MEDIA_TYPE',
      message,
      data
    );
  }

  /**
   * 422 Unprocessable Entity
   */
  validationError(
    message: string = 'Unprocessable entity',
    data: unknown = {}
  ): void {
    this.sendResponse(
      422,
      'HTTP_422_UNPROCESSABLE_ENTITY',
      message,
      data
    );
  }

  /**
   * 429 Too Many Requests
   */
  tooManyRequests(
    message: string = 'Too many requests',
    data: unknown = {}
  ): void {
    this.sendResponse(
      429,
      'HTTP_429_TOO_MANY_REQUESTS',
      message,
      data
    );
  }

  /**
   * 500 Internal Server Error
   */
  serverError(
    message: string = 'Internal server error',
    data: unknown = {}
  ): void {
    this.sendResponse(
      500,
      'HTTP_500_INTERNAL_SERVER_ERROR',
      message,
      data
    );
  }

  /**
   * 503 Service Unavailable
   */
  serviceUnavailable(
    message: string = 'Service unavailable',
    data: unknown = {}
  ): void {
    this.sendResponse(
      503,
      'HTTP_503_SERVICE_UNAVAILABLE',
      message,
      data
    );
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
  HTTP_200_OK(
    data: unknown = {},
    message: string = 'Request successful'
  ): void {
    this.sendResponse(
      200,
      'HTTP_200_OK',
      message,
      data
    );
  }

  /**
   * HTTP 201 Created
   *
   * res.HTTP_201_CREATED(data, message)
   */
  HTTP_201_CREATED(
    data: unknown = {},
    message: string = 'Resource created successfully'
  ): void {
    this.sendResponse(
      201,
      'HTTP_201_CREATED',
      message,
      data
    );
  }

  /**
   * HTTP 400 Bad Request
   *
   * res.HTTP_400_BAD_REQUEST(message, data)
   */
  HTTP_400_BAD_REQUEST(
    message: string = 'Bad request',
    data: unknown = {}
  ): void {
    this.sendResponse(
      400,
      'HTTP_400_BAD_REQUEST',
      message,
      data
    );
  }

  /**
   * HTTP 401 Unauthorized
   *
   * res.HTTP_401_UNAUTHORIZED(message, data)
   */
  HTTP_401_UNAUTHORIZED(
    message: string = 'Unauthorized access',
    data: unknown = {}
  ): void {
    this.sendResponse(
      401,
      'HTTP_401_UNAUTHORIZED',
      message,
      data
    );
  }

  /**
   * HTTP 403 Forbidden
   *
   * res.HTTP_403_FORBIDDEN(message, data)
   */
  HTTP_403_FORBIDDEN(
    message: string = 'Permission denied',
    data: unknown = {}
  ): void {
    this.sendResponse(
      403,
      'HTTP_403_FORBIDDEN',
      message,
      data
    );
  }

  /**
   * HTTP 404 Not Found
   *
   * res.HTTP_404_NOT_FOUND(message, data)
   */
  HTTP_404_NOT_FOUND(
    message: string = 'Resource not found',
    data: unknown = {}
  ): void {
    this.sendResponse(
      404,
      'HTTP_404_NOT_FOUND',
      message,
      data
    );
  }

  /**
   * HTTP 409 Conflict
   *
   * res.HTTP_409_CONFLICT(message, data)
   */
  HTTP_409_CONFLICT(
    message: string = 'Resource conflict',
    data: unknown = {}
  ): void {
    this.sendResponse(
      409,
      'HTTP_409_CONFLICT',
      message,
      data
    );
  }

  /**
   * HTTP 500 Internal Server Error
   *
   * res.HTTP_500_INTERNAL_SERVER_ERROR(message, data)
   */
  HTTP_500_INTERNAL_SERVER_ERROR(
    message: string = 'Internal server error',
    data: unknown = {}
  ): void {
    this.sendResponse(
      500,
      'HTTP_500_INTERNAL_SERVER_ERROR',
      message,
      data
    );
  }

  /**
   * HTTP 503 Service Unavailable
   *
   * res.HTTP_503_SERVICE_UNAVAILABLE(message, data)
   */
  HTTP_503_SERVICE_UNAVAILABLE(
    message: string = 'Service unavailable',
    data: unknown = {}
  ): void {
    this.sendResponse(
      503,
      'HTTP_503_SERVICE_UNAVAILABLE',
      message,
      data
    );
  }

  /**
   * HTTP 204 No Content
   *
   * res.HTTP_204_NO_CONTENT(message, data)
   */
  HTTP_204_NO_CONTENT(
    message: string = 'No content',
    data: unknown = {}
  ): void {
    this.sendResponse(
      204,
      'HTTP_204_NO_CONTENT',
      message,
      data
    );
  }

  /**
   * HTTP 405 Method Not Allowed
   *
   * res.HTTP_405_METHOD_NOT_ALLOWED(message, data)
   */
  HTTP_405_METHOD_NOT_ALLOWED(
    message: string = 'Method not allowed',
    data: unknown = {}
  ): void {
    this.sendResponse(
      405,
      'HTTP_405_METHOD_NOT_ALLOWED',
      message,
      data
    );
  }

  /**
   * HTTP 406 Not Acceptable
   *
   * res.HTTP_406_NOT_ACCEPTABLE(message, data)
   */
  HTTP_406_NOT_ACCEPTABLE(
    message: string = 'Not acceptable',
    data: unknown = {}
  ): void {
    this.sendResponse(
      406,
      'HTTP_406_NOT_ACCEPTABLE',
      message,
      data
    );
  }

  /**
   * HTTP 415 Unsupported Media Type
   *
   * res.HTTP_415_UNSUPPORTED_MEDIA_TYPE(message, data)
   */
  HTTP_415_UNSUPPORTED_MEDIA_TYPE(
    message: string = 'Unsupported media type',
    data: unknown = {}
  ): void {
    this.sendResponse(
      415,
      'HTTP_415_UNSUPPORTED_MEDIA_TYPE',
      message,
      data
    );
  }

  /**
   * HTTP 429 Too Many Requests
   *
   * res.HTTP_429_TOO_MANY_REQUESTS(message, data)
   */
  HTTP_429_TOO_MANY_REQUESTS(
    message: string = 'Too many requests',
    data: unknown = {}
  ): void {
    this.sendResponse(
      429,
      'HTTP_429_TOO_MANY_REQUESTS',
      message,
      data
    );
  }

  /**
   * HTTP 422 Unprocessable Entity
   *
   * res.HTTP_422_UNPROCESSABLE_ENTITY(message, data)
   */
  HTTP_422_UNPROCESSABLE_ENTITY(
    message: string = 'Unprocessable entity',
    data: unknown = {}
  ): void {
    this.sendResponse(
      422,
      'HTTP_422_UNPROCESSABLE_ENTITY',
      message,
      data
    );
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
  static getPaginationParams(req: {
    query: Record<string, string | string[] | undefined>;
  }): {
    page: number;
    limit: number;
    skip: number;
  } {
    const page =
      parseInt(
        String(req.query.page || '1'),
        10
      ) || 1;

    const limit =
      parseInt(
        String(req.query.limit || '100'),
        10
      ) || 100;

    const skip = (page - 1) * limit;

    return {
      page,
      limit,
      skip
    };
  }
}