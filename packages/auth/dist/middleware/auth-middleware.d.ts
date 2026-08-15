/**
 * Authentication middleware.
 * Extracts and verifies JWT tokens from requests.
 * Attaches the decoded user to req.locals.user.
 *
 * Usage:
 *   // Protect all routes
 *   app.use(authenticate(jwt))
 *
 *   // Protect specific routes
 *   app.get('/profile', authenticate(jwt), getProfile)
 *
 *   // Optional auth (don't fail if no token)
 *   app.get('/feed', authenticate(jwt, { required: false }), getFeed)
 */
import { MiddlewareFn } from '@axiljs/common';
import { JWT } from '../jwt/jwt';
export interface AuthOptions {
    required?: boolean;
    source?: 'header' | 'cookie' | 'query' | ('header' | 'cookie' | 'query')[];
}
export interface AuthUser {
    id: string | number;
    [key: string]: unknown;
}
/**
 * Create authentication middleware.
 *
 * @param jwt      JWT instance with the secret
 * @param options  Authentication options
 */
export declare function authenticate(jwt: JWT, options?: AuthOptions): MiddlewareFn;
/**
 * Get the authenticated user from request.
 * Throws if not authenticated.
 */
export declare function getUser(req: any): AuthUser;
//# sourceMappingURL=auth-middleware.d.ts.map