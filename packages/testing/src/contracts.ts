/**
 * Contract testing helpers.
 * Turn declared intent (idempotency, tenant isolation, runtime intent) into
 * executable checks over HTTP, using the same TestClient as everything else.
 *
 * This module deliberately does not import @axiljs/runtime (runtime depends
 * on this package). Runtime state is read through a duck-typed global hook.
 *
 * Usage:
 *   const client = createTestClient(app)
 *
 *   await expectIdempotent(client, { method: 'POST', path: '/orders', body: { sku: 'A1' } })
 *
 *   await expectTenantIsolated(client, {
 *     seed: [
 *       { tenant: 'acme',   as: { 'x-tenant-id': 'acme' } },
 *       { tenant: 'globex', as: { 'x-tenant-id': 'globex' } }
 *     ],
 *     read: { path: '/invoices' },
 *     tenantOf: row => row.tenantId
 *   })
 *
 *   await expectNoIntentViolations(async () => { await client.get('/report') })
 */

import { randomUUID } from 'crypto';
import { AssertionError } from './assertions/expect';
import { deepEqual } from './utils/deep-equal';
import type { TestRequest, TestResponse } from './http/test-client';

// ─── Shared types ─────────────────────────────────────────────────────────────

export type ContractMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** A request described as data, so contract helpers can replay it. */
export interface RequestSpec {
  /** HTTP method (case-insensitive). Default: 'GET'. */
  method?: ContractMethod | Lowercase<ContractMethod>;
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
}

/** Anything shaped like TestClient (createTestClient(app) returns one). */
export interface ContractClient {
  get(path: string): TestRequest;
  post(path: string): TestRequest;
  put(path: string): TestRequest;
  patch(path: string): TestRequest;
  delete(path: string): TestRequest;
}

/**
 * Credentials for a tenant: either a plain header map
 * (`{ authorization: 'Bearer …' }`) or a partial RequestSpec merged over the
 * base request (`{ headers: {...}, path: '/other' }`).
 */
export type RequestAs = Record<string, string> | Partial<RequestSpec>;

