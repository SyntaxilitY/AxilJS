/**
 * REstJS Response implementation.
 * Wraps Node.js ServerResponse with a fluent, developer-friendly API.
 */

import { ServerResponse } from 'http';
import { REstResponse } from '@restjs/common';

export class Response implements REstResponse {
  public raw: ServerResponse;
  public statusCode: number;
  public sent: boolean;

  constructor(raw: ServerResponse) {
    this.raw = raw;
    this.statusCode = 200;
    this.sent = false;
  }

  /**
   * Set HTTP status code.
   * Returns this for chaining: res.status(404).json({ error: 'Not found' })
   */
  status(code: number): REstResponse {
    this.statusCode = code;
    this.raw.statusCode = code;
    return this;
  }

  /**
   * Set a response header.
   * Returns this for chaining: res.header('X-Custom', 'value').json({})
   */
  header(name: string, value: string): REstResponse {
    this.raw.setHeader(name, value);
    return this;
  }

  /**
   * Send a JSON response.
   * Automatically sets Content-Type to application/json.
   */
  json(data: unknown): void {
    if (this.sent) return;

    const body = JSON.stringify(data);

    this.raw.setHeader('Content-Type', 'application/json; charset=utf-8');
    this.raw.setHeader('Content-Length', Buffer.byteLength(body));
    this.raw.end(body);

    this.sent = true;
  }

  /**
   * Send a plain text response.
   */
  text(data: string): void {
    if (this.sent) return;

    this.raw.setHeader('Content-Type', 'text/plain; charset=utf-8');
    this.raw.setHeader('Content-Length', Buffer.byteLength(data));
    this.raw.end(data);

    this.sent = true;
  }

  /**
   * Send an HTML response.
   */
  html(data: string): void {
    if (this.sent) return;

    this.raw.setHeader('Content-Type', 'text/html; charset=utf-8');
    this.raw.setHeader('Content-Length', Buffer.byteLength(data));
    this.raw.end(data);

    this.sent = true;
  }

  /**
   * Send a raw buffer or string response.
   * Content-Type must be set manually before calling this.
   */
  send(data: Buffer | string): void {
    if (this.sent) return;

    const buffer = typeof data === 'string' ? Buffer.from(data) : data;
    this.raw.setHeader('Content-Length', buffer.length);
    this.raw.end(buffer);

    this.sent = true;
  }

  /**
   * Redirect to another URL.
   * Default status code is 302 (temporary redirect).
   */
  redirect(url: string, code: number = 302): void {
    if (this.sent) return;

    this.raw.writeHead(code, { Location: url });
    this.raw.end();

    this.sent = true;
  }
}