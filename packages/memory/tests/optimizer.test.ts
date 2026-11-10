import { describe, it, expect, afterEach } from 'vitest';
import { MemoryOptimizer, optimizer } from '../src/optimizer';
import { trackCache, trackedCaches } from '../src/leak-detector';

// A fake require.cache entry that matches the optimizer's "unused module" rule
const FAKE_KEY = `${process.cwd()}/node_modules/__axil_fake_module__/index.js`;

function plantFakeModule(): void {
  (require.cache as any)[FAKE_KEY] = { id: FAKE_KEY, exports: {}, loaded: true, children: [] };
}

afterEach(() => {
  delete (require.cache as any)[FAKE_KEY];
  trackedCaches.clear();
});

describe('MemoryOptimizer', () => {
  it('does NOT clear require.cache by default', async () => {
    plantFakeModule();
    const result = await new MemoryOptimizer().optimize();
    expect(require.cache[FAKE_KEY]).toBeDefined();
    expect(result.actions.some(a => /module cache/.test(a))).toBe(false);

    await optimizer.optimize();
    expect(require.cache[FAKE_KEY]).toBeDefined();
  });

  it('clears unused module cache entries when opted in', async () => {
    plantFakeModule();
    const result = await new MemoryOptimizer({ clearModuleCache: true }).optimize();
    expect(require.cache[FAKE_KEY]).toBeUndefined();
    expect(result.actions.some(a => /Cleared \d+ unused module cache entries/.test(a))).toBe(true);
  });

  it('per-call options override the constructor', async () => {
    plantFakeModule();
    await new MemoryOptimizer({ clearModuleCache: true }).optimize({ clearModuleCache: false });
    expect(require.cache[FAKE_KEY]).toBeDefined();

    await new MemoryOptimizer().optimize({ clearModuleCache: true });
    expect(require.cache[FAKE_KEY]).toBeUndefined();
  });

  it('prunes tracked caches above 90% of their max size and reports before/after', async () => {
    const cache = trackCache('opt-test', new Map<number, number>(), 10);
    for (let n = 0; n < 10; n++) cache.set(n, n);

    const result = await new MemoryOptimizer().optimize();
    expect(cache.size).toBe(7);
    expect([...cache.keys()][0]).toBe(3);
    expect(result.actions).toContain("Pruned cache 'opt-test': 10 → 7 entries");
    expect(result.before.heapUsed).toBeGreaterThan(0);
    expect(result.after.heapUsed).toBeGreaterThan(0);
    expect(result.freedBytes).toBeGreaterThanOrEqual(0);
    expect(typeof result.gcTriggered).toBe('boolean');
  });
});
