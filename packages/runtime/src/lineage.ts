/**
 * Sensitive data lineage.
 *
 * Fields marked `@tSensitive(...)` (or `@tRedact(...)`) are tracked by value
 * for the length of a request. When such a value leaves the process through
 * an exit (sink) that is not allowed, the runtime reports a `tSensitive`
 * intent violation (enforce: IntentViolationError, warn: record + emit +
 * warn once, off: nothing).
 *
 *   Sources  `trackSensitive(value, hint?)`. @axiljs/orm calls it through
 *            `globalThis[Symbol.for('axiljs.sensitive.observe')]` for every
 *            row a repository or model loads.
 *   Sinks    `checkSink(sink, payload, target?)`. Called through
 *            `globalThis[Symbol.for('axiljs.sensitive.sink')]` by
 *            @axiljs/core (response), @axiljs/observability (log),
 *            @axiljs/events (event), @axiljs/queue (queue), @axiljs/ai (ai)
 *            and by `redactingTransport` (log, after redaction).
 *   Allowing `allowSensitive('response', fn)` for one call tree,
 *            `allowSensitive('response')` for the rest of the request, or
 *            `configureLineage({ allow: { response: ['User.email'] } })`
 *            keyed by origin label.
 *
 * Values are compared verbatim (after trim), so a masked or hashed value
 * (redact()) does not match and passes. Only strings of at least 4
 * characters and numbers with at least 4 digits are tracked.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { getDecoratedMethods, getMetadata } from '@axiljs/decorator';
import { getContext } from './context';
import type { RequestContext } from './context';
import { getIntentMode, violate } from './intent';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Built-in exits. Any other string names a custom sink. */
export type SensitiveSink = 'response' | 'log' | 'event' | 'queue' | 'ai' | 'error' | (string & {});

/** A tracked value reached a sink. Never carries the value itself. */
export interface SensitiveLeak {
  /** Where the value came from, e.g. 'User.email'. */
  origin: string;
  /** tSensitive classification ('PII', 'PCI', ...) or 'REDACT' for tRedact fields. */
  classification: string;
  sink: string;
}

/** Extra information for values that carry no metadata themselves. */
export interface ObserveHint {
  /** Entity class whose tSensitive/tRedact property metadata describes plain rows. */
  entity?: Function;
  /** Property name → column name, for rows keyed by column. */
  columns?: Record<string, string>;
}

export interface LineageOptions {
  /** Turn tracking and sink checks on or off (default: true). */
  enabled?: boolean;
  /**
   * Origins allowed per sink. Entries match an origin label ('User.email'),
   * every field of a class ('User.*'), a classification ('PII') or
   * everything ('*'). Replaces the previous allow-list.
   */
  allow?: Record<string, string[]>;
  /** Minimum string length / number of digits to track (default: 4). */
  minLength?: number;
  /** Maximum values tracked per request (default: 500). */
  maxValues?: number;
  /** How deep sources and payloads are walked (default: 8). */
  maxDepth?: number;
}

interface Taint {
  origin: string;
  classification: string;
  /** The value, plus its JSON-escaped form when that differs. */
  forms: string[];
  /** All digits: match only on digit boundaries. */
  numeric: boolean;
}

interface LineageState {
  taints: Map<string, Taint>;
  allowed: Set<string>;
}

// ─── Configuration ────────────────────────────────────────────────────────────

const DEFAULTS = { enabled: true, minLength: 4, maxValues: 500, maxDepth: 8 };
let settings = { ...DEFAULTS };
let allowList = new Map<string, string[]>();

export function configureLineage(options: LineageOptions): void {
  if (options.enabled !== undefined) settings.enabled = options.enabled;
  if (options.minLength !== undefined) settings.minLength = Math.max(1, options.minLength);
  if (options.maxValues !== undefined) settings.maxValues = Math.max(0, options.maxValues);
  if (options.maxDepth !== undefined) settings.maxDepth = Math.max(1, options.maxDepth);
  if (options.allow) allowList = new Map(Object.entries(options.allow).map(([sink, list]) => [sink, [...list]]));
}

/** Restore the defaults and clear the allow-list (mainly for tests). */
export function resetLineage(): void {
  settings = { ...DEFAULTS };
  allowList = new Map();
}

// ─── Per-request state ────────────────────────────────────────────────────────

const BAG_KEY = 'axiljs.lineage';

function stateOf(ctx: RequestContext, create: boolean): LineageState | undefined {
  let state = ctx.bag.get(BAG_KEY) as LineageState | undefined;
  if (!state && create) {
    state = { taints: new Map(), allowed: new Set() };
    ctx.bag.set(BAG_KEY, state);
  }
  return state;
}

/** Origin labels tracked in the current request (values are never exposed). */
export function trackedSensitiveOrigins(): string[] {
  const ctx = getContext();
  const state = ctx && stateOf(ctx, false);
  if (!state) return [];
  return [...new Set([...state.taints.values()].map(t => t.origin))];
}

// ─── Sources ──────────────────────────────────────────────────────────────────

function isOpaque(value: object): boolean {
  return value instanceof Date || Buffer.isBuffer(value) || ArrayBuffer.isView(value) || value instanceof RegExp;
}

