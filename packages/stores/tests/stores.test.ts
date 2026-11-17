import { describe, it, expect, afterAll } from 'vitest';
import {
  SqlRateLimitStore,
  SqlIdempotencyStore,
  SqlCacheStore,
  SqlLockProvider,
  PgAdvisoryLockProvider
} from '../src';
import { targets, clock, sleep } from './helpers';

for (const target of targets) {
  describe.skipIf(target.skip)(`${target.name}`, () => {
    afterAll(() => target.cleanup());

    describe('SqlRateLimitStore', () => {
      it('counts 50 parallel increments exactly 1..50', async () => {
        const { exec } = await target.server();
        const store = new SqlRateLimitStore(exec, { table: target.table('rl') });
        const results = await Promise.all(Array.from({ length: 50 }, () => store.increment('k', 60_000)));
        expect(results.map(r => r.count).sort((a, b) => a - b)).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
        expect(new Set(results.map(r => r.resetAt)).size).toBe(1);
      });

      it('shares counts between two servers', async () => {
        const table = target.table('rl');
        const a = new SqlRateLimitStore((await target.server()).exec, { table });
        const b = new SqlRateLimitStore((await target.server()).exec, { table });
        const results = await Promise.all(Array.from({ length: 20 }, (_, i) => (i % 2 ? a : b).increment('shared', 60_000)));
        expect(results.map(r => r.count).sort((x, y) => x - y)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
      });

      it('starts a new window after resetAt and supports reset()', async () => {
        const { exec } = await target.server();
        const c = clock();
        const store = new SqlRateLimitStore(exec, { table: target.table('rl'), now: c.now });
        expect(await store.increment('w', 100)).toEqual({ count: 1, resetAt: c.t + 100 });
        expect(await store.increment('w', 100)).toEqual({ count: 2, resetAt: c.t + 100 });
        c.t += 99;
        expect((await store.increment('w', 100)).count).toBe(3);
        c.t += 1;
        expect(await store.increment('w', 100)).toEqual({ count: 1, resetAt: c.t + 100 });
        await store.reset('w');
        expect((await store.increment('w', 100)).count).toBe(1);
      });

      it('keeps keys distinct (case, long keys) and cleans up expired windows', async () => {
        const { exec } = await target.server();
        const c = clock();
        const store = new SqlRateLimitStore(exec, { table: target.table('rl'), now: c.now });
        const long = 'x'.repeat(500);
        await store.increment('Key', 50);
        await store.increment('key', 50);
        expect((await store.increment(long, 50)).count).toBe(1);
        expect((await store.increment(long, 50)).count).toBe(2);
        expect((await store.increment(long + 'y', 50)).count).toBe(1);
        expect((await store.increment('Key', 50)).count).toBe(2);
        c.t += 50;
        expect(await store.cleanup()).toBe(4);
      });

      it('rejects unsafe table names', () => {
        expect(() => new SqlRateLimitStore({ dialect: 'sqlite', query: async () => ({ rows: [] }) }, { table: 'x; DROP TABLE y' })).toThrow(/invalid table name/);
        expect(() => new SqlRateLimitStore({ dialect: 'sqlite', query: async () => ({ rows: [] }) }, { table: 'a'.repeat(64) })).toThrow(/invalid table name/);
      });
    });

    describe('SqlIdempotencyStore', () => {
      it('stores, replaces, expires and deletes results', async () => {
        const { exec } = await target.server();
        const c = clock();
        const store = new SqlIdempotencyStore(exec, { table: target.table('idem'), now: c.now });
        expect(await store.get('order:1')).toBeUndefined();
        await store.set('order:1', { result: { id: 1, items: ['a'] } }, 1000);
        expect(await store.get('order:1')).toEqual({ result: { id: 1, items: ['a'] } });
        await store.set('order:1', { result: 'second' }, 1000);
        expect(await store.get('order:1')).toEqual({ result: 'second' });
        c.t += 999;
        expect(await store.get('order:1')).toEqual({ result: 'second' });
        c.t += 1;
        expect(await store.get('order:1')).toBeUndefined();
        await store.set('order:2', { result: undefined }, 1000);
        const stored = await store.get('order:2');
        expect(stored).toBeDefined();
        expect('result' in (stored as object)).toBe(true);
        await store.delete('order:2');
        expect(await store.get('order:2')).toBeUndefined();
        expect(await store.cleanup()).toBe(1);
      });
    });

    describe('SqlCacheStore', () => {
      it('gets, sets, expires and deletes', async () => {
        const { exec } = await target.server();
        const c = clock();
        const store = new SqlCacheStore(exec, { table: target.table('cache'), now: c.now });
        expect(await store.get('a')).toBeUndefined();
        await store.set('a', { n: 1 }, 100, []);
        await store.set('A', null, 100, []);
        expect(await store.get('a')).toEqual({ value: { n: 1 } });
        expect(await store.get('A')).toEqual({ value: null });
        c.t += 100;
        expect(await store.get('a')).toBeUndefined();
        await store.set('a', 2, 100, []);
        expect(await store.get('a')).toEqual({ value: 2 });
        await store.delete('a');
        expect(await store.get('a')).toBeUndefined();
      });

      it('invalidates by tag across servers and replaces tags on set', async () => {
        const table = target.table('cache');
        const s1 = await target.server();
        const s2 = await target.server();
        const a = new SqlCacheStore(s1.exec, { table });
        const b = new SqlCacheStore(s2.exec, { table });
        await a.set('u:1', 'one', 60_000, ['users', 'u1']);
        await a.set('u:2', 'two', 60_000, ['users']);
        await a.set('p:1', 'post', 60_000, ['posts', 'u1']);
        await a.set('p:2', 'post2', 60_000, ['posts']);

        await b.deleteByTag('users');
        expect(await a.get('u:1')).toBeUndefined();
        expect(await a.get('u:2')).toBeUndefined();
        expect(await a.get('p:1')).toEqual({ value: 'post' });

        // u:1's other tag row went with it; u1 now only tags p:1
        const { rows } = await s1.exec.query<{ id: string }>(`SELECT id FROM ${a.tagTable} WHERE tag = 'u1'`);
        expect(rows.map(r => r.id)).toEqual(['p:1']);

        // Re-setting replaces tags: p:1 no longer carries u1
        await a.set('p:1', 'post v2', 60_000, ['posts']);
        await b.deleteByTag('u1');
        expect(await a.get('p:1')).toEqual({ value: 'post v2' });

        await b.deleteByTag('posts');
        expect(await a.get('p:1')).toBeUndefined();
        expect(await a.get('p:2')).toBeUndefined();
      });

      it('clears everything and cleans up expired entries with their tags', async () => {
        const { exec } = await target.server();
        const c = clock();
        const store = new SqlCacheStore(exec, { table: target.table('cache'), now: c.now });
        await store.set('x', 1, 10, ['t']);
        await store.set('y', 2, 1000, ['t']);
        c.t += 10;
        expect(await store.cleanup()).toBe(1);
        const { rows } = await exec.query<{ id: string }>(`SELECT id FROM ${store.tagTable}`);
        expect(rows.map(r => r.id)).toEqual(['y']);
        await store.clear();
        expect(await store.get('y')).toBeUndefined();
        expect((await exec.query(`SELECT id FROM ${store.tagTable}`)).rows).toEqual([]);
      });
    });

    describe('SqlLockProvider', () => {
      it('excludes a second server until release, then lets it in', async () => {
        const table = target.table('lock');
        const a = new SqlLockProvider((await target.server()).exec, { table });
        const b = new SqlLockProvider((await target.server()).exec, { table });
        const release = await a.acquire('acct:1', { ttlMs: 10_000, waitMs: 0 });

        const started = Date.now();
        await expect(b.acquire('acct:1', { ttlMs: 10_000, waitMs: 80 })).rejects.toThrow(/acct:1.*unavailable/);
        const waited = Date.now() - started;
        expect(waited).toBeGreaterThanOrEqual(75);
        expect(waited).toBeLessThan(1000);

        // Other keys are independent
        const other = await b.acquire('acct:2', { ttlMs: 10_000, waitMs: 0 });
        await other();

        const waiting = b.acquire('acct:1', { ttlMs: 10_000, waitMs: 2000 });
        await sleep(30);
        await release();
        await release(); // idempotent
        const releaseB = await waiting;
        await releaseB();
      });

      it('gives mutual exclusion under contention from two servers', async () => {
        const table = target.table('lock');
        const providers = [
          new SqlLockProvider((await target.server()).exec, { table }),
          new SqlLockProvider((await target.server()).exec, { table })
        ];
        let inside = 0;
        let maxInside = 0;
        let done = 0;
        await Promise.all(Array.from({ length: 16 }, async (_, i) => {
          const release = await providers[i % 2].acquire('hot', { ttlMs: 10_000, waitMs: 20_000 });
          inside++;
          maxInside = Math.max(maxInside, inside);
          await sleep(3);
          inside--;
          done++;
          await release();
        }));
        expect(done).toBe(16);
        expect(maxInside).toBe(1);
      });

      it('lets another server take over a lapsed lease; the old release is a no-op', async () => {
        const table = target.table('lock');
        const a = new SqlLockProvider((await target.server()).exec, { table });
        const b = new SqlLockProvider((await target.server()).exec, { table });
        const staleRelease = await a.acquire('job', { ttlMs: 40, waitMs: 0 });
        const started = Date.now();
        const releaseB = await b.acquire('job', { ttlMs: 10_000, waitMs: 2000 });
        expect(Date.now() - started).toBeGreaterThanOrEqual(30);
        await staleRelease();
        // b still holds it
        await expect(a.acquire('job', { ttlMs: 10_000, waitMs: 30 })).rejects.toThrow(/unavailable/);
        await releaseB();
        const again = await a.acquire('job', { ttlMs: 10_000, waitMs: 0 });
        await again();
      });
    });

    describe.skipIf(target.name !== 'postgres')('PgAdvisoryLockProvider', () => {
      it('excludes across two servers, honours wait timeout and frees on release', async () => {
        const other = new PgAdvisoryLockProvider((await target.server()).exec, { namespace: 'other' });
        const ns = { namespace: `t${Date.now()}` };
        const pa = new PgAdvisoryLockProvider((await target.server()).exec, ns);
        const pb = new PgAdvisoryLockProvider((await target.server()).exec, ns);
        expect(pa.lockId('k')).toBe(pb.lockId('k'));
        expect(other.lockId('k')).not.toBe(pa.lockId('k'));

        const release = await pa.acquire('k', { ttlMs: 10_000, waitMs: 0 });
        await expect(pb.acquire('k', { ttlMs: 10_000, waitMs: 60 })).rejects.toThrow(/unavailable/);
        const waiting = pb.acquire('k', { ttlMs: 10_000, waitMs: 2000 });
        await sleep(30);
        await release();
        const releaseB = await waiting;
        await releaseB();
        await releaseB(); // idempotent
      });

      it('gives mutual exclusion under contention and lapses after ttl', async () => {
        const ns = { namespace: `c${Date.now()}` };
        const providers = [
          new PgAdvisoryLockProvider((await target.server()).exec, ns),
          new PgAdvisoryLockProvider((await target.server()).exec, ns)
        ];
        let inside = 0;
        let maxInside = 0;
        await Promise.all(Array.from({ length: 8 }, async (_, i) => {
          const release = await providers[i % 2].acquire('hot', { ttlMs: 10_000, waitMs: 20_000 });
          inside++;
          maxInside = Math.max(maxInside, inside);
          await sleep(3);
          inside--;
          await release();
        }));
        expect(maxInside).toBe(1);

        await providers[0].acquire('ttl', { ttlMs: 40, waitMs: 0 });
        const r = await providers[1].acquire('ttl', { ttlMs: 10_000, waitMs: 2000 });
        await r();
      });
    });
  });
}
