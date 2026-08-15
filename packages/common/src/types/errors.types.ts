/**
 * axilJS error types.
 * All framework errors extend axilError so they can be caught consistently.
 */

// ─── Base Error ───────────────────────────────────────────────────────────────

export class axilError extends Error {
  // HTTP status code to send to client
  public readonly statusCode: number;

  // Machine-readable error code e.g. 'NOT_FOUND'
  public readonly code: string;

  // Extra context for debugging (not always sent to client)
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    details?: unknown
  ) {
    super(message);
    this.name = 'axilError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

// ─── Common HTTP Errors ───────────────────────────────────────────────────────

export class NotFoundError extends axilError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class BadRequestError extends axilError {
  constructor(message = 'Bad request', details?: unknown) {
    super(message, 400, 'BAD_REQUEST', details);
    this.name = 'BadRequestError';
  }
}

export class UnauthorizedError extends axilError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends axilError {
  constructor(message = 'Forbidden') {
    super(message, 403, 'FORBIDDEN');
    this.name = 'ForbiddenError';
  }
}

export class ValidationError extends axilError {
  constructor(message = 'Validation failed', details?: unknown) {
    super(message, 422, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class InternalError extends axilError {
  constructor(message = 'Internal server error') {
    super(message, 500, 'INTERNAL_ERROR');
    this.name = 'InternalError';
  }
}