function addTaint(state: LineageState, raw: unknown, origin: string, classification: string): void {
  let text: string;
  if (typeof raw === 'string') {
    text = raw.trim();
    if (text.length < settings.minLength) return;
  } else if ((typeof raw === 'number' && Number.isFinite(raw)) || typeof raw === 'bigint') {
    text = String(raw);
    if (text.replace(/\D/g, '').length < settings.minLength) return;
  } else {
    return;
  }
  if (state.taints.has(text) || state.taints.size >= settings.maxValues) return;

  const forms = [text];
  const escaped = JSON.stringify(text).slice(1, -1);
  if (escaped !== text) forms.push(escaped);
  state.taints.set(text, { origin, classification, forms, numeric: /^\d+$/.test(text) });
}

function classificationOf(proto: object, key: string): string | undefined {
  const sensitive = getMetadata<{ classification?: string }>('tSensitive', proto, key);
  if (sensitive) return sensitive.classification ?? 'SENSITIVE';
  return getMetadata('tRedact', proto, key) ? 'REDACT' : undefined;
}

function trackFields(state: LineageState, record: Record<string, unknown>, proto: object, columns?: Record<string, string>): void {
  const className = (proto as { constructor?: Function }).constructor?.name || 'Object';
  for (const key of getDecoratedMethods(proto)) {
    const classification = classificationOf(proto, key);
    if (!classification) continue;
    const column = columns?.[key];
    const value = column !== undefined && column in record ? record[column] : record[key];
    if (Array.isArray(value)) {
      for (const item of value) addTaint(state, item, `${className}.${key}`, classification);
    } else {
      addTaint(state, value, `${className}.${key}`, classification);
    }
  }
}

function walkSource(state: LineageState, value: unknown, hint: ObserveHint | undefined, depth: number, seen: Set<object>): void {
  if (value === null || typeof value !== 'object' || isOpaque(value)) return;
  if (seen.has(value) || depth >= settings.maxDepth) return;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) walkSource(state, item, hint, depth + 1, seen);
    return;
  }
  if (value instanceof Map || value instanceof Set) {
    for (const item of value.values()) walkSource(state, item, hint, depth + 1, seen);
    return;
  }

  const record = value as Record<string, unknown>;
  const proto = Object.getPrototypeOf(value);
  if (proto && proto !== Object.prototype) {
    trackFields(state, record, proto);
  } else if (hint?.entity?.prototype) {
    // A plain row loaded for an entity class
    trackFields(state, record, hint.entity.prototype, hint.columns);
  }

  // Nested entities (eager-loaded relations, wrapper objects)
  for (const key of Object.keys(record)) {
    const child = record[key];
    if (child !== null && typeof child === 'object') walkSource(state, child, undefined, depth + 1, seen);
  }
}

/**
 * Track the tSensitive / tRedact field values of `value` for the rest of the
 * current request. Walks arrays, maps and nested objects (cycle-safe, depth
 * limited). Plain rows are read through `hint.entity`'s metadata. No-op
 * outside a request context or when lineage is disabled.
 */
export function trackSensitive(value: unknown, hint?: ObserveHint): void {
  if (!settings.enabled) return;
  const ctx = getContext();
  if (!ctx || value === null || typeof value !== 'object') return;
  walkSource(stateOf(ctx, true)!, value, hint, 0, new Set());
}

// ─── Allowing ─────────────────────────────────────────────────────────────────

const allowedScope = new AsyncLocalStorage<ReadonlySet<string>>();

function toList(sinks: SensitiveSink | SensitiveSink[]): string[] {
  return Array.isArray(sinks) ? sinks : [sinks];
}

/**
 * Allow tracked values to reach `sinks`.
 *
 *   allowSensitive('response', () => res.success(user))  // only inside fn
 *   allowSensitive('response')                           // rest of this request
 *
 * Pass '*' to allow every sink. Without fn and outside a request context
 * this is a no-op.
 */
export function allowSensitive<T>(sinks: SensitiveSink | SensitiveSink[], fn: () => T): T;
export function allowSensitive(sinks: SensitiveSink | SensitiveSink[]): void;
export function allowSensitive<T>(sinks: SensitiveSink | SensitiveSink[], fn?: () => T): T | void {
  if (fn) {
    const merged = new Set(allowedScope.getStore() ?? []);
    for (const sink of toList(sinks)) merged.add(sink);
    return allowedScope.run(merged, fn);
  }
  const ctx = getContext();
  if (!ctx) return;
  const state = stateOf(ctx, true)!;
  for (const sink of toList(sinks)) state.allowed.add(sink);
}

function sinkAllowed(state: LineageState, sink: string): boolean {
  const scoped = allowedScope.getStore();
  if (scoped && (scoped.has(sink) || scoped.has('*'))) return true;
  return state.allowed.has(sink) || state.allowed.has('*');
}

function originAllowed(sink: string, taint: Taint): boolean {
  const list = [...(allowList.get(sink) ?? []), ...(allowList.get('*') ?? [])];
  if (list.length === 0) return false;
  const cls = taint.origin.slice(0, taint.origin.lastIndexOf('.'));
  return list.some(entry =>
    entry === '*' || entry === taint.origin || entry === taint.classification || entry === `${cls}.*`
  );
}

