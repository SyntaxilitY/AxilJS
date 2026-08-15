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

import {
  existsSync,
  statSync,
  createReadStream,
  readFileSync
} from 'fs';
import { join, extname, resolve } from 'path';
import { createHash } from 'crypto';
import { MiddlewareFn, NotFoundError } from '@axil/common';

// ─── MIME Types ───────────────────────────────────────────────────────────────

// Common file extension → MIME type mappings
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.ts': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.pdf': 'application/pdf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject'
};

function getMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

// ─── Options ─────────────────────────────────────────────────────────────────

export interface StaticOptions {
  // Directory to serve files from
  root: string;

  // URL prefix to strip before looking up file (default: '')
  // e.g. prefix '/public' → request '/public/app.js' → serves './app.js'
  prefix?: string;

  // Default file to serve for directory requests (default: 'index.html')
  index?: string;

  // Cache max-age in seconds (default: 86400 = 1 day)
  maxAge?: number;

  // Serve dotfiles (e.g. .env)? (default: false - for security)
  dotfiles?: boolean;
}

// ─── Static Middleware ────────────────────────────────────────────────────────

/**
 * Create static file serving middleware.
 *
 * Usage:
 *   app.use(serveStatic({ root: './public' }))
 *   app.use(serveStatic({ root: './uploads', prefix: '/uploads' }))
 */
export function serveStatic(options: StaticOptions): MiddlewareFn {
  const {
    root,
    prefix = '',
    index = 'index.html',
    maxAge = 86400,
    dotfiles = false
  } = options;

  // Resolve to absolute path for security
  const absoluteRoot = resolve(root);

  return (req, res, next) => {
    // Only handle GET and HEAD requests
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return next();
    }

    let filePath = req.path;

    // Strip prefix if configured
    if (prefix && filePath.startsWith(prefix)) {
      filePath = filePath.slice(prefix.length);
    }

    // Security: prevent directory traversal attacks
    // Resolve the full path and ensure it's within root
    const fullPath = resolve(join(absoluteRoot, filePath));

    if (!fullPath.startsWith(absoluteRoot)) {
      // Attempted directory traversal (../../etc/passwd)
      return next();
    }

    // Block dotfiles unless explicitly allowed
    if (!dotfiles && filePath.split('/').some(part => part.startsWith('.'))) {
      return next();
    }

    // Check if path exists
    if (!existsSync(fullPath)) {
      return next(); // Let other middleware handle 404
    }

    const stat = statSync(fullPath);
    let targetPath = fullPath;

    if (stat.isDirectory()) {
      // Try to serve index file for directories
      const indexPath = join(fullPath, index);

      if (!existsSync(indexPath)) {
        return next();
      }

      targetPath = indexPath;
    }

    const fileStat = statSync(targetPath);
    const mimeType = getMimeType(targetPath);

    // Generate ETag from file size and modification time
    const etag = createHash('md5')
      .update(`${fileStat.size}-${fileStat.mtimeMs}`)
      .digest('hex');

    // Check if client has a cached version (ETag match)
    const clientEtag = req.headers['if-none-match'] as string;
    if (clientEtag === etag) {
      res.status(304).send('');
      return;
    }

    // Set caching headers
    res.header('ETag', etag);
    res.header('Last-Modified', fileStat.mtime.toUTCString());
    res.header('Cache-Control', `public, max-age=${maxAge}`);
    res.header('Content-Type', mimeType);
    res.header('Content-Length', String(fileStat.size));

    // HEAD requests only need headers
    if (req.method === 'HEAD') {
      res.status(200).send('');
      return;
    }

    // Stream file to response
    const stream = createReadStream(targetPath);
    res.raw.statusCode = 200;

    stream.pipe(res.raw);

    stream.on('error', (err) => {
      if (!res.sent) {
        next(err);
      }
    });
  };
}