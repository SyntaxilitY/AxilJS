import { describe, it, expect, afterAll } from 'vitest';
import { withBudget, windowFor, AIBudgetExceededError } from '../../ai/src';
import type { AIProvider, BudgetStore, CompletionOptions, CompletionResponse } from '../../ai/src';
import { SqlBudgetStore, createSqlStores, SqlExecutor } from '../src';
import { targets, clock, recordingExecutor } from './helpers';

const IS_DDL = /^CREATE /;
const T0 = 1_700_000_000_000;
const win = (name: 'minute' | 'hour' | 'day' | 'month' = 'minute', at = T0) => windowFor(name, at);

/** Provider that answers instantly and reports fixed usage. */
function fakeProvider(usage = { promptTokens: 10, completionTokens: 5 }): AIProvider & { calls: number } {
  const p = {
    name: 'fake',
    defaultModel: 'fake-1',
    calls: 0,
    async complete(opts: CompletionOptions): Promise<CompletionResponse> {
      p.calls++;
      await new Promise(r => setTimeout(r, 1));
      return {
        content: 'ok',
        finishReason: 'stop',
        model: opts.model ?? 'fake-1',
        usage: { ...usage, totalTokens: usage.promptTokens + usage.completionTokens }
      } as CompletionResponse;
    },
    async *stream(): any { throw new Error('not used'); },
    async embed(): Promise<any> { throw new Error('not used'); }
  };
  return p;
}

const ask = (content = 'hi') => ({ messages: [{ role: 'user' as const, content }] });

describe('SqlBudgetStore SQL generation', () => {
  it('mysql: DECIMAL cost, upsert + SELECT in one transaction', async () => {
    const { exec, calls } = recordingExecutor('mysql', sql =>
      sql.startsWith('SELECT') ? { rows: [{ tokens: 7, cost_usd: '0.250000000000', requests: '2' }] } : { affectedRows: 2 }
    );
    const store = new SqlBudgetStore(exec, { table: 'b' });
    expect(await store.add('s', win(), { tokens: 7, costUsd: 0.25, requests: 1 })).toEqual({ tokens: 7, costUsd: 0.25, requests: 2 });

    const ddl = calls.filter(c => IS_DDL.test(c.sql));
    expect(ddl).toHaveLength(1);
    expect(ddl[0].sql).toContain('cost_usd DECIMAL(30, 12)');
    expect(ddl[0].sql).toContain('PRIMARY KEY (scope, window_name, window_start)');
    expect(ddl[0].sql).toContain('INDEX idx_window_end (window_end)');

    const [insert, select] = calls.filter(c => !IS_DDL.test(c.sql));
    expect(insert.sql).toContain('ON DUPLICATE KEY UPDATE tokens = tokens + VALUES(tokens)');
    expect(insert.trx).toBe(true);
    expect(select.trx).toBe(true);
    expect(calls.some(c => /RETURNING|ON CONFLICT/.test(c.sql))).toBe(false);
  });

  it('postgres: NUMERIC cost, one upsert with RETURNING and $n placeholders', async () => {
    const { exec, calls } = recordingExecutor('postgres', sql =>
      sql.includes('RETURNING') ? { rows: [{ tokens: '3', cost_usd: '0.000000150000', requests: '1' }] } : {}
    );
    const store = new SqlBudgetStore(exec, { table: 'b' });
    expect(await store.add('s', win(), { tokens: 3, costUsd: 1.5e-7, requests: 1 })).toEqual({ tokens: 3, costUsd: 1.5e-7, requests: 1 });
    const dml = calls.filter(c => !IS_DDL.test(c.sql));
    expect(dml).toHaveLength(1);
    expect(dml[0].sql).toContain('ON CONFLICT (scope, window_name, window_start) DO UPDATE SET tokens = b.tokens + excluded.tokens');
    expect(dml[0].sql).not.toContain('?');
    expect(calls.find(c => IS_DDL.test(c.sql))!.sql).toContain('NUMERIC(30, 12)');
  });

  it('rejects non-finite amounts and odd window names before touching the database', async () => {
    const { exec, calls } = recordingExecutor('sqlite');
    const store = new SqlBudgetStore(exec);
    await expect(store.add('s', win(), { tokens: NaN, costUsd: 0, requests: 0 })).rejects.toThrow(/finite/);
    await expect(store.add('s', win(), { tokens: 0, costUsd: Infinity, requests: 0 })).rejects.toThrow(/finite/);
    await expect(store.get('s', { name: "x'; --", start: 0, end: 1 })).rejects.toThrow(/window name/);
    expect(calls).toHaveLength(0);
  });
});

