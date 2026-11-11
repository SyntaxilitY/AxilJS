/**
 * AxilJS Request implementation.
 * Wraps Node.js IncomingMessage and provides a clean API.
 */

import { IncomingMessage } from 'http';
import {
  axilRequest,
  HttpMethod,
  RouteParams,
  QueryParams,
  TrustProxy,
  axilError
} from '@axiljs/common';

/** Options for building a Request. */
export interface RequestOptions {
  // How to derive req.ip from X-Forwarded-For (default: false - socket address)
  trustProxy?: TrustProxy;
}

/**
 * Decode a query-string / form-urlencoded component.
 * '+' means space; malformed %-escapes are kept as-is instead of throwing.
 * @internal
 */
export function safeDecode(str: string): string {
  const plus = str.replace(/\+/g, ' ');
  try {
    return decodeURIComponent(plus);
  } catch {
    return plus;
  }
}

/**
 * Derive the client address from the socket and X-Forwarded-For.
 * @internal
 */
export function resolveClientIp(
  raw: IncomingMessage,
  trustProxy: TrustProxy
): string {
  const socketAddr = raw.socket?.remoteAddress || '127.0.0.1';
  if (trustProxy === false) return socketAddr;

  const header = raw.headers['x-forwarded-for'];
  const forwarded = (Array.isArray(header) ? header.join(',') : header || '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);

  // Historical default: trust the left-most X-Forwarded-For entry
  if (trustProxy === true) return forwarded[0] || socketAddr;

  // Addresses from the closest hop (the socket) outwards to the client
  const hops = [socketAddr, ...forwarded.reverse()];

  if (typeof trustProxy === 'number') {
    const n = Math.max(0, Math.floor(trustProxy));
    return hops[Math.min(n, hops.length - 1)];
  }

  if (typeof trustProxy === 'function') {
    for (let i = 0; i < hops.length - 1; i++) {
      if (!trustProxy(hops[i], i)) return hops[i];
    }
    return hops[hops.length - 1];
  }

  return socketAddr;
}

export class Request implements axilRequest {
  public raw: IncomingMessage;
  public method: HttpMethod;
  public url: string;
  public path: string;
  public params: RouteParams;
  public query: QueryParams;
  public headers: Record<string, string | string[] | undefined>;
  public body: unknown;
  // Unparsed request body text, set by the body parser (e.g. for webhook
  // signature verification); undefined when there was no body
  public rawBody: string | undefined;
  public ip: string;
  public locals: Record<string, unknown>;

  constructor(raw: IncomingMessage, options: RequestOptions = {}) {
    this.raw = raw;

    // Normalize method to uppercase
    this.method = (raw.method || 'GET').toUpperCase() as HttpMethod;

    // Full URL including query string
    this.url = raw.url || '/';

    // Parse path and query string from URL
    const urlParts = this.url.split('?');
    this.path = urlParts[0];
    this.query = this.parseQuery(urlParts[1] || '');

    // Headers from raw request
    this.headers = raw.headers as Record<string, string | string[] | undefined>;

    // Route params are populated by the router when a route matches
    this.params = {};

    // Body is populated by body parser middleware
    this.body = null;
    this.rawBody = undefined;

    // Get client IP - X-Forwarded-For is only honoured when trustProxy opts
    // in; trusting it by default would let any client spoof its address
    this.ip = resolveClientIp(raw, options.trustProxy ?? false);

    // Empty locals store for middleware to populate
    this.locals = {};
  }

  /**
   * Parse query string into key-value object.
   * Handles arrays: ?tag=js&tag=ts → { tag: ['js', 'ts'] }
   */
  private parseQuery(queryString: string): QueryParams {
    if (!queryString) return {};

    const result: QueryParams = {};
    const pairs = queryString.split('&');

    for (const pair of pairs) {
      // Split on the first '=' only so values may contain '='
      const eqIndex = pair.indexOf('=');
      const key = safeDecode(eqIndex === -1 ? pair : pair.slice(0, eqIndex));
      const value = eqIndex === -1 ? '' : safeDecode(pair.slice(eqIndex + 1));
      if (!key) continue;

      // Own-property check: inherited names (constructor, toString,
      // __proto__) must not be treated as existing values
      const existing = Object.prototype.hasOwnProperty.call(result, key)
        ? result[key]
        : undefined;
      const next = existing === undefined
        ? value || ''
        : Array.isArray(existing)
          ? [...existing, value || '']
          : [existing as string, value || ''];

      // defineProperty so a "__proto__" key can't replace the prototype
      Object.defineProperty(result, key, {
        value: next,
        enumerable: true,
        writable: true,
        configurable: true
      });
    }

    return result;
  }

  /**
   * Read the raw request body as a string.
   * Called internally by body parser middleware.
   */
  async readBody(limit: number = 1024 * 1024): Promise<string> {
    return new Promise((resolve, reject) => {
      // Collect raw Buffers and decode once at the end - decoding per chunk
      // corrupts multi-byte UTF-8 characters split across chunk boundaries
      const chunks: Buffer[] = [];
      let size = 0;
      let tooLarge = false;

      this.raw.on('data', (chunk: Buffer) => {
        if (tooLarge) return;
        size += chunk.length;

        // Reject if body exceeds size limit
        if (size > limit) {
          tooLarge = true;
          chunks.length = 0;
          reject(
            new axilError(
              `Request body exceeds limit of ${limit} bytes`,
              413,
              'PAYLOAD_TOO_LARGE'
            )
          );
          return;
        }

        chunks.push(chunk);
      });

      this.raw.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      this.raw.on('error', reject);
    });
  }
}