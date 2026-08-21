/**
 * Core HTTP types used across the entire AxilJS ecosystem.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Buffer } from 'node:buffer';

// ─── HTTP Methods ────────────────────────────────────────────────────────────

export type HttpMethod =
  | 'GET'
  | 'POST'
  | 'PUT'
  | 'PATCH'
  | 'DELETE'
  | 'HEAD'
  | 'OPTIONS';

// ─── Route Params ────────────────────────────────────────────────────────────

export type RouteParams = Record<string, string>;
export type QueryParams = Record<string, string | string[]>;

// ─── Request ─────────────────────────────────────────────────────────────────

export interface axilRequest {
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

// ─── Response ────────────────────────────────────────────────────────────────

export interface axilResponse {
  raw: ServerResponse;

  // ── Core methods ──────────────────────────────────────────────────────────

  /**
   * Set HTTP status code.
   */
  status(code: number): axilResponse;

  /**
   * Set response header.
   */
  header(name: string, value: string): axilResponse;

  /**
   * Send JSON response.
   */
  json(data: unknown): void;

  /**
   * Send plain-text response.
   */
  text(data: string): void;

  /**
   * Send HTML response.
   */
  html(data: string): void;

  /**
   * Send Buffer or string response.
   */
  send(data: Buffer | string): void;

  /**
   * Redirect response.
   */
  redirect(url: string, code?: number): void;

  /**
   * Whether a response has already been sent.
   */
  sent: boolean;

  /**
   * Current HTTP status code.
   */
  statusCode: number;

  // ── AxilJS / SyntaxilitY Response Manager ─────────────────────────────────
  //
  // Standard response format:
  //
  // {
  //   status: 200,
  //   code: "HTTP_200_OK",
  //   message: "Request successful",
  //   data: {}
  // }
  //
  // Both the AxilJS convenience methods and the original
  // SyntaxilitY HTTP_* methods are supported.

  // ── AxilJS Convenience Methods ───────────────────────────────────────────

  /** 200 OK */
  success(data?: unknown, message?: string): void;

  /** 201 Created */
  created(data?: unknown, message?: string): void;

  /** 204 No Content */
  noContent(message?: string): void;

  /** 200 OK with pagination */
  paginated(
    data: unknown[],
    total: number,
    page: number,
    limit: number,
    message?: string
  ): void;

  /** 400 Bad Request */
  badRequest(message?: string, data?: unknown): void;

  /** 401 Unauthorized */
  unauthorized(message?: string, data?: unknown): void;

  /** 403 Forbidden */
  forbidden(message?: string, data?: unknown): void;

  /** 404 Not Found */
  notFound(message?: string, data?: unknown): void;

  /** 405 Method Not Allowed */
  methodNotAllowed(message?: string, data?: unknown): void;

  /** 406 Not Acceptable */
  notAcceptable(message?: string, data?: unknown): void;

  /** 409 Conflict */
  conflict(message?: string, data?: unknown): void;

  /** 415 Unsupported Media Type */
  unsupportedMediaType(message?: string, data?: unknown): void;

  /** 422 Unprocessable Entity */
  validationError(message?: string, data?: unknown): void;

  /** 429 Too Many Requests */
  tooManyRequests(message?: string, data?: unknown): void;

  /** 500 Internal Server Error */
  serverError(message?: string, data?: unknown): void;

  /** 503 Service Unavailable */
  serviceUnavailable(message?: string, data?: unknown): void;

  // ── SyntaxilitY Compatible HTTP_* Methods ────────────────────────────────
  //
  // These methods preserve the original SyntaxilitY API Response Manager
  // naming convention while being natively available in AxilJS.

  /** HTTP 200 OK */
  HTTP_200_OK(
    data?: unknown,
    message?: string
  ): void;

  /** HTTP 201 Created */
  HTTP_201_CREATED(
    data?: unknown,
    message?: string
  ): void;

  /** HTTP 400 Bad Request */
  HTTP_400_BAD_REQUEST(
    message?: string,
    data?: unknown
  ): void;

  /** HTTP 401 Unauthorized */
  HTTP_401_UNAUTHORIZED(
    message?: string,
    data?: unknown
  ): void;

  /** HTTP 403 Forbidden */
  HTTP_403_FORBIDDEN(
    message?: string,
    data?: unknown
  ): void;

  /** HTTP 404 Not Found */
  HTTP_404_NOT_FOUND(
    message?: string,
    data?: unknown
  ): void;

  /** HTTP 409 Conflict */
  HTTP_409_CONFLICT(
    message?: string,
    data?: unknown
  ): void;

  /** HTTP 500 Internal Server Error */
  HTTP_500_INTERNAL_SERVER_ERROR(
    message?: string,
    data?: unknown
  ): void;

  /** HTTP 503 Service Unavailable */
  HTTP_503_SERVICE_UNAVAILABLE(
    message?: string,
    data?: unknown
  ): void;

  /** HTTP 204 No Content */
  HTTP_204_NO_CONTENT(
    message?: string,
    data?: unknown
  ): void;

  /** HTTP 405 Method Not Allowed */
  HTTP_405_METHOD_NOT_ALLOWED(
    message?: string,
    data?: unknown
  ): void;

  /** HTTP 406 Not Acceptable */
  HTTP_406_NOT_ACCEPTABLE(
    message?: string,
    data?: unknown
  ): void;

  /** HTTP 415 Unsupported Media Type */
  HTTP_415_UNSUPPORTED_MEDIA_TYPE(
    message?: string,
    data?: unknown
  ): void;

  /** HTTP 429 Too Many Requests */
  HTTP_429_TOO_MANY_REQUESTS(
    message?: string,
    data?: unknown
  ): void;

  /** HTTP 422 Unprocessable Entity */
  HTTP_422_UNPROCESSABLE_ENTITY(
    message?: string,
    data?: unknown
  ): void;
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export type MiddlewareFn = (
  req: axilRequest,
  res: axilResponse,
  next: (error?: Error) => void
) => void | Promise<void>;

export type ErrorMiddlewareFn = (
  error: Error,
  req: axilRequest,
  res: axilResponse,
  next: (error?: Error) => void
) => void | Promise<void>;

// ─── Route Handler ───────────────────────────────────────────────────────────

export type RouteHandler = (
  req: axilRequest,
  res: axilResponse
) => void | Promise<void>;