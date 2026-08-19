/**
 * axilJS error types.
 * All framework errors extend axilError so they can be caught consistently.
 */
export declare class axilError extends Error {
    readonly statusCode: number;
    readonly code: string;
    readonly details?: unknown;
    constructor(message: string, statusCode?: number, code?: string, details?: unknown);
}
export declare class NotFoundError extends axilError {
    constructor(message?: string);
}
export declare class BadRequestError extends axilError {
    constructor(message?: string, details?: unknown);
}
export declare class UnauthorizedError extends axilError {
    constructor(message?: string);
}
export declare class ForbiddenError extends axilError {
    constructor(message?: string);
}
export declare class ValidationError extends axilError {
    constructor(message?: string, details?: unknown);
}
export declare class InternalError extends axilError {
    constructor(message?: string);
}
//# sourceMappingURL=errors.types.d.ts.map