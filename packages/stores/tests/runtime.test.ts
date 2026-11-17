import { describe, it, expect, afterAll, afterEach, beforeEach } from 'vitest';
import { tLock, tIdempotent, tCache, tRateLimit, tReadOnly } from '@axiljs/decorator';
import {
  wire,
  configureIntent,
  getIntentViolations,
  clearIntentViolations,
  setCacheStore,
  setIdempotencyStore,
  setLockProvider,
  setRateLimitStore,
  resetResilienceState,
  MemoryIdempotencyStore,
  IntentViolationError,
  RateLimitExceededError,
  LockTimeoutError
} from '../../runtime/src';
import { SqlCacheStore, SqlIdempotencyStore, SqlLockProvider, SqlRateLimitStore } from '../src';
import { targets, sleep } from './helpers';

for (const target of targets) {
  describe.skipIf(target.skip)(`${target.name}: wired into @axiljs/runtime`, () => {
    beforeEach(() => {
      configureIntent({ mode: 'enforce' });
      clearIntentViolations();
    });
    afterEach(() => {
      resetResilienceState();
      setIdempotencyStore(new MemoryIdempotencyStore());
    });
    afterAll(() => target.cleanup());

    it('store writes inside tReadOnly methods are not intent violations', async () => {
      const { conn, exec } = await target.server();
      const locks = target.table('lock');
      setCacheStore(new SqlCacheStore(exec, { table: target.table('cache') }));
      setIdempotencyStore(new SqlIdempotencyStore(exec, { table: target.table('idem') }));
      setLockProvider(new SqlLockProvider(exec, { table: locks }));
      setRateLimitStore(new SqlRateLimitStore(exec, { table: target.table('rl') }));
      const scratch = target.table('scratch');
      await conn.getDriver().query(`CREATE TABLE ${scratch} (n INTEGER)`);

      let calls = 0;
      class Accounts {
        @tReadOnly()
        @tCache({ key: 'balance', ttl: 60_000, tags: ['accounts'] })
        async balance(id: string) { calls++; return { id, cents: 100 }; }

        @tReadOnly()
        @tIdempotent({ key: 'args.0' })
        async quote(requestId: string) { calls++; return { requestId, n: calls }; }

        @tReadOnly()
        @tLock({ key: 'acct:{0}', wait: 1000 })
        async audit(id: string) { calls++; await sleep(5); return id; }

        @tReadOnly()
        @tRateLimit({ limit: 2, window: '1m' })
        async report() { return 'ok'; }

        // Control: the method's own write is still caught
        @tReadOnly()
        async sneaky() { await conn.getDriver().query(`INSERT INTO ${scratch} (n) VALUES (1)`); }
      }
      wire(Accounts);
      const svc = new Accounts();

      expect(await svc.balance('a')).toEqual({ id: 'a', cents: 100 });
      expect(await svc.balance('a')).toEqual({ id: 'a', cents: 100 });
      expect(calls).toBe(1);

      const first = await svc.quote('req-1');
      expect(await svc.quote('req-1')).toEqual(first);
      expect(calls).toBe(2);

      expect(await Promise.all([svc.audit('x'), svc.audit('x')])).toEqual(['x', 'x']);
      const { rows } = await exec.query(`SELECT id FROM ${locks}`);
      expect(rows).toEqual([]);

      await svc.report();
      await svc.report();
      await expect(svc.report()).rejects.toBeInstanceOf(RateLimitExceededError);

      expect(getIntentViolations()).toEqual([]);

      await expect(svc.sneaky()).rejects.toBeInstanceOf(IntentViolationError);
      expect(getIntentViolations()).toHaveLength(1);
      expect(getIntentViolations()[0]).toMatchObject({ decorator: 'tReadOnly', target: 'Accounts.sneaky' });
    });

    it('tLock is exclusive across two servers and times out with LockTimeoutError', async () => {
      const table = target.table('lock');
      const one = new SqlLockProvider((await target.server()).exec, { table });
      const two = new SqlLockProvider((await target.server()).exec, { table });

      class Job {
        @tLock({ key: 'job:{0}', wait: 50 })
        async run(_id: string) { await sleep(150); return 'done'; }
      }
      wire(Job);

      // Server one holds the lock through the runtime
      setLockProvider(one);
      const running = new Job().run('nightly');
      await sleep(30);
      // Server two contends for the same key
      setLockProvider(two);
      await expect(new Job().run('nightly')).rejects.toBeInstanceOf(LockTimeoutError);
      expect(await running).toBe('done');
      expect(await new Job().run('nightly')).toBe('done');
    });
  });
}
