"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.serveStatic = serveStatic;
const fs_1 = require("fs");
const path_1 = require("path");
// ─── MIME Types ───────────────────────────────────────────────────────────────
// Common file extension → MIME type mappings
const MIME_TYPES = {
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
function getMimeType(filePath) {
    const ext = (0, path_1.extname)(filePath).toLowerCase();
    return MIME_TYPES[ext] || 'application/octet-stream';
}
// ─── Static Middleware ────────────────────────────────────────────────────────
/**
 * Create static file serving middleware.
 *
 * Usage:
 *   app.use(serveStatic({ root: './public' }))
 *   app.use(serveStatic({ root: './uploads', prefix: '/uploads' }))
 */
function serveStatic(options) {
    const { root, prefix = '', index = 'index.html', maxAge = 86400, dotfiles = false } = options;
    // Resolve to absolute path for security
    const absoluteRoot = (0, path_1.resolve)(root);
    return (req, res, next) => {
        // Only handle GET and HEAD requests
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            return next();
        }
        let filePath = req.path;
        // Strip prefix if configured; requests outside the prefix are not ours
        if (prefix) {
            const base = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
            if (filePath !== base && !filePath.startsWith(base + '/')) {
                return next();
            }
            filePath = filePath.slice(base.length);
        }
        // URL paths are percent-encoded ('/my%20file.txt')
        try {
            filePath = decodeURIComponent(filePath);
        }
        catch {
            return next();
        }
        // Security: prevent directory traversal attacks
        // Resolve the full path and ensure it's within root
        // (compare with a trailing separator so '/srv/public-secret' is not
        // considered inside '/srv/public')
        const fullPath = (0, path_1.resolve)((0, path_1.join)(absoluteRoot, filePath));
        const rootWithSep = absoluteRoot.endsWith(path_1.sep) ? absoluteRoot : absoluteRoot + path_1.sep;
        if (fullPath !== absoluteRoot && !fullPath.startsWith(rootWithSep)) {
            // Attempted directory traversal (../../etc/passwd)
            return next();
        }
        // Block dotfiles unless explicitly allowed ('\' is a separator on Windows)
        if (!dotfiles && filePath.split(/[\\/]/).some(part => part.startsWith('.'))) {
            return next();
        }
        // Check if path exists
        if (!(0, fs_1.existsSync)(fullPath)) {
            return next(); // Let other middleware handle 404
        }
        const stat = (0, fs_1.statSync)(fullPath);
        let targetPath = fullPath;
        if (stat.isDirectory()) {
            // Try to serve index file for directories
            const indexPath = (0, path_1.join)(fullPath, index);
            if (!(0, fs_1.existsSync)(indexPath)) {
                return next();
            }
            targetPath = indexPath;
        }
        const fileStat = (0, fs_1.statSync)(targetPath);
        const mimeType = getMimeType(targetPath);
        // Weak ETag from file size and modification time
        const etag = `W/"${fileStat.size.toString(16)}-${Math.floor(fileStat.mtimeMs).toString(16)}"`;
        const lastModified = fileStat.mtime.toUTCString();
        // Validators go on 200, 206 and 304 responses alike
        res.header('ETag', etag);
        res.header('Last-Modified', lastModified);
        res.header('Cache-Control', `public, max-age=${maxAge}`);
        res.header('Accept-Ranges', 'bytes');
        // Conditional GET: If-None-Match wins over If-Modified-Since (RFC 9110 §13.2.2)
        if (isNotModified(req.headers, etag, fileStat.mtime)) {
            res.status(304).send('');
            return;
        }
        res.header('Content-Type', mimeType);
        // HEAD requests only need headers
        // (end directly: send('') would overwrite Content-Length with 0)
        if (req.method === 'HEAD') {
            res.header('Content-Length', String(fileStat.size));
            res.status(200);
            res.raw.end();
            res.sent = true;
            return;
        }
        // Single byte-range requests (multi-range requests get the full file)
        let range = null;
        const rangeHeader = req.headers['range'];
        if (typeof rangeHeader === 'string' && ifRangeMatches(req.headers, etag, lastModified)) {
            const parsed = parseRange(rangeHeader, fileStat.size);
            if (parsed === 'unsatisfiable') {
                res.header('Content-Range', `bytes */${fileStat.size}`);
                res.raw.removeHeader('Content-Type');
                res.status(416);
                res.raw.setHeader('Content-Length', '0');
                res.raw.end();
                res.sent = true;
                return;
            }
            range = parsed;
        }
        // Stream file (or the requested range) to the response
        let stream;
        if (range) {
            res.header('Content-Range', `bytes ${range.start}-${range.end}/${fileStat.size}`);
            res.header('Content-Length', String(range.end - range.start + 1));
            res.raw.statusCode = 206;
            stream = (0, fs_1.createReadStream)(targetPath, { start: range.start, end: range.end });
        }
        else {
            res.header('Content-Length', String(fileStat.size));
            res.raw.statusCode = 200;
            stream = (0, fs_1.createReadStream)(targetPath);
        }
        stream.pipe(res.raw);
        stream.on('error', (err) => {
            if (!res.sent) {
                next(err);
            }
        });
    };
}
/** Strip the weak prefix for weak comparison (RFC 9110 §8.8.3.2). */
function opaqueTag(tag) {
    return tag.startsWith('W/') ? tag.slice(2) : tag;
}
/** Whether a conditional GET can be answered with 304 Not Modified. */
function isNotModified(headers, etag, mtime) {
    const ifNoneMatch = headers['if-none-match'];
    if (typeof ifNoneMatch === 'string' && ifNoneMatch.trim()) {
        if (ifNoneMatch.trim() === '*')
            return true;
        const ours = opaqueTag(etag);
        return ifNoneMatch
            .split(',')
            .map(tag => tag.trim())
            .some(tag => opaqueTag(tag) === ours);
    }
    const ifModifiedSince = headers['if-modified-since'];
    if (typeof ifModifiedSince === 'string') {
        const since = Date.parse(ifModifiedSince);
        // HTTP dates have second precision
        if (!isNaN(since) && Math.floor(mtime.getTime() / 1000) * 1000 <= since) {
            return true;
        }
    }
    return false;
}
/**
 * If-Range: only honour Range when the validator still matches.
 * A weak ETag never matches If-Range (strong comparison required), so only
 * a date validator can make a Range conditional here.
 */
