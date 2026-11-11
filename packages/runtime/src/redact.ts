/**
 * Redaction driven by @axiljs/decorator metadata.
 *
 *   class User {
 *     @tRedact({ strategy: 'remove' }) password = ''
 *     @tRedact({ strategy: 'mask', visibleChars: 4 }) cardNumber = ''
 *     @tSensitive('PII') email = ''
 *   }
 *
 *   redact(user)
 *   // { cardNumber: '************4242', email: '***', ...rest }  (password removed)
 *
 * `tRedact` fields are always redacted. `tSensitive` fields are masked too
 * unless `includeSensitive: false` (responses keep them; logs and audit
 * events don't).
 */

import { createHash } from 'node:crypto';
import { getMetadata } from '@axiljs/decorator';
import type { TRedactOptions } from '@axiljs/decorator';
import type { axilResponse, MiddlewareFn } from '@axiljs/common';

// ─── Types ────────────────────────────────────────────────────────────────────

export type RedactRule = TRedactOptions | 'mask' | 'hash' | 'remove';

export interface RedactOptions {
  /** Mask `tSensitive` fields as well as `tRedact` ones (default: true). */
  includeSensitive?: boolean;

  /**
   * Rules by field name, for plain objects that carry no metadata
   * (e.g. `{ password: 'remove', authorization: 'mask' }`).
   */
  fields?: Record<string, RedactRule>;

  /** Stop descending past this depth (default: 10). */
  maxDepth?: number;
}

const MASK = '***';

// ─── Core ─────────────────────────────────────────────────────────────────────

function normalize(rule: RedactRule): TRedactOptions {
  return typeof rule === 'string' ? { strategy: rule } : rule;
}

function ruleFor(proto: object | null, key: string, options: RedactOptions): TRedactOptions | undefined {
  if (proto && proto !== Object.prototype) {
    const explicit = getMetadata<TRedactOptions>('tRedact', proto, key);
    if (explicit) return explicit;
    if (options.includeSensitive !== false && getMetadata('tSensitive', proto, key)) {
      return { strategy: 'mask' };
    }
  }
  const named = options.fields?.[key];
  return named === undefined ? undefined : normalize(named);
}

function apply(value: unknown, rule: TRedactOptions): unknown {
  const strategy = rule.strategy ?? 'mask';
  if (value === null || value === undefined) return value;

  if (strategy === 'hash') {
    const digest = createHash('sha256').update(String(value)).digest('hex');
    return `sha256:${digest.slice(0, 16)}`;
  }

  // mask
  if (typeof value !== 'string') return MASK;
  const visible = Math.max(0, Math.floor(rule.visibleChars ?? 0));
  if (visible === 0) return MASK;
  // Never reveal the whole value, even if visibleChars says so
  if (visible >= value.length) return '*'.repeat(value.length);
  return '*'.repeat(value.length - visible) + value.slice(-visible);
}

function walk(value: unknown, options: RedactOptions, depth: number, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date || Buffer.isBuffer(value) || ArrayBuffer.isView(value)) return value;
  if (seen.has(value)) return '[Circular]';
  if (depth >= (options.maxDepth ?? 10)) return value;

  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map(item => walk(item, options, depth + 1, seen));
    }
    if (value instanceof Map) {
      return walk(Object.fromEntries(value), options, depth, seen);
    }

    const proto = Object.getPrototypeOf(value);
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      const raw = (value as Record<string, unknown>)[key];
      const rule = ruleFor(proto, key, options);
      if (rule) {
        if ((rule.strategy ?? 'mask') !== 'remove') out[key] = apply(raw, rule);
      } else {
        out[key] = walk(raw, options, depth + 1, seen);
      }
    }
    return out;
  } finally {
    seen.delete(value);
  }
}

/**
 * Return a redacted plain copy of `value`. The input is never mutated.
 * Class instances come back as plain objects (ready for JSON).
 */
export function redact<T>(value: T, options: RedactOptions = {}): T {
  return walk(value, options, 0, new WeakSet()) as T;
}

// ─── Integrations ─────────────────────────────────────────────────────────────

/**
 * Middleware that redacts every JSON body this response sends,
 * including the `res.success()` / `res.created()` envelope helpers.
 *
 * Defaults to `includeSensitive: false`: a `tSensitive` email still
 * reaches the client, a `tRedact` password never does.
 */
export function redactResponses(options: RedactOptions = {}): MiddlewareFn {
  const opts: RedactOptions = { includeSensitive: false, ...options };

  return (_req, res, next) => {
    const r = res as axilResponse & Record<string, any>;

    const json = r.json;
    r.json = (data: unknown) => json.call(r, redact(data, opts));

    // Envelope helpers go through core's (TS-private) sendResponse
    const send = r.sendResponse;
    if (typeof send === 'function') {
      r.sendResponse = (status: number, code: string, message: string, data?: unknown) =>
        send.call(r, status, code, message, data === undefined ? data : redact(data, opts));
    }

    next();
  };
}

/**
 * Wrap any `{ write(entry) }` log transport (e.g. @axiljs/observability's
 * ConsoleTransport) so every entry is redacted before it is written.
 */
export function redactingTransport<E extends object>(
  inner: { write(entry: E): void },
  options: RedactOptions = {}
): { write(entry: E): void } {
  return {
    write(entry: E) {
      inner.write(redact(entry, options));
    }
  };
}
