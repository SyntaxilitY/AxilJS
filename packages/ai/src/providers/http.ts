/**
 * Shared HTTP transport for the AI providers.
 * Pure node:http / node:https - no external dependencies.
 *
 * Features:
 *   - Retries with exponential backoff + jitter on 408/429/5xx and
 *     transient network errors, honoring `retry-after` / `retry-after-ms`
 *   - Cancellation via AbortSignal and an overall request deadline (timeoutMs)
 *   - Per-attempt socket idle timeout (the provider-level timeoutMs)
 *   - Line streaming (SSE / NDJSON) that only retries before the first line
 *     has been yielded to the caller
 */

import * as http from 'http';
import * as https from 'https';

// ─── Errors ───────────────────────────────────────────────────────────────────

/**
 * Error thrown for non-2xx provider responses.
 * `status` is the HTTP status, `body` the raw response text.
 */
export class AIHttpError extends Error {
  status?: number;
  body?: string;
  retryAfterMs?: number;
  code?: string;

  constructor(message: string, init: { status?: number; body?: string; retryAfterMs?: number; code?: string } = {}) {
    super(message);
    this.name = 'AIHttpError';
    this.status = init.status;
    this.body = init.body;
    this.retryAfterMs = init.retryAfterMs;
    this.code = init.code;
  }
}

// ─── Options ──────────────────────────────────────────────────────────────────

export interface HttpRequestOptions {
  // Provider label used in error messages ('OpenAI', 'Anthropic', ...)
  label: string;

  // Absolute request URL
  url: string;

  // Extra request headers (Content-Type / Content-Length are added)
  headers?: Record<string, string>;

  // JSON request body
  body: unknown;

  // Retries after the first attempt (default: 2)
  maxRetries?: number;

  // Base delay for exponential backoff (default: 500ms)
  retryBaseDelayMs?: number;

  // Upper bound for any single retry delay, including retry-after (default: 30000ms)
  retryMaxDelayMs?: number;

  // Per-attempt socket idle timeout (provider-level timeoutMs)
  idleTimeoutMs?: number;

  // Caller cancellation
  signal?: AbortSignal;

  // Overall deadline across all attempts
  timeoutMs?: number;

  // Port when the URL has none and the protocol is http (default: 80)
  defaultPort?: number;

  // Treat a parsed 2xx body as an error (e.g. Ollama's { error })
  isErrorBody?: (parsed: any) => boolean;

  // Build the error for an unparseable 2xx body
  invalidJson?: (raw: string, status: number) => Error;

  // Rewrite a final (non-HTTP, non-abort) network error
  wrapNetworkError?: (err: Error) => Error;
}

export const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_BASE_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 30000;

