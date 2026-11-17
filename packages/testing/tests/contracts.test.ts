import { describe, it, expect, afterEach } from 'vitest';
import { Application } from '@axiljs/core';
import { createTestClient } from '../src/http/test-client';
import { AssertionError } from '../src/assertions/expect';
import {
  expectIdempotent,
  expectTenantIsolated,
  expectNoIntentViolations,
  extractRows,
  ContractViolationError,
  RUNTIME_REPORT_KEY
} from '../src/contracts';
import * as Index from '../src/index';

function header(req: any, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/** Orders API: POST /orders honours Idempotency-Key, POST /counter does not. */
function ordersApp() {
  const app = new Application({ logging: false });
  const byKey = new Map<string, { id: number; sku: string }>();
  const state = { orders: 0, counter: 0, seenKeys: [] as string[] };

  app.post('/orders', (req: any, res: any) => {
    const key = header(req, 'idempotency-key');
    if (key) state.seenKeys.push(key);
    const existing = key ? byKey.get(key) : undefined;
    if (existing) return res.created({ ...existing, timestamp: Date.now() + Math.random() });
    const order = { id: ++state.orders, sku: req.body.sku };
    if (key) byKey.set(key, order);
    res.created({ ...order, timestamp: Date.now() + Math.random() });
  });

  app.post('/counter', (_req: any, res: any) => {
    state.counter++;
    res.success({ count: state.counter });
  });

  // Same body every time, but a hidden side effect
  app.post('/silent', (_req: any, res: any) => {
    state.counter++;
    res.success({ ok: true });
  });

  app.get('/clock', (_req: any, res: any) => {
    res.success({ meta: { at: Math.random() }, fixed: 1 });
  });

  return { app, state };
}

const ROWS = [
  { id: 1, tenantId: 'acme', name: 'a1' },
  { id: 2, tenantId: 'acme', name: 'a2' },
  { id: 3, tenantId: 'globex', name: 'g1' }
];

/** Tenant API: /safe filters by x-tenant-id, /leaky does not. */
function tenantApp() {
  const app = new Application({ logging: false });
  app.get('/safe', (req: any, res: any) => {
    res.success(ROWS.filter(r => r.tenantId === header(req, 'x-tenant-id')));
  });
  app.get('/safe-paged', (req: any, res: any) => {
    const rows = ROWS.filter(r => r.tenantId === header(req, 'x-tenant-id'));
    res.paginated(rows, rows.length, 1, 10);
  });
  app.get('/leaky', (_req: any, res: any) => {
    res.success(ROWS);
  });
  app.get('/rows/:id', (req: any, res: any) => {
    const row = ROWS.find(r => String(r.id) === req.params.id);
    if (!row || row.tenantId !== header(req, 'x-tenant-id')) return res.notFound('Not found');
    res.success(row);
  });
  app.get('/rows-leaky/:id', (req: any, res: any) => {
    res.success(ROWS.find(r => String(r.id) === req.params.id));
  });
  app.get('/private', (_req: any, res: any) => {
    res.unauthorized('Login required');
  });
  return app;
}

const SEED = [
  { tenant: 'acme', as: { 'x-tenant-id': 'acme' } },
  { tenant: 'globex', as: { 'x-tenant-id': 'globex' } }
];

describe('expectIdempotent', () => {
  it('passes for an endpoint that honours Idempotency-Key (timestamp ignored by default)', async () => {
    const { app, state } = ordersApp();
    const report = await expectIdempotent(createTestClient(app), {
      method: 'POST', path: '/orders', body: { sku: 'A1' }
    }, { snapshot: () => state.orders });

    expect(report.times).toBe(2);
    expect(report.responses).toHaveLength(2);
    expect(report.responses[0].status).toBe(201);
    expect(typeof report.idempotencyKey).toBe('string');
    expect(state.seenKeys).toEqual([report.idempotencyKey, report.idempotencyKey]);
    expect(report.snapshot).toEqual({ afterFirst: 1, afterAll: 1 });
  });

  it('fails with a clear diff for an endpoint that is not idempotent', async () => {
    const { app } = ordersApp();
    const err = await expectIdempotent(createTestClient(app), { method: 'POST', path: '/counter' })
      .catch(e => e);
    expect(err).toBeInstanceOf(ContractViolationError);
    expect(err).toBeInstanceOf(AssertionError);
    expect(err.name).toBe('AssertionError');
    expect(err.message).toContain('Expected POST /counter (2x, sequential) to be idempotent');
    expect(err.message).toContain('call #2 body differs from call #1');
    expect(err.message).toContain('data.count: 1 != 2');
    expect(err.report.responses).toHaveLength(2);
  });

  it('without a key the orders endpoint creates duplicates and fails', async () => {
    const { app, state } = ordersApp();
    await expect(expectIdempotent(createTestClient(app), {
      method: 'POST', path: '/orders', body: { sku: 'A1' }
    }, { idempotencyKey: false })).rejects.toThrow('data.id: 1 != 2');
    expect(state.seenKeys).toEqual([]);
  });

  it('keeps a caller-supplied Idempotency-Key and accepts a fixed key', async () => {
    const { app, state } = ordersApp();
    const client = createTestClient(app);
    await expectIdempotent(client, {
      method: 'post', path: '/orders', body: { sku: 'B' }, headers: { 'idempotency-key': 'mine' }
    });
    const report = await expectIdempotent(client, {
      method: 'POST', path: '/orders', body: { sku: 'C' }
    }, { idempotencyKey: 'fixed' });
    expect(report.idempotencyKey).toBe('fixed');
    expect(state.seenKeys).toEqual(['mine', 'mine', 'fixed', 'fixed']);
  });

  it('concurrent mode sends the replays simultaneously', async () => {
    const { app, state } = ordersApp();
    const client = createTestClient(app);
    const report = await expectIdempotent(client, {
      method: 'POST', path: '/orders', body: { sku: 'A1' }
    }, { times: 5, concurrent: true, snapshot: () => state.orders });
    expect(report.concurrent).toBe(true);
    expect(report.responses).toHaveLength(5);
    expect(state.orders).toBe(1);

    await expect(expectIdempotent(client, { method: 'POST', path: '/counter' }, { times: 4, concurrent: true }))
      .rejects.toThrow('(4x, concurrent)');
  });

  it('ignore paths drop volatile fields (with * wildcards)', async () => {
    const { app } = ordersApp();
    const client = createTestClient(app);
    await expect(expectIdempotent(client, { path: '/clock' })).rejects.toThrow('data.meta.at');
    await expectIdempotent(client, { path: '/clock' }, { ignore: ['data.meta.at'] });
    await expectIdempotent(client, { path: '/clock' }, { ignore: ['data.*.at'] });
  });

  it('fails when the snapshot changes even though responses match', async () => {
    const { app, state } = ordersApp();
    const err = await expectIdempotent(createTestClient(app), { method: 'POST', path: '/silent' }, {
      times: 3, snapshot: async () => ({ count: state.counter })
    }).catch(e => e);
    expect(err).toBeInstanceOf(ContractViolationError);
    expect(err.message).toContain('state changed after the first call');
    expect(err.message).toContain('{"count":1} after call #1, {"count":3} after call #3');
    expect(err.report.snapshot).toEqual({ afterFirst: { count: 1 }, afterAll: { count: 3 } });
  });

  it('fails on a status mismatch', async () => {
    const app = new Application({ logging: false });
    let n = 0;
    app.post('/once', (_req: any, res: any) => (n++ === 0 ? res.created({}) : res.conflict('Already exists', {})));
    await expect(expectIdempotent(createTestClient(app), { method: 'POST', path: '/once' }))
      .rejects.toThrow('call #2 returned status 409, call #1 returned 201');
  });
});

describe('expectTenantIsolated', () => {
  it('passes for a tenant-filtered endpoint and reports row counts', async () => {
    const report = await expectTenantIsolated(createTestClient(tenantApp()), {
      seed: SEED,
      read: { path: '/safe' },
      tenantOf: row => row.tenantId
    });
    expect(report.tenants.map(t => [t.tenant, t.rows])).toEqual([['acme', 2], ['globex', 1]]);
  });

  it('handles the paginated envelope and partial RequestSpec credentials', async () => {
    const report = await expectTenantIsolated(createTestClient(tenantApp()), {
      seed: [
        { tenant: 'acme', as: { headers: { 'x-tenant-id': 'acme' } } },
        { tenant: 'globex', as: { headers: { 'x-tenant-id': 'globex' } } }
      ],
      read: { path: '/safe-paged' },
      tenantOf: row => row.tenantId
    });
    expect(report.tenants[0].rows).toBe(2);
  });

  it('fails for a leaky endpoint and names the foreign owner', async () => {
    const err = await expectTenantIsolated(createTestClient(tenantApp()), {
      seed: SEED,
      read: { path: '/leaky' },
      tenantOf: row => row.tenantId
    }).catch(e => e);
    expect(err).toBeInstanceOf(ContractViolationError);
    expect(err.message).toContain('GET /leaky as tenant "acme" returned 1 of 3 row(s) owned by "globex"');
    expect(err.message).toContain('"name":"g1"');
  });

  it('checks cross-tenant access to a specific resource', async () => {
    const client = createTestClient(tenantApp());
    const report = await expectTenantIsolated(client, {
      seed: SEED,
      read: { path: '/safe' },
      tenantOf: row => row.tenantId,
      forbidden: [{ path: '/rows/3', as: { 'x-tenant-id': 'acme' } }]
    });
    expect(report.forbidden).toEqual([{ request: 'GET /rows/3', status: 404 }]);

    await expect(expectTenantIsolated(client, {
      seed: SEED,
      read: { path: '/safe' },
      tenantOf: row => row.tenantId,
      forbidden: [{ path: '/rows-leaky/3', as: { 'x-tenant-id': 'acme' } }]
    })).rejects.toThrow('cross-tenant GET /rows-leaky/3 returned 200 (expected 403 or 404)');
  });

  it('fails when the read itself is rejected or has no recognisable rows', async () => {
    const client = createTestClient(tenantApp());
    await expect(expectTenantIsolated(client, {
      seed: SEED, read: { path: '/private' }, tenantOf: row => row.tenantId
    })).rejects.toThrow('returned 401 (expected 2xx)');

    await expect(expectTenantIsolated(client, {
      seed: SEED, read: { path: '/rows/1' }, tenantOf: row => row.tenantId
    })).rejects.toThrow('pass options.rows(body)');

    // A custom extractor fixes it
    await expectTenantIsolated(client, {
      seed: [SEED[0]], read: { path: '/rows/1' }, tenantOf: row => row.tenantId, rows: body => [body.data]
    });
  });

  it('extractRows understands plain arrays and AxilJS envelopes', () => {
    expect(extractRows([1])).toEqual([1]);
    expect(extractRows({ data: [2] })).toEqual([2]);
    expect(extractRows({ data: { metadata: [3], pagination: {} } })).toEqual([3]);
    expect(extractRows({ data: { id: 1 } })).toBeUndefined();
  });
});

describe('expectNoIntentViolations', () => {
  const g = globalThis as any;
  const original = g[RUNTIME_REPORT_KEY];
  afterEach(() => {
    if (original === undefined) delete g[RUNTIME_REPORT_KEY];
    else g[RUNTIME_REPORT_KEY] = original;
  });

  it('just runs fn when the runtime is not loaded', async () => {
    delete g[RUNTIME_REPORT_KEY];
    await expect(expectNoIntentViolations(async () => 42)).resolves.toBe(42);
    await expect(expectNoIntentViolations(() => { throw new Error('boom'); })).rejects.toThrow('boom');
  });

  it('passes when no new violations appear (old ones are ignored)', async () => {
    const violations = [{ decorator: 'tIdempotent', target: 'Old.run', detail: 'old', timestamp: 't0' }];
    g[RUNTIME_REPORT_KEY] = () => ({ violations: [...violations] });
    await expect(expectNoIntentViolations(() => 'ok')).resolves.toBe('ok');
  });

  it('fails and lists violations recorded during fn', async () => {
    const violations: any[] = [{ decorator: 'tIdempotent', target: 'Old.run', detail: 'old', timestamp: 't0' }];
    g[RUNTIME_REPORT_KEY] = () => ({ violations: [...violations] });
    const err = await expectNoIntentViolations(async () => {
      violations.push({ decorator: 'tTenantScoped', target: 'Invoices.list', detail: 'row from globex', timestamp: 't1' });
      violations.push({ decorator: 'tReadOnly', target: 'Report.get', detail: 'wrote to db', timestamp: 't2' });
    }).catch(e => e);
    expect(err).toBeInstanceOf(ContractViolationError);
    expect(err.message).toContain('Expected no intent violations, but 2 were recorded');
    expect(err.message).toContain('Invoices.list violates tTenantScoped: row from globex');
    expect(err.message).toContain('Report.get violates tReadOnly: wrote to db');
    expect(err.message).not.toContain('Old.run');
    expect(err.report.violations).toHaveLength(2);
  });

  it('detects new violations when the runtime list is capped (length unchanged)', async () => {
    let violations: any[] = [{ decorator: 'a', target: 'A', detail: '1', timestamp: 't0' }];
    g[RUNTIME_REPORT_KEY] = () => ({ violations: [...violations] });
    await expect(expectNoIntentViolations(() => {
      violations = [{ decorator: 'b', target: 'B', detail: '2', timestamp: 't1' }];
    })).rejects.toThrow('B violates b: 2');
  });

  it('reports violations even when fn throws', async () => {
    const violations: any[] = [];
    g[RUNTIME_REPORT_KEY] = () => ({ violations: [...violations] });
    await expect(expectNoIntentViolations(() => {
      violations.push({ decorator: 'tAudit', target: 'X.y', detail: 'missing', timestamp: 't' });
      throw new Error('enforced');
    })).rejects.toThrow(/X\.y violates tAudit: missing[\s\S]*also threw: enforced/);
  });
});

describe('index exports', () => {
  it('exposes the contract helpers', () => {
    expect(Index.expectIdempotent).toBe(expectIdempotent);
    expect(Index.expectTenantIsolated).toBe(expectTenantIsolated);
    expect(Index.expectNoIntentViolations).toBe(expectNoIntentViolations);
    expect(Index.ContractViolationError).toBe(ContractViolationError);
  });
});
