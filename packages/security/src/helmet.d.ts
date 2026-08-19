/**
 * Helmet middleware.
 * Sets security-related HTTP headers on every response.
 * Each header protects against a specific attack vector.
 *
 * No external dependencies - pure header setting.
 */
import { MiddlewareFn } from '@axiljs/common';
export interface HelmetOptions {
    contentSecurityPolicy?: boolean | string;
    frameOptions?: 'DENY' | 'SAMEORIGIN' | false;
    hsts?: boolean | {
        maxAge?: number;
        includeSubDomains?: boolean;
    };
    noSniff?: boolean;
    xssFilter?: boolean;
    referrerPolicy?: string | false;
    permissionsPolicy?: boolean;
    hidePoweredBy?: boolean;
}
/**
 * Create helmet security headers middleware.
 *
 * Usage:
 *   app.use(helmet())
 *   app.use(helmet({ frameOptions: 'SAMEORIGIN' }))
 */
export declare function helmet(options?: HelmetOptions): MiddlewareFn;
//# sourceMappingURL=helmet.d.ts.map