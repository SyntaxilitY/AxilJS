/**
 * Core HTTP types used across the entire REstJS ecosystem.
 * These are the foundation - every request and response uses these.
 */

import { IncomingMessage, ServerResponse } from 'http';

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

// Dynamic route params like /users/:id → { id: "123" }
export type RouteParams = Record<string, string>;

// Query string params like ?page=1&limit=10
export type QueryParams = Record<string, string | string[]>;

// ─── Request ─────────────────────────────────────────────────────────────────

/**
 * REstJS Request - wraps Node's IncomingMessage with useful additions.
 * Developers work with this, never raw IncomingMessage.
 */
export interface REstRequest {
  // Raw Node.js request (escape hatch if needed)
  raw: IncomingMessage;

  // HTTP method
  method: HttpMethod;

  // Full URL path including query string
  url: string;

  // Path without query string e.g. "/users/123"
  path: string;

  // Route params e.g. { id: "123" } from /users/:id
  params: RouteParams;

  // Query params e.g. { page: "1" } from ?page=1
  query: QueryParams;

  // Request headers
  headers: Record<string, string | string[] | undefined>;

  // Parsed request body (populated by body parser middleware)
  body: unknown;

  // IP address of the client
  ip: string;

  // Arbitrary data store - middleware can attach data here
  // e.g. req.locals.user = authenticatedUser
  locals: Record<string, unknown>;
}

// ─── Response ────────────────────────────────────────────────────────────────

/**
 * REstJS Response - wraps Node's ServerResponse with a fluent API.
 * Chain methods: res.status(200).json({ ok: true })
 */
export interface REstResponse {
  // Raw Node.js response (escape hatch if needed)
  raw: ServerResponse;

  // Set HTTP status code - returns this for chaining
  status(code: number): REstResponse;

  // Set a response header - returns this for chaining
  header(name: string, value: string): REstResponse;

  // Send JSON response - ends the response
  json(data: unknown): void;

  // Send plain text response - ends the response
  text(data: string): void;

  // Send HTML response - ends the response
  html(data: string): void;

  // Send raw buffer response - ends the response
  send(data: Buffer | string): void;

  // Redirect to another URL
  redirect(url: string, code?: number): void;

  // Check if response has already been sent
  sent: boolean;

  // Current status code
  statusCode: number;
}

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * Middleware function signature.
 * Call next() to pass to next middleware.
 * Call next(error) to pass to error handler.
 */
export type MiddlewareFn = (
  req: REstRequest,
  res: REstResponse,
  next: (error?: Error) => void
) => void | Promise<void>;

/**
 * Error handling middleware - receives the error as first argument.
 */
export type ErrorMiddlewareFn = (
  error: Error,
  req: REstRequest,
  res: REstResponse,
  next: (error?: Error) => void
) => void | Promise<void>;

// ─── Route Handler ───────────────────────────────────────────────────────────

/**
 * Final handler for a matched route.
 * Unlike middleware, it does not receive next().
 */
export type RouteHandler = (
  req: REstRequest,
  res: REstResponse
) => void | Promise<void>;