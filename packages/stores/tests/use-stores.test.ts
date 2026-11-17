import { describe, it, expect, afterAll, afterEach } from 'vitest';
import { tIdempotent } from '@axiljs/decorator';
import { wire, useStores, resetResilienceState, setIdempotencyStore, MemoryIdempotencyStore } from '../../runtime/src';
import { createSqlStores } from '../src';
import { targets } from './helpers';

for (const target of targets) {
  describe.skipIf(target.skip)(`${target.name}: useStores(createSqlStores(...))`, () => {
    afterEach(() => {
      resetResilienceState();
      setIdempotencyStore(new MemoryIdempotencyStore());
    });
    afterAll(() => target.cleanup());

    it('shares tIdempotent results between two servers with the documented one-line setup', async () => {
      const prefix = `${target.table('us')}_`;
      const a = await target.server();
      const b = await target.server();
      const storesA = createSqlStores(a.exec, { tablePrefix: prefix });
      const storesB = createSqlStores(b.exec, { tablePrefix: prefix });
      await storesA.ensureSchema();

      class Payments {
        static charges = 0;
        @tIdempotent({ key: 'args.0' })
        async charge(orderId: string) { Payments.charges++; return `charged ${orderId}`; }
      }
      wire(Payments);

      expect(useStores(storesA)).toEqual(['rateLimit', 'idempotency', 'cache', 'lock']);
      await new Payments().charge('order-1');

      // The retry reaches the other server
      useStores(storesB);
      await expect(new Payments().charge('order-1')).resolves.toBe('charged order-1');
      expect(Payments.charges).toBe(1);

      storesA.close();
      storesB.close();
    });
  });
}
