/**
 * Static file serving middleware.
 * Serves files from a directory.
 *
 * Features:
 *   - MIME type detection
 *   - Directory index (index.html)
 *   - Cache headers (ETag, Last-Modified)
 *   - Range requests (partial content for video/audio)
 */
import { MiddlewareFn } from '@axil/common';
export interface StaticOptions {
    root: string;
    prefix?: string;
    index?: string;
    maxAge?: number;
    dotfiles?: boolean;
}
/**
 * Create static file serving middleware.
 *
 * Usage:
 *   app.use(serveStatic({ root: './public' }))
 *   app.use(serveStatic({ root: './uploads', prefix: '/uploads' }))
 */
export declare function serveStatic(options: StaticOptions): MiddlewareFn;
//# sourceMappingURL=static.d.ts.map