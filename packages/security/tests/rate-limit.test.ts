import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  rateLimit,
  MemoryStore,
  TooManyRequestsError,
  RateLimitStore,
  RateLimitRecord
} from '../src/index';
import { mockReq, mockRes, run } from './mocks';

afterEach(() => vi.useRealTimers());

describe('rateLimit (default memory store)', () => {
  it('allows up to max requests, then 429 with Retry-After', async () => {
    const mw = rateLimit({ max: 2, windowMs: 1000 });
    const req = mockReq();

    const r1 = mockRes();
    expect((await run(mw, req, r1)).error).toBeUndefined();
    expect(r1.headers['X-RateLimit-Limit']).toBe('2');
    expect(r1.headers['X-RateLimit-Remaining']).toBe('1');

    await run(mw, req, mockRes());

    const r3 = mockRes();
    const out = await run(mw, req, r3);
    expect(out.error).toBeInstanceOf(TooManyRequestsError);
    expect((out.error as TooManyRequestsError).statusCode).toBe(429);
    expect(r3.headers['Retry-After']).toBe('1');
    expect(r3.headers['X-RateLimit-Remaining']).toBe('0');
  });

  it('calls next synchronously with the default store', () => {
    const mw = rateLimit();
    const next = vi.fn();
    mw(mockReq(), mockRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('starts a fresh window after windowMs', async () => {
    vi.useFakeTimers();
    const mw = rateLimit({ max: 1, windowMs: 1000 });
    const req = mockReq();
    await run(mw, req, mockRes());
    expect((await run(mw, req, mockRes())).error).toBeDefined();
    vi.advanceTimersByTime(1001);
    expect((await run(mw, req, mockRes())).error).toBeUndefined();
  });

  it('keys by IP by default and supports keyGenerator / skip / headers:false', async () => {
    const mw = rateLimit({ max: 1 });
    await run(mw, mockReq({ ip: 'a' }), mockRes());
    expect((await run(mw, mockReq({ ip: 'b' }), mockRes())).error).toBeUndefined();

    const byHeader = rateLimit({ max: 1, keyGenerator: req => String(req.headers['x-key']) });
    await run(byHeader, mockReq({ ip: '1', headers: { 'x-key': 'k' } }), mockRes());
    expect((await run(byHeader, mockReq({ ip: '2', headers: { 'x-key': 'k' } }), mockRes())).error).toBeDefined();

    const skipping = rateLimit({ max: 0, skip: req => req.path === '/health' });
    expect((await run(skipping, mockReq({ path: '/health' }), mockRes())).error).toBeUndefined();

    const quiet = rateLimit({ headers: false });
    const res = mockRes();
    await run(quiet, mockReq(), res);
    expect(res.headers['X-RateLimit-Limit']).toBeUndefined();
  });

  it('gives each rateLimit() instance its own counters', async () => {
    const a = rateLimit({ max: 1 });
    const b = rateLimit({ max: 1 });
    await run(a, mockReq(), mockRes());
    expect((await run(b, mockReq(), mockRes())).error).toBeUndefined();
  });
});

describe('MemoryStore', () => {
  it('increments within a window and resets keys', () => {
    const store = new MemoryStore();
    expect(store.increment('k', 1000).count).toBe(1);
    const second = store.increment('k', 1000);
    expect(second.count).toBe(2);
    expect(second.resetAt).toBeGreaterThan(Date.now());
    store.reset('k');
    expect(store.increment('k', 1000).count).toBe(1);
    store.shutdown();
  });

  it('can be shared between limiters', async () => {
    const store = new MemoryStore();
    const a = rateLimit({ max: 1, store });
    const b = rateLimit({ max: 1, store });
    await run(a, mockReq(), mockRes());
    expect((await run(b, mockReq(), mockRes())).error).toBeInstanceOf(TooManyRequestsError);
  });
});

describe('rateLimit with a custom (async) store', () => {
  class AsyncStore implements RateLimitStore {
    hits = new Map<string, RateLimitRecord>();
    async increment(key: string, windowMs: number) {
      const rec = this.hits.get(key) ?? { count: 0, resetAt: Date.now() + windowMs };
      rec.count++;
      this.hits.set(key, rec);
      return { ...rec };
    }
    async reset(key: string) {
      this.hits.delete(key);
    }
  }

  it('awaits the store and enforces the limit', async () => {
    const store = new AsyncStore();
    const mw = rateLimit({ max: 1, windowMs: 5000, store });
    const res = mockRes();
    expect((await run(mw, mockReq(), res)).called).toBe(true);
    expect(res.headers['X-RateLimit-Remaining']).toBe('0');
    expect((await run(mw, mockReq(), mockRes())).error).toBeInstanceOf(TooManyRequestsError);
    await store.reset('127.0.0.1');
    expect((await run(mw, mockReq(), mockRes())).error).toBeUndefined();
  });

  it('passes store failures (sync or async) to next(err)', async () => {
    const failing: RateLimitStore = {
      increment: async () => {
        throw new Error('redis down');
      },
      reset: () => {}
    };
    const out = await run(rateLimit({ store: failing }), mockReq(), mockRes());
    expect(out.error?.message).toBe('redis down');

    const throwing: RateLimitStore = {
      increment: () => {
        throw new Error('sync fail');
      },
      reset: () => {}
    };
    expect((await run(rateLimit({ store: throwing }), mockReq(), mockRes())).error?.message).toBe('sync fail');
  });
});

describe('rateLimit keyGenerator (bug fix: typed to { ip, headers } only)', () => {
  it('receives the full request, so it can key on route params', async () => {
    const mw = rateLimit({
      max: 1,
      windowMs: 1000,
      keyGenerator: req => `webhook:${req.params.source}:${req.method}:${req.path}`
    });
    const github = mockReq({ params: { source: 'github' }, path: '/hooks/github', method: 'POST' });
    const stripe = mockReq({ params: { source: 'stripe' }, path: '/hooks/stripe', method: 'POST' });

    expect((await run(mw, github, mockRes())).error).toBeUndefined();
    // Same IP, different source → separate bucket
    expect((await run(mw, stripe, mockRes())).error).toBeUndefined();
    expect((await run(mw, github, mockRes())).error).toBeInstanceOf(TooManyRequestsError);
  });

  it('passes the very request object to keyGenerator and skip (locals too)', async () => {
    const req = mockReq({ locals: { tenant: 't1' } });
    const seen: unknown[] = [];
    const mw = rateLimit({
      keyGenerator: r => { seen.push(r); return String(r.locals.tenant); },
      skip: r => { seen.push(r); return false; }
    });
    await run(mw, req, mockRes());
    expect(seen).toEqual([req, req]);
    expect(seen[0]).toBe(req);
  });

  it('still accepts generators typed for the old { ip, headers } shape', () => {
    const legacy = (req: { ip: string; headers: Record<string, any> }) => req.ip;
    expect(() => rateLimit({ keyGenerator: legacy })).not.toThrow();
  });
});
