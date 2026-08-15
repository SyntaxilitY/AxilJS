"use strict";
/**
 * @axiljsJS Response implementation.
 * Wraps Node.js ServerResponse with a fluent, developer-friendly API.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Response = void 0;
class Response {
    raw;
    statusCode;
    sent;
    constructor(raw) {
        this.raw = raw;
        this.statusCode = 200;
        this.sent = false;
    }
    /**
     * Set HTTP status code.
     * Returns this for chaining: res.status(404).json({ error: 'Not found' })
     */
    status(code) {
        this.statusCode = code;
        this.raw.statusCode = code;
        return this;
    }
    /**
     * Set a response header.
     * Returns this for chaining: res.header('X-Custom', 'value').json({})
     */
    header(name, value) {
        this.raw.setHeader(name, value);
        return this;
    }
    /**
     * Send a JSON response.
     * Automatically sets Content-Type to application/json.
     */
    json(data) {
        if (this.sent)
            return;
        const body = JSON.stringify(data);
        this.raw.setHeader('Content-Type', 'application/json; charset=utf-8');
        this.raw.setHeader('Content-Length', Buffer.byteLength(body));
        this.raw.end(body);
        this.sent = true;
    }
    /**
     * Send a plain text response.
     */
    text(data) {
        if (this.sent)
            return;
        this.raw.setHeader('Content-Type', 'text/plain; charset=utf-8');
        this.raw.setHeader('Content-Length', Buffer.byteLength(data));
        this.raw.end(data);
        this.sent = true;
    }
    /**
     * Send an HTML response.
     */
    html(data) {
        if (this.sent)
            return;
        this.raw.setHeader('Content-Type', 'text/html; charset=utf-8');
        this.raw.setHeader('Content-Length', Buffer.byteLength(data));
        this.raw.end(data);
        this.sent = true;
    }
    /**
     * Send a raw buffer or string response.
     * Content-Type must be set manually before calling this.
     */
    send(data) {
        if (this.sent)
            return;
        const buffer = typeof data === 'string' ? Buffer.from(data) : data;
        this.raw.setHeader('Content-Length', buffer.length);
        this.raw.end(buffer);
        this.sent = true;
    }
    /**
     * Redirect to another URL.
     * Default status code is 302 (temporary redirect).
     */
    redirect(url, code = 302) {
        if (this.sent)
            return;
        this.raw.writeHead(code, { Location: url });
        this.raw.end();
        this.sent = true;
    }
}
exports.Response = Response;
//# sourceMappingURL=response.js.map