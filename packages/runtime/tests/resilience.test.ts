import { describe, it, expect, beforeEach } from 'vitest';
import {
  tCircuitBreaker, tBulkhead, tConcurrency, tMutex, tLock, tDedupe, tFallback, tHedge,
  tCache, tCacheEvict, tCacheInvalidate, tRateLimit, tThrottle, tDebounce
} from '@axiljs/decorator';
import {
  wire,
  runWithContext,
  resetResilienceState,
  getCircuitStates,
  RateLimitExceededError,
  CircuitOpenError,
  CapacityExceededError,
  LockTimeoutError,
  parseDuration,
  resolveKey
} from '../src';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

beforeEach(() => resetResilienceState());

describe('keys', () => {
  it('parses durations', () => {
    expect(parseDuration('250ms')).toBe(250);
    expect(parseDuration('10s')).toBe(10_000);
    expect(parseDuration('1m')).toBe(60_000);
    expect(parseDuration('2h')).toBe(7_200_000);
    expect(() => parseDuration('soon')).toThrow();
  });

  it('resolves templates, paths and context keys', () => {
    const inv = { target: {}, className: 'C', method: 'm', args: [{ id: 7 }, 'x'] };
    expect(resolveKey('order:{0.id}', inv)).toBe('order:7');
    expect(resolveKey('args.1', inv)).toBe('x');
    expect(resolveKey((o: any) => `k${o.id}`, inv)).toBe('k7');
    expect(runWithContext({ tenantId: 't9' }, () => resolveKey('tenant', inv))).toBe('t9');
    expect(resolveKey('user', inv)).toBeUndefined();
  });
});

describe('tCircuitBreaker', () => {
  it('opens after N failures, fails fast, then recovers via half-open', async () => {
    class Upstream {
      fail = true;
      calls = 0;
      @tCircuitBreaker({ threshold: 2, resetTimeout: 30 })
      async call() { this.calls++; if (this.fail) throw new Error('down'); return 'up'; }
    }
    wire(Upstream);
    const u = new Upstream();
    await expect(u.call()).rejects.toThrow('down');
    await expect(u.call()).rejects.toThrow('down');
    await expect(u.call()).rejects.toBeInstanceOf(CircuitOpenError);
    expect(u.calls).toBe(2);
    expect(getCircuitStates()['Upstream.call']).toBe('OPEN');

    await sleep(40);
    u.fail = false;
    await expect(u.call()).resolves.toBe('up');
    expect(getCircuitStates()['Upstream.call']).toBe('CLOSED');
  });
});

describe('tBulkhead / tConcurrency / tMutex', () => {
  it('bulkhead rejects beyond concurrency + queue', async () => {
    class Svc {
      @tBulkhead({ name: 'reports', concurrency: 1, queue: 1 })
      async run() { await sleep(20); return 1; }
    }
    wire(Svc);
    const s = new Svc();
    const results = await Promise.allSettled([s.run(), s.run(), s.run()]);
    expect(results.map(r => r.status)).toEqual(['fulfilled', 'fulfilled', 'rejected']);
    expect((results[2] as PromiseRejectedResult).reason).toBeInstanceOf(CapacityExceededError);
  });

  it('concurrency queues by default and never exceeds the limit', async () => {
    let active = 0;
    let peak = 0;
    class Svc {
      @tConcurrency({ limit: 2 })
      async run() { active++; peak = Math.max(peak, active); await sleep(10); active--; }
    }
    wire(Svc);
    const s = new Svc();
    await Promise.all(Array.from({ length: 6 }, () => s.run()));
    expect(peak).toBe(2);
  });

  it('concurrency with strategy reject fails fast', async () => {
    class Svc {
      @tConcurrency({ limit: 1, strategy: 'reject' })
      async run() { await sleep(10); }
    }
    wire(Svc);
    const s = new Svc();
    const r = await Promise.allSettled([s.run(), s.run()]);
    expect(r[1].status).toBe('rejected');
  });

  it('mutex serializes calls', async () => {
    const order: string[] = [];
    class Svc {
      @tMutex()
      async run(name: string) { order.push(`${name}:start`); await sleep(5); order.push(`${name}:end`); }
    }
    wire(Svc);
    const s = new Svc();
    await Promise.all([s.run('a'), s.run('b')]);
    expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end']);
  });
});

describe('tLock', () => {
  it('serializes per key and times out waiting', async () => {
    class Svc {
      @tLock({ key: 'acct:{0}', wait: 10 })
      async move(_acct: string, ms: number) { await sleep(ms); return 'ok'; }
    }
    wire(Svc);
    const s = new Svc();
    const r = await Promise.allSettled([s.move('a', 40), s.move('a', 1), s.move('b', 1)]);
    expect(r[0].status).toBe('fulfilled');
    expect((r[1] as PromiseRejectedResult).reason).toBeInstanceOf(LockTimeoutError);
    expect(r[2].status).toBe('fulfilled');
  });
});

describe('tDedupe', () => {
  it('coalesces concurrent identical calls', async () => {
    class Svc {
      runs = 0;
      @tDedupe({ key: 'args.0' })
      async load(_id: string) { this.runs++; await sleep(10); return { loaded: true }; }
    }
    wire(Svc);
    const s = new Svc();
    const [a, b] = await Promise.all([s.load('x'), s.load('x')]);
    expect(a).toBe(b);
    expect(s.runs).toBe(1);
    await s.load('x');
    expect(s.runs).toBe(2);
  });
});