describe('createSqlStores validation', () => {
  const pgNoTx: SqlExecutor = { dialect: 'postgres', query: async () => ({ rows: [] }) };

  it("rejects lock 'advisory' without a transactional postgres executor", () => {
    expect(() => createSqlStores(recordingExecutor('sqlite').exec, { lock: 'advisory' })).toThrow(/advisory' requires a postgres executor.*got sqlite/);
    expect(() => createSqlStores(recordingExecutor('mysql').exec, { lock: 'advisory' })).toThrow(/got mysql/);
    expect(() => createSqlStores(pgNoTx, { lock: 'advisory' })).toThrow(/without transaction\(\)/);
    expect(() => createSqlStores(pgNoTx, { lock: 'nope' as any })).toThrow(/unknown lock 'nope'/);
  });

  it('applies the prefix, per-store overrides and rejects bad prefixes', () => {
    const { exec } = recordingExecutor('postgres');
    const s = createSqlStores(exec, { tablePrefix: 'app_', cache: { table: 'my_cache' } });
    expect(s.tables).toEqual(['app_rate_limits', 'app_idempotency', 'my_cache', 'my_cache_tags', 'app_ai_budget', 'app_locks']);
    expect(createSqlStores(exec).rateLimit.table).toBe('axil_rate_limits');
    expect(createSqlStores(exec, { tablePrefix: '' }).budget.table).toBe('ai_budget');
    expect(createSqlStores(exec, { lock: 'advisory' }).lock.constructor.name).toBe('PgAdvisoryLockProvider');
    expect(() => createSqlStores(exec, { tablePrefix: 'x;' })).toThrow(/invalid tablePrefix/);
    expect(() => createSqlStores(exec, { tablePrefix: '1_' })).toThrow(/invalid table name/);
  });
});

for (const target of targets) {
  describe.skipIf(target.skip)(`${target.name}: SqlBudgetStore`, () => {
    afterAll(() => target.cleanup());

    it('accumulates, separates windows and scopes, and returns zeros when missing', async () => {
      const { exec } = await target.server();
      const store = new SqlBudgetStore(exec, { table: target.table('bud') });
      const w = win();
      expect(await store.get('a', w)).toEqual({ tokens: 0, costUsd: 0, requests: 0 });
      expect(await store.add('a', w, { tokens: 100, costUsd: 0.0015, requests: 1 })).toEqual({ tokens: 100, costUsd: 0.0015, requests: 1 });
      expect(await store.add('a', w, { tokens: 50, costUsd: 0.000000375, requests: 1 })).toEqual({ tokens: 150, costUsd: 0.001500375, requests: 2 });
      expect(await store.get('a', w)).toEqual({ tokens: 150, costUsd: 0.001500375, requests: 2 });

      // Next minute, another window name with the same start, another scope: all separate
      const next = win('minute', w.end);
      await store.add('a', next, { tokens: 1, costUsd: 0, requests: 1 });
      await store.add('a', { ...w, name: 'hour' }, { tokens: 7, costUsd: 0, requests: 1 });
      await store.add('A', w, { tokens: 9, costUsd: 0, requests: 1 });
      expect(await store.get('a', w)).toEqual({ tokens: 150, costUsd: 0.001500375, requests: 2 });
      expect(await store.get('a', next)).toEqual({ tokens: 1, costUsd: 0, requests: 1 });
      expect(await store.get('a', { ...w, name: 'hour' })).toEqual({ tokens: 7, costUsd: 0, requests: 1 });
      expect(await store.get('A', w)).toEqual({ tokens: 9, costUsd: 0, requests: 1 });
      expect(await store.get('x'.repeat(500), w)).toEqual({ tokens: 0, costUsd: 0, requests: 0 });
    });

    it('sums 50 concurrent adds exactly, across two servers', async () => {
      const table = target.table('bud');
      const a = new SqlBudgetStore((await target.server()).exec, { table });
      const b = new SqlBudgetStore((await target.server()).exec, { table });
      const w = win('day');
      const results = await Promise.all(Array.from({ length: 50 }, (_, i) =>
        (i % 2 ? a : b).add('t1', w, { tokens: 10, costUsd: 0.001, requests: 1 })
      ));
      expect(results.map(r => r.requests).sort((x, y) => x - y)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
      expect(await a.get('t1', w)).toEqual({ tokens: 500, costUsd: 0.05, requests: 50 });
    });

    it('handles negative amounts (reservation release) exactly', async () => {
      const { exec } = await target.server();
      const store = new SqlBudgetStore(exec, { table: target.table('bud') });
      const w = win('month');
      const est = { tokens: 1234, costUsd: 0.000185, requests: 1 };
      await store.add('s', w, est);
      expect(await store.add('s', w, { tokens: -est.tokens, costUsd: -est.costUsd, requests: -1 })).toEqual({ tokens: 0, costUsd: 0, requests: 0 });
      // A negative first add (release after the row was cleaned up) creates a negative row
      expect(await store.add('t', w, { tokens: -5, costUsd: -0.5, requests: -1 })).toEqual({ tokens: -5, costUsd: -0.5, requests: -1 });
      // Settle: reserved 100 tokens, actual 40
      await store.add('u', w, { tokens: 100, costUsd: 0.3, requests: 1 });
      expect(await store.add('u', w, { tokens: -60, costUsd: -0.18, requests: 0 })).toEqual({ tokens: 40, costUsd: 0.12, requests: 1 });
    });

    it('cleanup() removes rows whose window ended, honouring retainMs', async () => {
      const { exec } = await target.server();
      const c = clock(T0);
      const table = target.table('bud');
      const store = new SqlBudgetStore(exec, { table, now: c.now });
      const keep = new SqlBudgetStore(exec, { table, now: c.now, retainMs: 60_000 });
      const w = win('minute', T0);
      const later = win('hour', T0);
      await store.add('s', w, { tokens: 1, costUsd: 0, requests: 1 });
      await store.add('s', later, { tokens: 2, costUsd: 0, requests: 1 });
      expect(await store.cleanup()).toBe(0);
      c.t = w.end;
      expect(await keep.cleanup()).toBe(0);
      expect(await store.cleanup()).toBe(1);
      expect(await store.get('s', w)).toEqual({ tokens: 0, costUsd: 0, requests: 0 });
      expect(await store.get('s', later)).toEqual({ tokens: 2, costUsd: 0, requests: 1 });
      store.close();
      store.close();
    });

    it('enforces one withBudget limit across two servers sharing the table', async () => {
      const table = target.table('bud');
      const store1: BudgetStore = new SqlBudgetStore((await target.server()).exec, { table });
      const store2: BudgetStore = new SqlBudgetStore((await target.server()).exec, { table });
      const p1 = fakeProvider();
      const p2 = fakeProvider();
      const now = () => T0 + 1_000;
      const limits = [{ window: 'minute' as const, requests: 5 }, { window: 'day' as const, tokens: 1_000 }];
      const server1 = withBudget(p1, { limits, store: store1, scope: () => 'tenant-a', now, defaultMaxTokens: 20 });
      const server2 = withBudget(p2, { limits, store: store2, scope: () => 'tenant-a', now, defaultMaxTokens: 20 });

      const outcomes = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => (i % 2 ? server1 : server2).complete(ask())));
      const ok = outcomes.filter(o => o.status === 'fulfilled');
      const rejected = outcomes.filter(o => o.status === 'rejected') as PromiseRejectedResult[];
      expect(ok).toHaveLength(5);
      expect(rejected).toHaveLength(7);
      expect(rejected.every(r => r.reason instanceof AIBudgetExceededError && r.reason.details.metric === 'requests')).toBe(true);
      expect(p1.calls + p2.calls).toBe(5);

      // Reservations were rolled back and replaced by actual usage (15 tokens each)
      const usage = await server1.getUsage();
      expect(usage[0].used.requests).toBe(5);
      expect(usage[1].used).toEqual({ tokens: 75, costUsd: 0, requests: 5 });
      expect((await server2.getUsage())[1].used.tokens).toBe(75);

      // Another tenant has its own budget
      await expect(withBudget(fakeProvider(), { limits, store: store2, scope: () => 'tenant-b', now }).complete(ask())).resolves.toBeDefined();
    });

    it('enforces a cost limit across servers with pricing', async () => {
      const table = target.table('bud');
      const pricing = { 'fake-1': { inputPerMTok: 1_000, outputPerMTok: 1_000 } }; // 0.001 USD per token
      const limits = { window: 'month' as const, costUsd: 0.05 };
      const now = () => T0;
      const mk = async () => withBudget(fakeProvider({ promptTokens: 10, completionTokens: 0 }), {
        limits, pricing, now, scope: () => 'c', store: new SqlBudgetStore((await target.server()).exec, { table })
      });
      const [s1, s2] = [await mk(), await mk()];
      // Each call reserves 1 prompt token (estimate) and settles at 10 tokens = 0.01 USD
      for (let i = 0; i < 5; i++) await (i % 2 ? s1 : s2).complete(ask('abcd'));
      expect((await s1.getUsage())[0].used.costUsd).toBeCloseTo(0.05, 12);
      await expect(s2.complete(ask('abcd'))).rejects.toBeInstanceOf(AIBudgetExceededError);
    });
  });

  describe.skipIf(target.skip)(`${target.name}: createSqlStores`, () => {
    afterAll(() => target.cleanup());

    it('ensureSchema() creates every prefixed table up front', async () => {
      const { exec } = await target.server();
      const prefix = `${target.table('pfx')}_`;
      const stores = createSqlStores(exec, { tablePrefix: prefix, cleanupIntervalMs: 60_000 });
      try {
        expect(stores.tables).toEqual([
          `${prefix}rate_limits`, `${prefix}idempotency`, `${prefix}cache`, `${prefix}cache_tags`, `${prefix}ai_budget`, `${prefix}locks`
        ]);
        await stores.ensureSchema();
        await stores.ensureSchema(); // idempotent
        for (const t of stores.tables) {
          const { rows } = await exec.query<{ n: unknown }>(`SELECT COUNT(*) AS n FROM ${t}`);
          expect(Number(rows[0].n)).toBe(0);
        }

        // The stores work on those tables
        expect((await stores.rateLimit.increment('k', 60_000)).count).toBe(1);
        await stores.idempotency.set('i', { result: 1 }, 60_000);
        await stores.cache.set('c', { v: 1 }, 60_000, ['tag']);
        const release = await (stores.lock as any).acquire('l', { ttlMs: 1000, waitMs: 0 });
        await release();
        expect(await stores.budget.add('s', win(), { tokens: 1, costUsd: 0.5, requests: 1 })).toEqual({ tokens: 1, costUsd: 0.5, requests: 1 });
        const { rows } = await exec.query<{ n: unknown }>(`SELECT COUNT(*) AS n FROM ${prefix}cache_tags`);
        expect(Number(rows[0].n)).toBe(1);
      } finally {
        stores.close();
        for (const t of stores.tables) await exec.query(`DROP TABLE IF EXISTS ${t}`);
      }
    });

    it.skipIf(target.name !== 'postgres')("lock 'advisory' uses postgres advisory locks and creates no lock table", async () => {
      const { exec } = await target.server();
      const stores = createSqlStores(exec, { tablePrefix: `${target.table('adv')}_`, lock: 'advisory', advisoryLock: { namespace: `n${Date.now()}` } });
      expect(stores.tables.some(t => t.endsWith('locks'))).toBe(false);
      const release = await stores.lock.acquire('k', { ttlMs: 5000, waitMs: 0 });
      await expect(stores.lock.acquire('k', { ttlMs: 5000, waitMs: 30 })).rejects.toThrow(/unavailable/);
      await release();
      stores.close();
    });
  });
}
