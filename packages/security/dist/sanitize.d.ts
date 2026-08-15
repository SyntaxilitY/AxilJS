/**
 * Input sanitization utilities.
 * Prevents XSS by escaping HTML in user input.
 * Prevents SQL injection patterns from reaching the database.
 *
 * Note: SQL injection protection is primarily the ORM's job (Phase 3).
 * This is a defense-in-depth layer.
 */
import { MiddlewareFn } from '@axil/common';
/**
 * Escape HTML special characters in a string.
 * Use when outputting user input into HTML.
 */
export declare function escapeHtml(str: string): string;
/**
 * Recursively sanitize all string values in an object.
 * Applied to request body by the sanitize middleware.
 */
export declare function sanitizeObject(obj: unknown): unknown;
export interface SanitizeOptions {
    body?: boolean;
    query?: boolean;
    params?: boolean;
}
/**
 * Create sanitization middleware.
 * Escapes HTML in request data to prevent XSS.
 *
 * Usage:
 *   app.use(sanitize())
 *   app.use(sanitize({ body: true, query: true, params: false }))
 */
export declare function sanitize(options?: SanitizeOptions): MiddlewareFn;
//# sourceMappingURL=sanitize.d.ts.map