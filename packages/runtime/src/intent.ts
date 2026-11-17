/**
 * Intent verification.
 *
 * Decorators such as tPure, tReadOnly, tTenantIsolated and tIdempotent
 * declare what a method promises. The interceptors in this file check those
 * promises while the code runs, so a broken promise fails a test or shows up
 * in production telemetry instead of becoming a data leak or a double charge.
 *
 *   order  50  tDeprecated       warn on use; violation after `removeAfter`
 *   order  60  tSlo              latency / error-rate tracking and breach events
 *   order  70  tPure, tReadOnly  open a side-effect scope for the call tree
 *   order  75  tSideEffect       report the declared side effect to the caller's scope
 *   order  80  tTenantIsolated   require a tenant; reject results from other tenants
 *   order  90  tIdempotent       replay the stored result for a repeated key
 *   order 120  tDeadline         reject calls after an absolute timestamp
 *
 * Side effects are reported with `reportSideEffect(kind)`. @axiljs/orm reports
 * 'db.read' / 'db.write' for every query; `installSideEffectProbes()` adds
 * fetch and filesystem writes. Other packages can report without importing
 * this one through `globalThis[Symbol.for('axiljs.intent.report')]`.
 *
 * Modes (configureIntent): 'enforce' throws IntentViolationError (default
 * outside production), 'warn' records and emits only (default in production),
 * 'off' disables the checks.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { axilError } from '@axiljs/common';
import { getContext } from './context';
import { emitSafe } from './emit';
import { label, resolveKey } from './keys';
import type { KeySpec } from './keys';
import { registerInterceptor } from './interceptors';
import type { Interceptor, Invocation } from './interceptors';

// ─── Mode and violations ──────────────────────────────────────────────────────

export type IntentMode = 'enforce' | 'warn' | 'off';

export interface IntentViolation {
  decorator: string;
  target: string;
  detail: string;
  requestId?: string;
  tenantId?: string;
  timestamp: string;
}

export class IntentViolationError extends axilError {
  constructor(public readonly violation: IntentViolation) {
    super(`${violation.target} violates ${violation.decorator}: ${violation.detail}`, 500, 'INTENT_VIOLATION', violation);
    this.name = 'IntentViolationError';
  }
}

let mode: IntentMode = process.env.NODE_ENV === 'production' ? 'warn' : 'enforce';
const MAX_VIOLATIONS = 500;
const violations: IntentViolation[] = [];
const warned = new Set<string>();

export function configureIntent(options: { mode?: IntentMode }): void {
  if (options.mode) mode = options.mode;
}

export function getIntentMode(): IntentMode {
  return mode;
}

/** Violations recorded since start (most recent last, capped at 500). */
export function getIntentViolations(): IntentViolation[] {
  return [...violations];
}

export function clearIntentViolations(): void {
  violations.length = 0;
  warned.clear();
}

/**
 * Record a broken promise. Throws in 'enforce' mode; records, emits
 * 'runtime.intent.violation' and warns once per target in 'warn' mode.
 */
export function violate(decorator: string, target: string, detail: string): void {
  if (mode === 'off') return;
  const ctx = getContext();
  const violation: IntentViolation = {
    decorator,
    target,
    detail,
    requestId: ctx?.requestId,
    tenantId: ctx?.tenantId,
    timestamp: new Date().toISOString()
  };
  violations.push(violation);
  if (violations.length > MAX_VIOLATIONS) violations.shift();
  emitSafe('runtime.intent.violation', violation);

  if (mode === 'enforce') throw new IntentViolationError(violation);

  const once = `${decorator}|${target}|${detail}`;
  if (!warned.has(once)) {
    warned.add(once);
    process.emitWarning(`${target} violates ${decorator}: ${detail}`, 'IntentViolationWarning');
  }
}

// ─── Side-effect scopes (tPure / tReadOnly / tSideEffect) ─────────────────────

interface Scope {
  readonly decorator: 'tPure' | 'tReadOnly';
  readonly target: string;
  readonly parent?: Scope;
}

const scopes = new AsyncLocalStorage<Scope>();

/** Kinds a tReadOnly method may perform. Everything else counts as a write. */
const READ_KINDS = new Set(['db.read', 'network.read', 'fs.read', 'cache.read']);

/**
 * Report a side effect performed by the current call. Inside a tPure scope
 * every kind is a violation; inside tReadOnly every non-read kind is.
 * Call it before performing the effect so 'enforce' mode can prevent it.
 */
