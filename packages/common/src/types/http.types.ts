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

  // ── Core methods ────────────────────────────────────────────────────────────
  status(code: number): axilResponse;
  header(name: string, value: string): axilResponse;
  json(data: unknown): void;
  text(data: string): void;
  html(data: string): void;
  send(data: Buffer | string): void;
  redirect(url: string, code?: number): void;
  sent: boolean;
  statusCode: number;

  // ── SyntaxilitY Response Manager (built-in) ─────────────────────────────────
  // All responses auto-formatted as:
  // { status, code, message, data }

  /** 200 OK */
  success(data: unknown, message?: string): void;

  /** 201 Created */
  created(data: unknown, message?: string): void;

  /** 200 OK with pagination */
  paginated(data: unknown[], total: number, page: number, limit: number, message?: string): void;

  /** 204 No Content */
  noContent(message?: string): void;

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