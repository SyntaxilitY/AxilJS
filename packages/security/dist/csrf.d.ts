/**
 * CSRF (Cross-Site Request Forgery) protection middleware.
 * Uses the Double Submit Cookie pattern.
 *
 * How it works:
 *   1. Server generates a random token and sets it as a cookie
 *   2. Client reads the token from cookie and sends it as a header
 *   3. Server compares cookie token vs header token
 *   4. If they match → request is legitimate
 *   5. If they don't match → 403 Forbidden
 *
 * Safe methods (GET, HEAD, OPTIONS) are always allowed.
 */
import { MiddlewareFn } from '@axil/common';
export interface CsrfOptions {
    cookieName?: string;
    headerName?: string;
    cookie?: {
        secure?: boolean;
        sameSite?: 'strict' | 'lax' | 'none';
        path?: string;
    };
}
/**
 * Create CSRF protection middleware.
 *
 * Usage:
 *   app.use(csrf())
 *
 * Client must:
 *   1. Read token from '_csrf' cookie
 *   2. Send it as 'x-csrf-token' header on state-changing requests
 */
export declare function csrf(options?: CsrfOptions): MiddlewareFn;
//# sourceMappingURL=csrf.d.ts.map