"use strict";
/**
 * axilJS error types.
 * All framework errors extend axilError so they can be caught consistently.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.InternalError = exports.ValidationError = exports.ForbiddenError = exports.UnauthorizedError = exports.BadRequestError = exports.NotFoundError = exports.axilError = void 0;
// ─── Base Error ───────────────────────────────────────────────────────────────
class axilError extends Error {
    // HTTP status code to send to client
    statusCode;
    // Machine-readable error code e.g. 'NOT_FOUND'
    code;
    // Extra context for debugging (not always sent to client)
    details;
    constructor(message, statusCode = 500, code = 'INTERNAL_ERROR', details) {
        super(message);
        this.name = 'axilError';
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
    }
}
exports.axilError = axilError;
// ─── Common HTTP Errors ───────────────────────────────────────────────────────
class NotFoundError extends axilError {
    constructor(message = 'Resource not found') {
        super(message, 404, 'NOT_FOUND');
        this.name = 'NotFoundError';
    }
}
exports.NotFoundError = NotFoundError;
class BadRequestError extends axilError {
    constructor(message = 'Bad request', details) {
        super(message, 400, 'BAD_REQUEST', details);
        this.name = 'BadRequestError';
    }
}
exports.BadRequestError = BadRequestError;
class UnauthorizedError extends axilError {
    constructor(message = 'Unauthorized') {
        super(message, 401, 'UNAUTHORIZED');
        this.name = 'UnauthorizedError';
    }
}
exports.UnauthorizedError = UnauthorizedError;
class ForbiddenError extends axilError {
    constructor(message = 'Forbidden') {
        super(message, 403, 'FORBIDDEN');
        this.name = 'ForbiddenError';
    }
}
exports.ForbiddenError = ForbiddenError;
class ValidationError extends axilError {
    constructor(message = 'Validation failed', details) {
        super(message, 422, 'VALIDATION_ERROR', details);
        this.name = 'ValidationError';
    }
}
exports.ValidationError = ValidationError;
class InternalError extends axilError {
    constructor(message = 'Internal server error') {
        super(message, 500, 'INTERNAL_ERROR');
        this.name = 'InternalError';
    }
}
exports.InternalError = InternalError;
//# sourceMappingURL=errors.types.js.map