/** Thrown when a contract does not hold. Same class as expect() failures. */
export class ContractViolationError extends AssertionError {
  constructor(
    message: string,
    public readonly contract: 'idempotent' | 'tenant-isolated' | 'no-intent-violations',
    public readonly report: unknown
  ) {
    super(message);
    this.name = 'AssertionError';
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const METHODS: ReadonlyArray<string> = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

function fmt(value: unknown, max = 200): string {
  let text: string;
  if (value === undefined) text = 'undefined';
  else if (typeof value === 'string') text = JSON.stringify(value);
  else {
    try {
      text = JSON.stringify(value) ?? String(value);
    } catch {
      text = String(value);
    }
  }
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function describeRequest(spec: RequestSpec): string {
  return `${(spec.method || 'GET').toUpperCase()} ${spec.path}`;
}

function hasHeader(headers: Record<string, string> | undefined, name: string): boolean {
  const lower = name.toLowerCase();
  return !!headers && Object.keys(headers).some(key => key.toLowerCase() === lower);
}

/** Send a RequestSpec through a TestClient-like object. */
function sendSpec(client: ContractClient, spec: RequestSpec): Promise<TestResponse> {
  const method = (spec.method || 'GET').toUpperCase();
  if (!METHODS.includes(method)) {
    throw new AssertionError(`Unsupported method ${fmt(spec.method)} (expected one of ${METHODS.join(', ')})`);
  }
  const factory = (client as any)[method.toLowerCase()];
  if (typeof factory !== 'function') {
    throw new AssertionError(`Client has no ${method.toLowerCase()}() method; pass createTestClient(app)`);
  }
  let req: TestRequest = factory.call(client, spec.path);
  for (const [name, value] of Object.entries(spec.headers || {})) {
    req = req.set(name, value);
  }
  if (spec.body !== undefined) req = req.send(spec.body);
  // TestRequest is PromiseLike; wrap so callers get a real Promise
  return Promise.resolve(req);
}

const SPEC_KEYS = ['method', 'path', 'headers', 'body'];

/** Merge credentials (`as`) over a base request. */
function applyAs(base: RequestSpec, as: RequestAs | undefined): RequestSpec {
  if (!as) return { ...base, headers: { ...base.headers } };
  const keys = Object.keys(as);
  const isSpec = keys.length > 0 && keys.every(key => SPEC_KEYS.includes(key)) &&
    (typeof (as as any).headers === 'object' || typeof (as as any).path === 'string' ||
      typeof (as as any).method === 'string' || 'body' in as);
  if (isSpec) {
    const partial = as as Partial<RequestSpec>;
    return {
      ...base,
      ...partial,
      path: partial.path ?? base.path,
      headers: { ...base.headers, ...partial.headers }
    };
  }
  return { ...base, headers: { ...base.headers, ...(as as Record<string, string>) } };
}

/** `{ status, code, message, data }` as produced by res.success() & co. */
function isEnvelope(value: unknown): value is { data: unknown } {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    'data' in value && 'status' in value && 'code' in value;
}

/**
 * Remove dotted paths (`meta.timestamp`, `data.*.updatedAt`) from a deep copy.
 * For an AxilJS envelope each path is also applied inside `data`, so the
 * default `timestamp` matches `data.timestamp` too.
 */
function stripPaths(value: unknown, paths: ReadonlyArray<string>): unknown {
  if (value === null || typeof value !== 'object' || paths.length === 0) return value;
  let copy: unknown;
  try {
    copy = JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
  const envelope = isEnvelope(copy);
  for (const path of paths) {
    removePath(copy, path.split('.'));
    if (envelope) removePath((copy as { data: unknown }).data, path.split('.'));
  }
  return copy;
}

function removePath(target: unknown, keys: string[]): void {
  if (target === null || typeof target !== 'object' || keys.length === 0) return;
  const [head, ...rest] = keys;
  const children: string[] = head === '*' ? Object.keys(target as object) : [head];
  for (const key of children) {
    if (rest.length === 0) {
      if (Array.isArray(target)) continue;
      delete (target as Record<string, unknown>)[key];
    } else {
      removePath((target as Record<string, unknown>)[key], rest);
    }
  }
}

/** First few paths where a and b differ, e.g. `data.count: 1 != 2`. */
function diffPaths(a: unknown, b: unknown, path = '', out: string[] = [], limit = 5): string[] {
  if (out.length >= limit || deepEqual(a, b)) return out;
  const bothObjects = a !== null && b !== null && typeof a === 'object' && typeof b === 'object' &&
    Array.isArray(a) === Array.isArray(b);
  if (!bothObjects) {
    out.push(`${path || '(root)'}: ${fmt(a, 80)} != ${fmt(b, 80)}`);
    return out;
  }
  const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
  for (const key of keys) {
    const child = path ? `${path}.${key}` : key;
    diffPaths((a as any)[key], (b as any)[key], child, out, limit);
    if (out.length >= limit) break;
  }
  return out;
}

// ─── expectIdempotent ─────────────────────────────────────────────────────────

export interface IdempotencyOptions {
  /** Total number of identical requests. Default: 2 (minimum 2). */
  times?: number;
  /**
   * Send the first request alone, then the remaining `times - 1` requests
   * simultaneously (replays racing each other). Default: false (sequential).
   */
  concurrent?: boolean;
  /**
   * Dotted body paths ignored when comparing responses; `*` matches any key
   * or array index. For an AxilJS envelope (`{status, code, message, data}`)
   * paths are matched both from the root and inside `data`.
   * Default: ['timestamp', 'requestId', 'meta.timestamp'].
   */
  ignore?: string[];
  /**
   * Observe server-side state (e.g. `SELECT count(*)`). Called after the first
   * request and after the last; both results must deep-equal.
   */
  snapshot?: () => unknown | Promise<unknown>;
  /** Add an `Idempotency-Key` header (unless one is already set). Default: true. */
  idempotencyKey?: boolean | string;
}

export interface IdempotencyReport {
  request: RequestSpec;
  times: number;
  concurrent: boolean;
  idempotencyKey?: string;
  ignored: string[];
  responses: Array<{ status: number; body: unknown }>;
  snapshot?: { afterFirst: unknown; afterAll: unknown };
}

export const DEFAULT_IDEMPOTENCY_IGNORE: ReadonlyArray<string> = ['timestamp', 'requestId', 'meta.timestamp'];

/**
 * Assert that replaying `request` yields the same status, the same body
 * (minus volatile fields) and, with `options.snapshot`, the same state.
 */
export async function expectIdempotent(
  client: ContractClient,
  request: RequestSpec,
  options: IdempotencyOptions = {}
): Promise<IdempotencyReport> {
  const times = Math.max(2, Math.floor(options.times ?? 2));
  const concurrent = !!options.concurrent;
  const ignored = [...(options.ignore ?? DEFAULT_IDEMPOTENCY_IGNORE)];

  const spec: RequestSpec = { ...request, headers: { ...request.headers } };
  let idempotencyKey: string | undefined;
  if (options.idempotencyKey !== false && !hasHeader(spec.headers, 'idempotency-key')) {
    idempotencyKey = typeof options.idempotencyKey === 'string' ? options.idempotencyKey : randomUUID();
    spec.headers!['Idempotency-Key'] = idempotencyKey;
  }

  const report: IdempotencyReport = {
    request: spec,
    times,
    concurrent,
    idempotencyKey,
    ignored,
    responses: []
  };
  const label = `${describeRequest(spec)} (${times}x, ${concurrent ? 'concurrent' : 'sequential'})`;
  const fail = (message: string): never => {
    throw new ContractViolationError(`Expected ${label} to be idempotent: ${message}`, 'idempotent', report);
  };

  const first = await sendSpec(client, spec);
  report.responses.push({ status: first.status, body: first.body });
  const afterFirst = options.snapshot ? await options.snapshot() : undefined;

  let rest: TestResponse[];
  if (concurrent) {
    rest = await Promise.all(Array.from({ length: times - 1 }, () => sendSpec(client, spec)));
  } else {
    rest = [];
    for (let i = 1; i < times; i++) rest.push(await sendSpec(client, spec));
  }
  for (const res of rest) report.responses.push({ status: res.status, body: res.body });

  const reference = stripPaths(first.body, ignored);
  report.responses.forEach((res, index) => {
    if (index === 0) return;
    if (res.status !== first.status) {
      fail(`call #${index + 1} returned status ${res.status}, call #1 returned ${first.status}`);
    }
    const body = stripPaths(res.body, ignored);
    if (!deepEqual(body, reference)) {
      const diffs = diffPaths(reference, body).map(d => `\n  - ${d}`).join('');
      fail(`call #${index + 1} body differs from call #1 (ignoring ${ignored.join(', ') || 'nothing'}):${diffs}`);
    }
  });

  if (options.snapshot) {
    const afterAll = await options.snapshot();
    report.snapshot = { afterFirst, afterAll };
    if (!deepEqual(afterFirst, afterAll)) {
      fail(`state changed after the first call: snapshot ${fmt(afterFirst)} after call #1, ${fmt(afterAll)} after call #${times}`);
    }
  }

  return report;
}

// ─── expectTenantIsolated ─────────────────────────────────────────────────────

export interface TenantSeed {
  tenant: string;
  /** Headers, or a partial RequestSpec merged over `read`, that act as this tenant. */
  as: RequestAs;
}

export interface ForbiddenProbe {
  /** Resource owned by another tenant, e.g. `/invoices/42`. */
  path: string;
  /** Credentials of the tenant that must NOT see it. */
  as: RequestAs;
  method?: RequestSpec['method'];
  /** Acceptable statuses. Default: [403, 404]. */
  expect?: number[];
}

export interface TenantIsolationOptions {
  seed: TenantSeed[];
  /** The listing request performed once per tenant. */
  read: RequestSpec;
  /** Tenant id that owns a returned row. */
  tenantOf: (row: any) => string | undefined | null;
  /**
   * Extract rows from a response body. Default handles plain arrays,
   * `{ data: [...] }` and the paginated `{ data: { metadata: [...] } }`.
   */
  rows?: (body: any) => unknown[];
  /** Cross-tenant requests that must be refused. */
  forbidden?: ForbiddenProbe[];
}

export interface TenantIsolationReport {
  tenants: Array<{ tenant: string; status: number; rows: number; foreign: unknown[] }>;
  forbidden: Array<{ request: string; status: number }>;
}

/** Default row extraction for AxilJS envelopes and plain arrays. */
export function extractRows(body: any): unknown[] | undefined {
  if (Array.isArray(body)) return body;
  if (body && typeof body === 'object') {
    const data = body.data;
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object' && Array.isArray(data.metadata)) return data.metadata;
  }
  return undefined;
}

/**
 * Assert that each tenant's `read` only returns that tenant's rows, and that
 * every `forbidden` probe is refused with 403/404.
 */
export async function expectTenantIsolated(
  client: ContractClient,
  options: TenantIsolationOptions
): Promise<TenantIsolationReport> {
  if (!options.seed || options.seed.length === 0) {
    throw new AssertionError('expectTenantIsolated() needs at least one tenant in options.seed');
  }
  const report: TenantIsolationReport = { tenants: [], forbidden: [] };
  const fail = (message: string): never => {
    throw new ContractViolationError(`Expected tenant isolation: ${message}`, 'tenant-isolated', report);
  };

  for (const { tenant, as } of options.seed) {
    const spec = applyAs(options.read, as);
    const res = await sendSpec(client, spec);
    if (res.status < 200 || res.status >= 300) {
      fail(`${describeRequest(spec)} as tenant "${tenant}" returned ${res.status} (expected 2xx): ${fmt(res.body)}`);
    }
    const rows = options.rows ? options.rows(res.body) : extractRows(res.body);
    if (!Array.isArray(rows)) {
      fail(`could not find rows in the response to ${describeRequest(spec)} as tenant "${tenant}"; ` +
        `pass options.rows(body). Body: ${fmt(res.body)}`);
    }
    const foreign = rows!.filter(row => options.tenantOf(row) !== tenant);
    report.tenants.push({ tenant, status: res.status, rows: rows!.length, foreign });
    if (foreign.length > 0) {
      const owners = [...new Set(foreign.map(row => String(options.tenantOf(row))))];
      const sample = foreign.slice(0, 3).map(row => `\n  - ${fmt(row, 120)}`).join('');
      fail(`${describeRequest(spec)} as tenant "${tenant}" returned ${foreign.length} of ${rows!.length} ` +
        `row(s) owned by ${owners.map(o => `"${o}"`).join(', ')}:${sample}`);
    }
  }

  for (const probe of options.forbidden || []) {
    const spec = applyAs({ method: probe.method || 'GET', path: probe.path }, probe.as);
    const allowed = probe.expect || [403, 404];
    const res = await sendSpec(client, spec);
    report.forbidden.push({ request: describeRequest(spec), status: res.status });
    if (!allowed.includes(res.status)) {
      fail(`cross-tenant ${describeRequest(spec)} returned ${res.status} (expected ${allowed.join(' or ')}): ${fmt(res.body)}`);
    }
  }

  return report;
}

// ─── expectNoIntentViolations ─────────────────────────────────────────────────

/** Key under which @axiljs/runtime publishes `runtimeReport()`. */
export const RUNTIME_REPORT_KEY = Symbol.for('axiljs.runtime.report');

function readViolations(): unknown[] | undefined {
  const report = (globalThis as any)[RUNTIME_REPORT_KEY];
  if (typeof report !== 'function') return undefined;
  const violations = report()?.violations;
  return Array.isArray(violations) ? violations : [];
}

function describeViolation(v: any): string {
  if (v && typeof v === 'object' && (v.decorator || v.target)) {
    return `${v.target ?? '?'} violates ${v.decorator ?? '?'}: ${v.detail ?? ''}`.trim();
  }
  return fmt(v, 160);
}

/**
 * Run `fn` and fail if @axiljs/runtime recorded new intent violations while
 * it ran. Without the runtime loaded, this only runs `fn`.
 * Resolves with fn's result.
 */
export async function expectNoIntentViolations<T>(fn: () => T | Promise<T>): Promise<T> {
  const before = readViolations();
  let result: T | undefined;
  let error: unknown;
  let threw = false;
  try {
    result = await fn();
  } catch (err) {
    threw = true;
    error = err;
  }

  const after = readViolations();
  if (after) {
    // Multiset diff by content: the runtime caps its list, so length is unreliable
    const seen = new Map<string, number>();
    for (const v of before || []) {
      const key = fmt(v, Infinity);
      seen.set(key, (seen.get(key) || 0) + 1);
    }
    const fresh = after.filter(v => {
      const key = fmt(v, Infinity);
      const count = seen.get(key) || 0;
      if (count > 0) {
        seen.set(key, count - 1);
        return false;
      }
      return true;
    });
    if (fresh.length > 0) {
      const list = fresh.map(v => `\n  - ${describeViolation(v)}`).join('');
      const suffix = threw ? `\n(the function also threw: ${error instanceof Error ? error.message : fmt(error)})` : '';
      throw new ContractViolationError(
        `Expected no intent violations, but ${fresh.length} were recorded:${list}${suffix}`,
        'no-intent-violations',
        { violations: fresh }
      );
    }
  }

  if (threw) throw error;
  return result as T;
}