function ifRangeMatches(headers, etag, lastModified) {
    const ifRange = headers['if-range'];
    if (typeof ifRange !== 'string' || !ifRange.trim())
        return true;
    const value = ifRange.trim();
    if (value.startsWith('"') || value.startsWith('W/'))
        return false;
    return value === lastModified;
}
/**
 * Parse a single "bytes=" range. Returns null when the header should be
 * ignored (malformed, other unit, multiple ranges) and 'unsatisfiable'
 * when no byte of the file is selected.
 */
function parseRange(header, size) {
    const match = /^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$/i.exec(header);
    if (!match)
        return null;
    const [, startStr, endStr] = match;
    if (!startStr && !endStr)
        return null;
    let start;
    let end;
    if (!startStr) {
        // Suffix range: the last N bytes
        const suffix = parseInt(endStr, 10);
        if (suffix === 0 || size === 0)
            return 'unsatisfiable';
        start = Math.max(0, size - suffix);
        end = size - 1;
    }
    else {
        start = parseInt(startStr, 10);
        end = endStr ? Math.min(parseInt(endStr, 10), size - 1) : size - 1;
        if (endStr && parseInt(endStr, 10) < start)
            return null;
        if (start >= size)
            return 'unsatisfiable';
    }
    return { start, end };
}
//# sourceMappingURL=static.js.map