/**
 * Key resolution for keyed decorators (tIdempotent, tCache, tDedupe, tLock,
 * tConcurrency, tRateLimit, ...).
 *
 * A key spec is either a function of the call arguments or a string:
 *
 *   (id) => `user:${id}`        called with the method arguments
 *   'request.id'                the request/correlation ID of the context
 *   'header:idempotency-key'    a request header
 *   'user' | 'user.id'          the authenticated user's ID
 *   'tenant'                    the current tenant ID
 *   'ip'                        the client IP
 *   'args.0.orderId'            a path into the arguments
 *   'order:{0.id}'              a template; {…} is a path into the arguments
 *   'global'                    one shared key for every call
 *
 * Any other string is used literally.
 */

import { getContext } from './context';
import type { Invocation } from './interceptors';

export type KeySpec = string | ((...args: any[]) => unknown);

function path(root: unknown, dotted: string): unknown {
  let value: any = root;
  for (const part of dotted.split('.')) {
    if (value === null || value === undefined) return undefined;
    value = value[part];
  }
  return value;
}

function stringify(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

/**
 * Resolve a key spec for one invocation.
 * Returns undefined when the key cannot be determined (missing header, no user…).
 */
export function resolveKey(spec: KeySpec | undefined, inv: Invocation): string | undefined {
  if (spec === undefined) return undefined;
  if (typeof spec === 'function') return stringify(spec.apply(inv.target, inv.args));

  const ctx = getContext();

  if (spec === 'global') return 'global';
  if (spec === 'request.id' || spec === 'requestId') return ctx?.requestId;
  if (spec === 'user' || spec === 'user.id') return stringify(ctx?.user?.id);
  if (spec === 'tenant' || spec === 'tenant.id' || spec === 'tenantId') return ctx?.tenantId;
  if (spec === 'ip') return stringify(ctx?.req?.ip);

  if (spec.startsWith('header:')) {
    const raw = ctx?.req?.headers?.[spec.slice(7).toLowerCase()];
    return stringify(Array.isArray(raw) ? raw[0] : raw);
  }
  if (spec.startsWith('args.')) return stringify(path(inv.args, spec.slice(5)));

  if (spec.includes('{')) {
    let missing = false;
    const out = spec.replace(/\{([^}]+)\}/g, (_, p: string) => {
      const v = stringify(path(inv.args, p.trim()));
      if (v === undefined) missing = true;
      return v ?? '';
    });
    return missing ? undefined : out;
  }

  return spec;
}

/** `Class.method` label used in errors, events and reports. */
export function label(inv: Invocation): string {
  return `${inv.className}.${inv.method}`;
}

/** Parse '10s', '5m', '1h', '1d', '250ms' or a number of milliseconds. */
export function parseDuration(value: string | number): number {
  if (typeof value === 'number') return value;
  const match = /^\s*(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?\s*$/.exec(value);
  if (!match) throw new Error(`Invalid duration '${value}' (expected e.g. '500ms', '10s', '1m', '1h')`);
  const n = Number(match[1]);
  const unit = match[2] ?? 'ms';
  const factor = { ms: 1, s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit]!;
  return n * factor;
}