export function reportSideEffect(kind: string, detail?: string): void {
  for (let scope = scopes.getStore(); scope; scope = scope.parent) {
    const forbidden = scope.decorator === 'tPure' || !READ_KINDS.has(kind);
    if (forbidden) {
      const what = detail ? `${kind} (${detail})` : kind;
      violate(scope.decorator, scope.target, `performed side effect ${what}`);
    }
  }
}

/** The innermost tPure / tReadOnly scope, if any. */
export function currentIntentScope(): { decorator: string; target: string } | undefined {
  const scope = scopes.getStore();
  return scope ? { decorator: scope.decorator, target: scope.target } : undefined;
}

// Let other packages report without a dependency on this one
(globalThis as any)[Symbol.for('axiljs.intent.report')] = reportSideEffect;

function scopeInterceptor(decorator: 'tPure' | 'tReadOnly'): Interceptor<Record<string, never>> {
  return {
    decorator,
    order: 70,
    intercept(inv, _options, proceed) {
      if (mode === 'off') return proceed();
      const scope: Scope = { decorator, target: label(inv), parent: scopes.getStore() };
      return scopes.run(scope, proceed);
    }
  };
}

export const pureInterceptor = scopeInterceptor('tPure');
export const readOnlyInterceptor = scopeInterceptor('tReadOnly');

export const sideEffectInterceptor: Interceptor<{ kind: string }> = {
  decorator: 'tSideEffect',
  order: 75,
  intercept(inv, { kind }, proceed) {
    reportSideEffect(kind, label(inv));
    return proceed();
  }
};

// ─── Probes ───────────────────────────────────────────────────────────────────

export interface SideEffectProbeOptions {
  /** Report global fetch() calls: GET/HEAD as 'network.read', others as 'network.write' (default: true). */
  fetch?: boolean;
  /** Report node:fs writes (writeFile, appendFile, rm, unlink, rename, mkdir…) as 'fs.write' (default: true). */
  fs?: boolean;
}

/**
 * Patch fetch and node:fs so their effects are reported to the current
 * tPure / tReadOnly scope. Outside a scope the patched functions behave
 * exactly like the originals. Returns a function that removes the probes.
 * Intended for development and tests.
 */
export function installSideEffectProbes(options: SideEffectProbeOptions = {}): () => void {
  const restore: Array<() => void> = [];

  if (options.fetch !== false && typeof globalThis.fetch === 'function') {
    const original = globalThis.fetch;
    const probed: typeof fetch = (input: any, init?: any) => {
      if (scopes.getStore()) {
        const method = String(init?.method ?? input?.method ?? 'GET').toUpperCase();
        const url = typeof input === 'string' ? input : input?.url ?? String(input);
        reportSideEffect(method === 'GET' || method === 'HEAD' ? 'network.read' : 'network.write', `${method} ${url}`);
      }
      return original(input, init);
    };
    globalThis.fetch = probed;
    restore.push(() => { globalThis.fetch = original; });
  }

  if (options.fs !== false) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('node:fs');
    const names = [
      'writeFile', 'writeFileSync', 'appendFile', 'appendFileSync', 'rm', 'rmSync',
      'unlink', 'unlinkSync', 'rename', 'renameSync', 'mkdir', 'mkdirSync',
      'copyFile', 'copyFileSync', 'truncate', 'truncateSync'
    ];
    const patch = (holder: any, name: string, prefix: string) => {
      const original = holder[name];
      if (typeof original !== 'function') return;
      holder[name] = function (this: unknown, ...args: unknown[]) {
        if (scopes.getStore()) reportSideEffect('fs.write', `${prefix}${name} ${String(args[0])}`);
        return original.apply(this, args);
      };
      restore.push(() => { holder[name] = original; });
    };
    for (const name of names) patch(fs, name, 'fs.');
    for (const name of names) if (!name.endsWith('Sync')) patch(fs.promises, name, 'fs.promises.');
  }

  return () => { while (restore.length) restore.pop()!(); };
}

// ─── tTenantIsolated ──────────────────────────────────────────────────────────

const TENANT_FIELDS = ['tenantId', 'tenant_id', 'tenant'];