const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);
const RETRYABLE_CODES = new Set([
  'ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'EAI_AGAIN',
  'ENETUNREACH', 'EHOSTUNREACH', 'ENETDOWN', 'ECONNABORTED'
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function abortError(label: string, reason?: unknown): Error {
  if (reason instanceof Error && (reason.name === 'AbortError' || reason.name === 'TimeoutError')) {
    return reason;
  }
  const err = new Error(`${label} request aborted`);
  err.name = 'AbortError';
  if (reason !== undefined) (err as any).cause = reason;
  return err;
}

function timeoutError(message: string): Error {
  const err = new Error(message);
  err.name = 'TimeoutError';
  return err;
}

/**
 * Combine the caller's signal and an overall deadline into one signal.
 * Its `reason` is always an Error named AbortError or TimeoutError.
 */
export function linkSignal(
  label: string,
  signal?: AbortSignal,
  timeoutMs?: number
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const onAbort = () => controller.abort(abortError(label, signal?.reason));

  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }

  if (timeoutMs !== undefined && timeoutMs > 0 && !controller.signal.aborted) {
    timer = setTimeout(() => {
      controller.abort(timeoutError(`${label} request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      if (timer) clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  };
}

/**
 * Parse retry-after-ms / retry-after (seconds or HTTP date) into ms.
 */
export function parseRetryAfter(headers: http.IncomingHttpHeaders): number | undefined {
  const ms = headers['retry-after-ms'];
  if (typeof ms === 'string' && ms.trim() !== '') {
    const n = Number(ms);
    if (Number.isFinite(n) && n >= 0) return n;
  }

  const ra = headers['retry-after'];
  if (typeof ra === 'string' && ra.trim() !== '') {
    const seconds = Number(ra);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;

    const date = Date.parse(ra);
    if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  }

  return undefined;
}

function errorMessageFromBody(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed?.error === 'string') return parsed.error;
    if (parsed?.error?.message) return String(parsed.error.message);
    if (parsed?.message) return String(parsed.message);
  } catch {
    // not JSON - fall through to the raw text
  }
  return raw.length > 500 ? raw.slice(0, 500) + '...' : raw;
}

function httpError(
  label: string,
  status: number,
  raw: string,
  headers: http.IncomingHttpHeaders
): AIHttpError {
  return new AIHttpError(
    `${label} API error ${status}: ${errorMessageFromBody(raw)}`,
    { status, body: raw, retryAfterMs: parseRetryAfter(headers) }
  );
}

function isRetryable(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as any;
  if (e.name === 'AbortError' || e.name === 'TimeoutError') return false;
  if (e instanceof AIHttpError && e.status !== undefined) {
    return RETRYABLE_STATUS.has(e.status);
  }
  if (typeof e.code === 'string' && RETRYABLE_CODES.has(e.code)) return true;
  return typeof e.message === 'string' && /socket hang up/i.test(e.message);
}

function retryDelay(err: unknown, attempt: number, opts: HttpRequestOptions): number {
  const max = opts.retryMaxDelayMs ?? DEFAULT_MAX_DELAY_MS;
  const retryAfter = (err as AIHttpError)?.retryAfterMs;
  if (retryAfter !== undefined) return Math.min(retryAfter, max);

  const base = opts.retryBaseDelayMs ?? DEFAULT_BASE_DELAY_MS;
  const exp = Math.min(max, base * Math.pow(2, attempt));
  // "Equal jitter": half fixed, half random - avoids thundering herds
  return Math.round(exp / 2 + Math.random() * (exp / 2));
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }
    const onAbort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

interface Connection {
  req: http.ClientRequest;
  res: http.IncomingMessage;
  // Stop listening for abort; destroys the request if it never completed
  release: () => void;
}

/**
 * Send one POST and resolve once response headers arrive.
 */
function sendOnce(opts: HttpRequestOptions, signal: AbortSignal): Promise<Connection> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(signal.reason); return; }

    const url = new URL(opts.url);
    const isHttps = url.protocol === 'https:';
    const bodyStr = JSON.stringify(opts.body);

    let res: http.IncomingMessage | undefined;
    let settled = false;

    const req = (isHttps ? https : http).request({
      hostname: url.hostname.replace(/^\[|\]$/g, ''),
      port: url.port || (isHttps ? 443 : (opts.defaultPort ?? 80)),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        ...opts.headers,
        'Content-Type': 'application/json',
        'Content-Length': String(Buffer.byteLength(bodyStr))
      }
    });

    const destroyAll = (err: Error) => {
      if (res && !res.complete) res.destroy(err);
      req.destroy(err);
    };

    const onAbort = () => {
      destroyAll(signal.reason);
      if (!settled) { settled = true; reject(signal.reason); }
    };
    signal.addEventListener('abort', onAbort, { once: true });

    const release = () => {
      signal.removeEventListener('abort', onAbort);
      if (res && !res.complete) {
        res.destroy();
        req.destroy();
      }
    };

    req.on('response', (incoming: http.IncomingMessage) => {
      res = incoming;
      if (settled) { incoming.destroy(); return; }
      settled = true;
      resolve({ req, res: incoming, release });
    });

    req.on('error', (err: Error) => {
      if (!settled) {
        settled = true;
        signal.removeEventListener('abort', onAbort);
        reject(err);
      }
    });

    if (opts.idleTimeoutMs && opts.idleTimeoutMs > 0) {
      req.setTimeout(opts.idleTimeoutMs, () => {
        destroyAll(timeoutError(`${opts.label} request timed out after ${opts.idleTimeoutMs}ms`));
      });
    }

    req.end(bodyStr);
  });
}

function readBody(res: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    res.setEncoding('utf8');
    let data = '';
    res.on('data', (chunk: string) => (data += chunk));
    res.on('end', () => resolve(data));
    res.on('error', reject);
    res.on('aborted', () => reject(new Error('socket hang up')));
  });
}

function finalError(err: unknown, opts: HttpRequestOptions): Error {
  const e = err as Error;
  if (e instanceof AIHttpError || e?.name === 'AbortError' || e?.name === 'TimeoutError') return e;
  return opts.wrapNetworkError ? opts.wrapNetworkError(e) : e;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Report a request body to @axiljs/runtime's sensitive data lineage ('ai'
 * sink) without depending on it. In enforce mode the hook throws before the
 * request is sent.
 */
function checkSensitiveSink(body: unknown): void {
  const sink = (globalThis as any)[Symbol.for('axiljs.sensitive.sink')];
  if (typeof sink === 'function') sink('ai', body);
}

/**
 * POST JSON and parse a JSON response, retrying transient failures.
 */
export async function requestJson(opts: HttpRequestOptions): Promise<any> {
  checkSensitiveSink(opts.body);
  const maxRetries = Math.max(0, opts.maxRetries ?? DEFAULT_MAX_RETRIES);
  const { signal, cleanup } = linkSignal(opts.label, opts.signal, opts.timeoutMs);

  try {
    for (let attempt = 0; ; attempt++) {
      try {
        const conn = await sendOnce(opts, signal);
        let raw: string;
        try {
          raw = await readBody(conn.res);
        } finally {
          conn.release();
        }

        const status = conn.res.statusCode || 0;
        if (status >= 400) throw httpError(opts.label, status, raw, conn.res.headers);

        let parsed: any;
        try {
          parsed = JSON.parse(raw);
        } catch {
          throw opts.invalidJson
            ? opts.invalidJson(raw, status)
            : new AIHttpError(`${opts.label}: Invalid JSON response: ${raw.slice(0, 500)}`, { status, body: raw });
        }

        if (opts.isErrorBody?.(parsed)) throw httpError(opts.label, status, raw, conn.res.headers);
        return parsed;
      } catch (err) {
        if (signal.aborted) throw signal.reason;
        if (attempt >= maxRetries || !isRetryable(err)) throw finalError(err, opts);
        await sleep(retryDelay(err, attempt, opts), signal);
      }
    }
  } finally {
    cleanup();
  }
}

/**
 * POST JSON and yield the response body line by line (trimmed, non-empty).
 * Works for SSE ("data: ...") and NDJSON. Retries only happen before the
 * first line is yielded. Breaking out of the loop tears the request down.
 */
export async function* requestLines(opts: HttpRequestOptions): AsyncGenerator<string, void, unknown> {
  checkSensitiveSink(opts.body);
  const maxRetries = Math.max(0, opts.maxRetries ?? DEFAULT_MAX_RETRIES);
  const { signal, cleanup } = linkSignal(opts.label, opts.signal, opts.timeoutMs);

  try {
    for (let attempt = 0; ; attempt++) {
      let yielded = false;
      let conn: Connection | undefined;

      try {
        conn = await sendOnce(opts, signal);
        const res = conn.res;
        const status = res.statusCode || 0;

        if (status >= 400) {
          const raw = await readBody(res);
          throw httpError(opts.label, status, raw, res.headers);
        }

        res.setEncoding('utf8');
        let buffer = '';

        for await (const chunk of res) {
          buffer += chunk as string;
          const parts = buffer.split('\n');
          buffer = parts.pop() || '';

          for (const part of parts) {
            const line = part.trim();
            if (line) {
              yielded = true;
              yield line;
            }
          }
        }

        // Flush a final line that was not newline-terminated
        const last = buffer.trim();
        if (last) {
          yielded = true;
          yield last;
        }
        return;
      } catch (err) {
        if (signal.aborted) throw signal.reason;
        if (yielded) throw err;
        if (attempt >= maxRetries || !isRetryable(err)) throw finalError(err, opts);
        await sleep(retryDelay(err, attempt, opts), signal);
      } finally {
        conn?.release();
      }
    }
  } finally {
    cleanup();
  }
}
