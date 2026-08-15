/**
 * Auth Middleware — Verifies JWT and attaches user to request
 */
import { MiddlewareFn } from '@axiljs/common';
import { JWT } from '@axiljs/auth';
export declare function createAuthMiddleware(jwt: JWT): MiddlewareFn;
export declare function createOptionalAuthMiddleware(jwt: JWT): MiddlewareFn;
export declare function requireAdmin(): MiddlewareFn;
export declare function requireAuthorOrAdmin(): MiddlewareFn;
//# sourceMappingURL=auth.middleware.d.ts.map