// ─── Sinks ────────────────────────────────────────────────────────────────────

const DIGIT = /\d/;

function contains(haystack: string, taint: Taint): boolean {
  for (const form of taint.forms) {
    let from = 0;
    for (;;) {
      const at = haystack.indexOf(form, from);
      if (at === -1) break;
      if (!taint.numeric) return true;
      // '1234' must not match inside '912345'
      const before = at > 0 ? haystack[at - 1] : '';
      const after = haystack[at + form.length] ?? '';
      if (!DIGIT.test(before) && !DIGIT.test(after)) return true;
      from = at + 1;
    }
  }
  return false;
}

const MAX_SCAN_BYTES = 1_048_576;

function scanText(text: string, taints: Taint[], hits: Set<Taint>): void {
  for (const taint of taints) {
    if (!hits.has(taint) && contains(text, taint)) hits.add(taint);
  }
}

function scan(value: unknown, taints: Taint[], hits: Set<Taint>, depth: number, seen: Set<object>): void {
  if (hits.size === taints.length) return;
  if (typeof value === 'string') { scanText(value, taints, hits); return; }
  if (typeof value === 'number' || typeof value === 'bigint') { scanText(String(value), taints, hits); return; }
  if (value === null || typeof value !== 'object') return;

  if (Buffer.isBuffer(value)) {
    if (value.length <= MAX_SCAN_BYTES) scanText(value.toString('utf8'), taints, hits);
    return;
  }
  if (isOpaque(value) || seen.has(value) || depth >= settings.maxDepth) return;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) scan(item, taints, hits, depth + 1, seen);
    return;
  }
  if (value instanceof Map) {
    for (const [k, v] of value) { scan(k, taints, hits, depth + 1, seen); scan(v, taints, hits, depth + 1, seen); }
    return;
  }
  if (value instanceof Set) {
    for (const item of value) scan(item, taints, hits, depth + 1, seen);
    return;
  }

  // Scan what JSON.stringify would write
  const toJSON = (value as { toJSON?: unknown }).toJSON;
  if (typeof toJSON === 'function') {
    try {
      scan(toJSON.call(value), taints, hits, depth + 1, seen);
    } catch {
      // A failing toJSON fails serialization too; nothing leaves
    }
    return;
  }
  for (const key of Object.keys(value)) {
    scanText(key, taints, hits);
    scan((value as Record<string, unknown>)[key], taints, hits, depth + 1, seen);
  }
}

function routeOf(ctx: RequestContext): string | undefined {
  const req = ctx.req as { method?: string; path?: string; url?: string } | undefined;
  if (!req?.method) return undefined;
  return `${req.method} ${req.path ?? req.url ?? ''}`.trim();
}

/** Sinks being checked right now by an outer call (redactingTransport → inner transport). */
const checkedSinks = new Set<string>();
let reporting = false;

/**
 * Check a payload that is about to leave through `sink`. Returns the leaks
 * found (empty when nothing tracked reached it or the sink is allowed) and
 * reports them as one `tSensitive` violation against `target` (default: the
 * current route, else the sink name). Raw values never appear in the report.
 */
export function checkSink(sink: SensitiveSink, payload: unknown, target?: string): SensitiveLeak[] {
  if (!settings.enabled || reporting || checkedSinks.has(sink)) return [];
  const ctx = getContext();
  if (!ctx || getIntentMode() === 'off') return [];
  const state = stateOf(ctx, false);
  if (!state || state.taints.size === 0 || sinkAllowed(state, sink)) return [];

  const taints = [...state.taints.values()].filter(t => !originAllowed(sink, t));
  if (taints.length === 0) return [];

  const hits = new Set<Taint>();
  scan(payload, taints, hits, 0, new Set());
  if (hits.size === 0) return [];

  const leaks: SensitiveLeak[] = [];
  const reported = new Set<string>();
  for (const taint of hits) {
    if (reported.has(taint.origin)) continue;
    reported.add(taint.origin);
    leaks.push({ origin: taint.origin, classification: taint.classification, sink });
  }

  const detail = `${leaks.map(l => `${l.origin} (${l.classification})`).join(', ')} reached ${sink}`;
  reporting = true;
  try {
    violate('tSensitive', target ?? routeOf(ctx) ?? sink, detail);
  } finally {
    reporting = false;
  }
  return leaks;
}

/**
 * Run `fn` (synchronously) without checking `sink` again. For wrappers that
 * already checked the payload they hand to an inner sink.
 */
export function withSinkChecked<T>(sink: SensitiveSink, fn: () => T): T {
  if (checkedSinks.has(sink)) return fn();
  checkedSinks.add(sink);
  try {
    return fn();
  } finally {
    checkedSinks.delete(sink);
  }
}

// Let other packages report sources and sinks without depending on this one
(globalThis as any)[Symbol.for('axiljs.sensitive.observe')] = trackSensitive;
(globalThis as any)[Symbol.for('axiljs.sensitive.sink')] = checkSink;
