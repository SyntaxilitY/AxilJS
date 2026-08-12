/**
 * REstJS error types.
 * All framework errors extend REstError so they can be caught consistently.
 */
export declare class REstError extends Error {
    readonly statusCode: number;
    readonly code: string;
    readonly details?: unknown;
    constructor(message: string, statusCode?: number, code?: string, details?: unknown);
}
export declare class NotFoundError extends REstError {
    constructor(message?: string);
}
export declare class BadRequestError extends REstError {
    constructor(message?: string, details?: unknown);
}
export declare class UnauthorizedError extends REstError {
    constructor(message?: string);
}
export declare class ForbiddenError extends REstError {
    constructor(message?: string);
}
export declare class ValidationError extends REstError {
    constructor(message?: string, details?: unknown);
}
export declare class InternalError extends REstError {
    constructor(message?: string);
}
//# sourceMappingURL=errors.types.d.ts.map