/** Find a row whose tenant field differs from `tenantId` (depth-limited walk). */
function foreignTenant(value: unknown, tenantId: string, depth = 0): string | undefined {
  if (value === null || typeof value !== 'object' || depth > 3) return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = foreignTenant(item, tenantId, depth + 1);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  for (const field of TENANT_FIELDS) {
    const v = (value as any)[field];
    if (typeof v === 'string' || typeof v === 'number') {
      if (String(v) !== tenantId) return String(v);
    } else if (v && typeof v === 'object' && (typeof v.id === 'string' || typeof v.id === 'number')) {
      if (String(v.id) !== tenantId) return String(v.id);
    }
  }
  for (const key of ['data', 'items', 'rows', 'results', 'metadata']) {
    const found = foreignTenant((value as any)[key], tenantId, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

export const tenantIsolatedInterceptor: Interceptor<Record<string, never>> = {
  decorator: 'tTenantIsolated',
  order: 80,
  async intercept(inv, _options, proceed) {
    if (mode === 'off') return proceed();
    const tenantId = getContext()?.tenantId;
    if (!tenantId) {
      violate('tTenantIsolated', label(inv), 'called without a tenant in the request context');
      return proceed();
    }
    const result = await proceed();
    const other = foreignTenant(result, String(tenantId));
    if (other !== undefined) {
      violate('tTenantIsolated', label(inv), `returned data of tenant '${other}' to tenant '${tenantId}'`);
    }
    return result;
  }
};

// ─── tIdempotent ──────────────────────────────────────────────────────────────

/**
 * Where completed results of tIdempotent methods are kept. The default is
 * in-memory (per process); plug in a shared store for multi-instance apps.
 * Values must be JSON-serializable for shared stores.
 */
export interface IdempotencyStore {
  get(key: string): unknown | Promise<unknown>;
  set(key: string, value: { result: unknown }, ttlMs: number): void | Promise<void>;
  delete?(key: string): void | Promise<void>;
}

export class MemoryIdempotencyStore implements IdempotencyStore {
  private entries = new Map<string, { value: { result: unknown }; expires: number }>();

  get(key: string): unknown {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expires <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key: string, value: { result: unknown }, ttlMs: number): void {
    this.entries.set(key, { value, expires: Date.now() + ttlMs });
    if (this.entries.size % 1000 === 0) this.prune();
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  private prune(): void {
    const now = Date.now();
    for (const [key, entry] of this.entries) if (entry.expires <= now) this.entries.delete(key);
  }
}

let idempotencyStore: IdempotencyStore = new MemoryIdempotencyStore();
const inFlight = new Map<string, Promise<unknown>>();

export function setIdempotencyStore(store: IdempotencyStore): void {
  idempotencyStore = store;
}

export const idempotentInterceptor: Interceptor<{ key: KeySpec; ttl?: number }> = {
  decorator: 'tIdempotent',
  order: 90,
  async intercept(inv, options, proceed) {
    const key = resolveKey(options.key, inv);
    if (key === undefined) {
      violate('tIdempotent', label(inv), `no idempotency key (spec '${String(options.key)}')`);
      return proceed();
    }

    const full = `${label(inv)}:${key}`;
    const running = inFlight.get(full);
    if (running) {
      emitSafe('runtime.idempotent.replay', { target: label(inv), key, inFlight: true });
      return running;
    }

    // Registered before the first await so concurrent duplicates join this call
    const promise = (async () => {
      const stored = await idempotencyStore.get(full) as { result: unknown } | undefined;
      if (stored && typeof stored === 'object' && 'result' in stored) {
        emitSafe('runtime.idempotent.replay', { target: label(inv), key, inFlight: false });
        return stored.result;
      }
      const result = await proceed();
      // Failures are not stored, so the caller may retry with the same key
      await idempotencyStore.set(full, { result }, options.ttl ?? 86_400_000);
      return result;
    })();
    inFlight.set(full, promise);
    try {
      return await promise;
    } finally {
      inFlight.delete(full);
    }
  }
};

// ─── tSlo ─────────────────────────────────────────────────────────────────────

export interface SloReport {
  target: string;
  samples: number;
  percentile: number;
  observedMs: number;
  targetMs?: number;
  errorRate: number;
  errorBudget?: number;
  meetsLatency: boolean;
  meetsErrorBudget: boolean;
}

interface SloSeries {
  options: { latency?: number; percentile?: number; errorBudget?: number };
  durations: number[];
  errors: boolean[];
  next: number;
  breached: boolean;
}

const SLO_WINDOW = 1000;
const SLO_CHECK_EVERY = 50;
const SLO_MIN_SAMPLES = 20;
const sloSeries = new Map<string, SloSeries>();

function percentileOf(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[rank];
}

function reportFor(target: string, series: SloSeries): SloReport {
  const p = series.options.percentile ?? 99;
  const observedMs = percentileOf(series.durations, p);
  const failures = series.errors.filter(Boolean).length;
  const errorRate = series.errors.length ? failures / series.errors.length : 0;
  const { latency, errorBudget } = series.options;
  return {
    target,
    samples: series.durations.length,
    percentile: p,
    observedMs,
    targetMs: latency,
    errorRate,
    errorBudget,
    meetsLatency: latency === undefined || observedMs <= latency,
    // errorBudget is a fraction (0.001 = 99.9 %) or a percentage (0.1 = 0.1 %) when > 1 is impossible; treat <= 1 as fraction
    meetsErrorBudget: errorBudget === undefined || errorRate <= errorBudget
  };
}

/** Current SLO status of every tSlo method that has been called. */
export function getSloReport(): SloReport[] {
  return [...sloSeries].map(([target, series]) => reportFor(target, series));
}

export function resetSloReport(): void {
  sloSeries.clear();
}

export const sloInterceptor: Interceptor<{ latency?: number; percentile?: number; errorBudget?: number }> = {
  decorator: 'tSlo',
  order: 60,
  async intercept(inv, options, proceed) {
    const target = label(inv);
    let series = sloSeries.get(target);
    if (!series) {
      series = { options, durations: [], errors: [], next: 0, breached: false };
      sloSeries.set(target, series);
    }

    const started = performance.now();
    let failed = false;
    try {
      return await proceed();
    } catch (err) {
      failed = true;
      throw err;
    } finally {
      const s = series;
      const ms = performance.now() - started;
      if (s.durations.length < SLO_WINDOW) {
        s.durations.push(ms);
        s.errors.push(failed);
      } else {
        s.durations[s.next] = ms;
        s.errors[s.next] = failed;
        s.next = (s.next + 1) % SLO_WINDOW;
      }

      const count = s.durations.length;
      if (count >= SLO_MIN_SAMPLES && count % SLO_CHECK_EVERY === 0 || (count === SLO_WINDOW && s.next % SLO_CHECK_EVERY === 0)) {
        const report = reportFor(target, s);
        const ok = report.meetsLatency && report.meetsErrorBudget;
        if (!ok && !s.breached) emitSafe('runtime.slo.breach', report);
        if (ok && s.breached) emitSafe('runtime.slo.recovered', report);
        s.breached = !ok;
      }
    }
  }
};

// ─── tDeprecated ──────────────────────────────────────────────────────────────

export const deprecatedInterceptor: Interceptor<{ since?: string; removeAfter?: string; replacement?: string; message?: string }> = {
  decorator: 'tDeprecated',
  order: 50,
  intercept(inv, options, proceed) {
    const target = label(inv);
    if (!warned.has(`deprecated|${target}`)) {
      warned.add(`deprecated|${target}`);
      const parts = [`${target} is deprecated`];
      if (options.since) parts.push(`since ${options.since}`);
      if (options.replacement) parts.push(`use ${options.replacement} instead`);
      if (options.message) parts.push(options.message);
      process.emitWarning(parts.join('; '), 'DeprecationWarning');
    }
    emitSafe('runtime.deprecated', { target, ...options });

    if (options.removeAfter) {
      const due = Date.parse(options.removeAfter);
      if (Number.isFinite(due) && Date.now() > due) {
        violate('tDeprecated', target, `still called after its removal date ${options.removeAfter}`);
      }
    }
    return proceed();
  }
};

// ─── tDeadline ────────────────────────────────────────────────────────────────

export class DeadlineExceededError extends axilError {
  constructor(public readonly target: string, public readonly deadline: string) {
    super(`${target} is not available after ${deadline}`, 410, 'DEADLINE_EXCEEDED');
    this.name = 'DeadlineExceededError';
  }
}

export const deadlineInterceptor: Interceptor<{ at: string | Date }> = {
  decorator: 'tDeadline',
  order: 120,
  intercept(inv, { at }, proceed) {
    const due = at instanceof Date ? at.getTime() : Date.parse(at);
    if (Number.isFinite(due) && Date.now() > due) {
      return Promise.reject(new DeadlineExceededError(label(inv), new Date(due).toISOString()));
    }
    return proceed();
  }
};

// ─── Registration ─────────────────────────────────────────────────────────────

export function registerIntentInterceptors(): void {
  for (const interceptor of [
    deprecatedInterceptor,
    sloInterceptor,
    pureInterceptor,
    readOnlyInterceptor,
    sideEffectInterceptor,
    tenantIsolatedInterceptor,
    idempotentInterceptor,
    deadlineInterceptor
  ]) {
    registerInterceptor(interceptor as Interceptor);
  }
}

export type { Invocation };