describe('tFallback', () => {
  it('returns a value or calls a method on failure', async () => {
    class Svc {
      @tFallback({ value: [] })
      async list() { throw new Error('db down'); }

      @tFallback({ method: 'cached' })
      async price(id: string) { throw new Error(`no price ${id}`); }
      cached(id: string, err: Error) { return `cached-${id}:${err.message}`; }
    }
    wire(Svc);
    await expect(new Svc().list()).resolves.toEqual([]);
    await expect(new Svc().price('p1')).resolves.toBe('cached-p1:no price p1');
  });
});

describe('tHedge', () => {
  it('starts a second attempt when the first is slow', async () => {
    class Svc {
      attempt = 0;
      @tHedge({ delay: 10, maxAttempts: 2 })
      async read() { const n = ++this.attempt; await sleep(n === 1 ? 100 : 5); return n; }
    }
    wire(Svc);
    const s = new Svc();
    const started = Date.now();
    await expect(s.read()).resolves.toBe(2);
    expect(Date.now() - started).toBeLessThan(80);
  });
});

describe('tCache family', () => {
  it('caches per key, evicts by key and invalidates by tag', async () => {
    class Users {
      reads = 0;
      @tCache({ key: (id: string) => `user:${id}`, ttl: 1000, tags: ['users'] })
      async get(id: string) { this.reads++; return { id }; }

      @tCacheEvict({ key: (id: string) => `user:${id}` })
      async update(_id: string) { return true; }

      @tCacheInvalidate('users')
      async bulkImport() { return true; }
    }
    wire(Users);
    const u = new Users();
    await u.get('1');
    await u.get('1');
    expect(u.reads).toBe(1);
    await u.update('1');
    await u.get('1');
    expect(u.reads).toBe(2);
    await u.get('2');
    await u.bulkImport();
    await u.get('1');
    await u.get('2');
    expect(u.reads).toBe(5);
  });

  it('expires after ttl', async () => {
    class Svc {
      reads = 0;
      @tCache({ key: 'config', ttl: 15 })
      async load() { return ++this.reads; }
    }
    wire(Svc);
    const s = new Svc();
    expect(await s.load()).toBe(1);
    expect(await s.load()).toBe(1);
    await sleep(25);
    expect(await s.load()).toBe(2);
  });
});

describe('tRateLimit / tThrottle / tDebounce', () => {
  it('rate limits per key', async () => {
    class Api {
      @tRateLimit({ limit: 2, window: '1m', key: 'tenant' })
      async call() { return 'ok'; }
    }
    wire(Api);
    const a = new Api();
    const run = (t: string) => runWithContext({ tenantId: t }, () => a.call());
    await run('t1');
    await run('t1');
    await expect(run('t1')).rejects.toBeInstanceOf(RateLimitExceededError);
    await expect(run('t2')).resolves.toBe('ok');
  });

  it('throttles the method', async () => {
    class Svc {
      @tThrottle(1, 1000)
      async ping() { return 'pong'; }
    }
    wire(Svc);
    const s = new Svc();
    await s.ping();
    await expect(s.ping()).rejects.toMatchObject({ statusCode: 429 });
  });

  it('debounce runs once with the last arguments', async () => {
    class Search {
      runs: string[] = [];
      @tDebounce(15)
      async query(q: string) { this.runs.push(q); return `results:${q}`; }
    }
    wire(Search);
    const s = new Search();
    const results = await Promise.all([s.query('a'), s.query('ab'), s.query('abc')]);
    expect(s.runs).toEqual(['abc']);
    expect(results).toEqual(['results:abc', 'results:abc', 'results:abc']);
  });
});

describe('setRateLimitStore', () => {
  it('uses a pluggable async counter store', async () => {
    const { setRateLimitStore } = await import('../src');
    const counts = new Map<string, number>();
    setRateLimitStore({
      async increment(key: string, windowMs: number) {
        const n = (counts.get(key) ?? 0) + 1;
        counts.set(key, n);
        return { count: n, resetAt: Date.now() + windowMs };
      }
    });
    class Api {
      @tRateLimit({ limit: 1, window: '1m' })
      async call() { return 'ok'; }
    }
    wire(Api);
    await expect(new Api().call()).resolves.toBe('ok');
    await expect(new Api().call()).rejects.toBeInstanceOf(RateLimitExceededError);
    expect([...counts.keys()]).toEqual(['rl:Api.call:global']);
  });
});

describe('useStores', () => {
  it('installs only the stores that are given', async () => {
    const { useStores, getCacheStore, setRateLimitStore } = await import('../src');
    const cache = { get: () => undefined, set() {}, delete() {}, deleteByTag() {}, clear() {} };
    const counted: string[] = [];
    const rateLimit = { increment(key: string, windowMs: number) { counted.push(key); return { count: 1, resetAt: Date.now() + windowMs }; } };
    expect(useStores({ cache, rateLimit })).toEqual(['rateLimit', 'cache']);
    expect(getCacheStore()).toBe(cache);
    class Api {
      @tRateLimit({ limit: 5, window: '1m' })
      async call() { return 'ok'; }
    }
    wire(Api);
    await new Api().call();
    expect(counted).toEqual(['rl:Api.call:global']);
    setRateLimitStore(undefined);
  });
});
