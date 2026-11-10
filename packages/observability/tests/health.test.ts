import { describe, it, expect, vi, afterEach } from 'vitest';
import { HealthChecker } from '../src/health';

afterEach(() => {
  vi.useRealTimers();
});

function fakeRes(): any {
  const res: any = {};
  res.status = vi.fn((c: number) => { res.code = c; return res; });
  res.json = vi.fn((b: unknown) => { res.body = b; });
  return res;
}

describe('HealthChecker', () => {
  it('reports healthy checks with message/details', async () => {
    const h = new HealthChecker();
    h.addCheck('db', async () => ({ message: 'Connected', details: { pool: 3 } }));
    h.addCheck('cache', async () => {});
    const s = await h.check();
    expect(s.status).toBe('healthy');
    expect(s.checks.db).toMatchObject({ status: 'healthy', message: 'Connected', details: { pool: 3 } });
    expect(s.checks.cache.status).toBe('healthy');
    expect(s.version).toBe(process.version);
    expect(typeof s.uptime).toBe('number');
  });

  it('marks overall unhealthy when any check throws', async () => {
    const h = new HealthChecker();
    h.addCheck('ok', async () => {});
    h.addCheck('bad', async () => { throw new Error('down'); });
    const s = await h.check();
    expect(s.status).toBe('unhealthy');
    expect(s.checks.bad).toMatchObject({ status: 'unhealthy', message: 'down' });
  });

  it('times out hung checks (default 5000ms) without hanging check()', async () => {
    vi.useFakeTimers();
    const h = new HealthChecker();
    h.addCheck('hung', () => new Promise(() => {}));
    h.addCheck('ok', async () => {});
    const p = h.check();
    await vi.advanceTimersByTimeAsync(4999);
    let settled = false;
    p.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const s = await p;
    expect(s.status).toBe('unhealthy');
    expect(s.checks.hung.message).toBe("Health check 'hung' timed out after 5000ms");
    expect(s.checks.ok.status).toBe('healthy');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('honours per-check timeoutMs and the constructor default', async () => {
    vi.useFakeTimers();
    const h = new HealthChecker({ defaultTimeoutMs: 1000 });
    h.addCheck('fast-timeout', () => new Promise(() => {}), { timeoutMs: 50 });
    h.addCheck('default-timeout', () => new Promise(() => {}));
    const p = h.check();
    await vi.advanceTimersByTimeAsync(50);
    await vi.advanceTimersByTimeAsync(950);
    const s = await p;
    expect(s.checks['fast-timeout'].message).toMatch(/after 50ms/);
    expect(s.checks['default-timeout'].message).toMatch(/after 1000ms/);
  });

  it('timeoutMs: 0 disables the timeout', async () => {
    vi.useFakeTimers();
    const h = new HealthChecker();
    h.addCheck('slow', () => new Promise(r => setTimeout(r, 60_000)), { timeoutMs: 0 });
    const p = h.check();
    await vi.advanceTimersByTimeAsync(60_000);
    expect((await p).status).toBe('healthy');
  });

  it('handles synchronous throws in checks', async () => {
    const h = new HealthChecker();
    h.addCheck('sync', (() => { throw new Error('sync'); }) as any);
    const s = await h.check();
    expect(s.checks.sync).toMatchObject({ status: 'unhealthy', message: 'sync' });
  });

  it('handler / readiness / liveness respond with the right codes', async () => {
    const h = new HealthChecker();
    h.addCheck('ok', async () => {});
    const r1 = fakeRes();
    await h.handler()({} as any, r1, () => {});
    expect(r1.code).toBe(200);
    expect(r1.body.status).toBe('healthy');

    h.addCheck('bad', async () => { throw new Error('x'); });
    const r2 = fakeRes();
    await h.handler()({} as any, r2, () => {});
    expect(r2.code).toBe(503);

    const r3 = fakeRes();
    await h.readinessHandler()({} as any, r3, () => {});
    expect(r3.code).toBe(503);
    expect(r3.body.ready).toBe(false);

    const r4 = fakeRes();
    await h.livenessHandler()({} as any, r4, () => {});
    expect(r4.body.status).toBe('alive');
  });
});
