/**
 * Built-in CORS middleware.
 * Handles Cross-Origin Resource Sharing headers.
 */
import { MiddlewareFn } from '@axil/common';
export interface CorsOptions {
    origin?: string | string[] | ((origin: string) => boolean);
    methods?: string[];
    allowedHeaders?: string[];
    exposedHeaders?: string[];
    credentials?: boolean;
    maxAge?: number;
}
/**
 * Create CORS middleware.
 *
 * Usage:
 *   app.use(cors()) // Allow all origins
 *   app.use(cors({ origin: 'https://example.com' }))
 *   app.use(cors({ origin: ['https://app.com', 'https://admin.com'] }))
 */
export declare function cors(options?: CorsOptions): MiddlewareFn;
//# sourceMappingURL=cors.d.ts.map