import { describe, it, expect, afterEach } from 'vitest';
import {
  ClusterStore,
  installClusterRateLimitPrimary,
  rateLimit,
  TooManyRequestsError,
  CLUSTER_RATE_LIMIT_TAG,
  ClusterPrimaryTransport,
  ClusterWorkerChannel,
  ClusterWorkerHandle,
  ClusterRateLimitRequest,
  RateLimitRecord
} from '../src/index';
import { mockReq, mockRes, run } from './mocks';

/**
 * In-memory stand-in for node:cluster IPC. Messages are delivered on a later
 * microtask, like real IPC, and are structurally cloned.
 */
class FakeCluster {
  private primaryListeners = new Set<(worker: ClusterWorkerHandle, message: unknown) => void>();
  sent: ClusterRateLimitRequest[] = [];

  readonly primary: ClusterPrimaryTransport = {
    onMessage: listener => {
      this.primaryListeners.add(listener);
      return () => {
        this.primaryListeners.delete(listener);
      };
    }
  };

  worker(): ClusterWorkerChannel & { emit(message: unknown): void } {
    const listeners = new Set<(message: unknown) => void>();
    const handle: ClusterWorkerHandle = {
      send: message => {
        const copy = structuredClone(message);
        queueMicrotask(() => listeners.forEach(l => l(copy)));
        return true;
      }
    };
    return {
      send: message => {
        this.sent.push(message);
        const copy = structuredClone(message);
        queueMicrotask(() => this.primaryListeners.forEach(l => l(handle, copy)));
      },
      onMessage: listener => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
      emit: message => listeners.forEach(l => l(message))
    };
  }

  /** Send a raw message to the primary on behalf of a worker; resolves with the reply. */
  raw(message: unknown): Promise<unknown> {
    return new Promise(resolve => {
      const handle: ClusterWorkerHandle = { send: reply => resolve(reply) };
      this.primaryListeners.forEach(l => l(handle, message));
    });
  }

  get listenerCount(): number {
    return this.primaryListeners.size;
  }
}

const disposers: Array<() => void> = [];
const stores: ClusterStore[] = [];
afterEach(() => {
  disposers.splice(0).forEach(d => d());
  stores.splice(0).forEach(s => s.close());
});

function setup() {
  const fake = new FakeCluster();
  disposers.push(installClusterRateLimitPrimary({ transport: fake.primary }));
  return fake;
}

function store(options: ConstructorParameters<typeof ClusterStore>[0]): ClusterStore {
  const s = new ClusterStore(options);
  stores.push(s);
  return s;
}

describe('ClusterStore', () => {
  it('shares one counter across workers through the primary', async () => {
    const fake = setup();
    const w1 = store({ channel: fake.worker() });
    const w2 = store({ channel: fake.worker() });

    expect((await w1.increment('ip', 1000)).count).toBe(1);
    expect((await w2.increment('ip', 1000)).count).toBe(2);
    const third = await w1.increment('ip', 1000);
    expect(third.count).toBe(3);
    expect(third.resetAt).toBeGreaterThan(Date.now());
    expect(fake.sent.every(m => m.__axil === CLUSTER_RATE_LIMIT_TAG)).toBe(true);
  });

  it('keeps namespaces apart on the primary', async () => {
    const fake = setup();
    const login = store({ channel: fake.worker(), namespace: 'login' });
    const api = store({ channel: fake.worker(), namespace: 'api' });

    await login.increment('ip', 1000);
    await login.increment('ip', 1000);
    expect((await api.increment('ip', 1000)).count).toBe(1);
    expect((await login.increment('ip', 1000)).count).toBe(3);
  });

  it('routes concurrent replies to the right store on a shared channel', async () => {
    const fake = setup();
    const channel = fake.worker();
    const a = store({ channel, namespace: 'a' });
    const b = store({ channel, namespace: 'b' });

    const results = await Promise.all([
      a.increment('k', 1000),
      b.increment('k', 1000),
      a.increment('k', 1000)
    ]);
    expect(results.map(r => r.count)).toEqual([1, 1, 2]);
  });

  it('reset clears the shared counter for every worker', async () => {
    const fake = setup();
    const w1 = store({ channel: fake.worker() });
    const w2 = store({ channel: fake.worker() });

    await w1.increment('ip', 1000);
    await w2.increment('ip', 1000);
    await w2.reset('ip');
    expect((await w1.increment('ip', 1000)).count).toBe(1);
  });

  it('falls back to a local store when the primary does not answer (fail-open)', async () => {
    const fake = new FakeCluster(); // primary never installed
    const w = store({ channel: fake.worker(), timeoutMs: 20, fallbackCooldownMs: 60 });

    const started = Date.now();
    expect((await w.increment('ip', 1000)).count).toBe(1);
    expect(Date.now() - started).toBeGreaterThanOrEqual(15);

    // During the cooldown requests stay local and do not wait
    const sentBefore = fake.sent.length;
    const second = w.increment('ip', 1000) as RateLimitRecord;
    expect(second.count).toBe(2);
    expect(fake.sent.length).toBe(sentBefore);

    // After the cooldown the store tries the primary again
    await new Promise(r => setTimeout(r, 70));
    disposers.push(installClusterRateLimitPrimary({ transport: fake.primary }));
    expect((await w.increment('ip', 1000)).count).toBe(1);
    expect(fake.sent.length).toBe(sentBefore + 1);
  });

  it('falls back immediately when sending fails', async () => {
    const w = store({
      channel: {
        send: () => {
          throw new Error('channel closed');
        },
        onMessage: () => () => {}
      },
      timeoutMs: 10_000
    });
    expect((await w.increment('ip', 1000)).count).toBe(1);
  });

  it('ignores unrelated and late messages', async () => {
    const fake = setup();
    const channel = fake.worker();
    const w = store({ channel });
    expect((await w.increment('ip', 1000)).count).toBe(1); // subscribes

    channel.emit('hello');
    channel.emit(null);
    channel.emit({ cmd: 'NODE_CLUSTER' });
    channel.emit({ __axil: 'other', kind: 'reply', id: 'x' });
    channel.emit({ __axil: CLUSTER_RATE_LIMIT_TAG, kind: 'reply', id: 'unknown', ns: 'default' });
    expect((await w.increment('ip', 1000)).count).toBe(2);
  });

  it('acts as a synchronous MemoryStore outside a cluster worker', () => {
    const local = store({});
    expect(local.isClustered).toBe(false);
    const first = local.increment('ip', 1000) as RateLimitRecord;
    expect(first.count).toBe(1);
    expect((local.increment('ip', 1000) as RateLimitRecord).count).toBe(2);
    local.reset('ip');
    expect((local.increment('ip', 1000) as RateLimitRecord).count).toBe(1);
  });
});

describe('installClusterRateLimitPrimary', () => {
  it('is idempotent per transport and the disposer stops serving', async () => {
    const fake = new FakeCluster();
    const d1 = installClusterRateLimitPrimary({ transport: fake.primary });
    const d2 = installClusterRateLimitPrimary({ transport: fake.primary });
    expect(d2).toBe(d1);
    expect(fake.listenerCount).toBe(1);

    d1();
    d1();
    expect(fake.listenerCount).toBe(0);

    const d3 = installClusterRateLimitPrimary({ transport: fake.primary });
    expect(d3).not.toBe(d1);
    disposers.push(d3);
  });

  it('rejects malformed requests with an error reply', async () => {
    const fake = setup();
    const reply = (await fake.raw({
      __axil: CLUSTER_RATE_LIMIT_TAG,
      kind: 'increment',
      id: '1',
      ns: 'default',
      key: 'ip',
      windowMs: -5
    })) as { error?: string; id: string };
    expect(reply.id).toBe('1');
    expect(reply.error).toMatch(/windowMs/);
  });
});

describe('rateLimit with ClusterStore', () => {
  it('enforces one limit across workers and sets headers', async () => {
    const fake = setup();
    const mw1 = rateLimit({ max: 2, windowMs: 1000, store: store({ channel: fake.worker() }) });
    const mw2 = rateLimit({ max: 2, windowMs: 1000, store: store({ channel: fake.worker() }) });
    const req = mockReq();

    const r1 = mockRes();
    expect((await run(mw1, req, r1)).error).toBeUndefined();
    expect(r1.headers['X-RateLimit-Limit']).toBe('2');
    expect(r1.headers['X-RateLimit-Remaining']).toBe('1');

    const r2 = mockRes();
    expect((await run(mw2, req, r2)).error).toBeUndefined();
    expect(r2.headers['X-RateLimit-Remaining']).toBe('0');

    const r3 = mockRes();
    const out = await run(mw1, req, r3);
    expect(out.error).toBeInstanceOf(TooManyRequestsError);
    expect((out.error as TooManyRequestsError).statusCode).toBe(429);
    expect(r3.headers['X-RateLimit-Remaining']).toBe('0');
    expect(Number(r3.headers['Retry-After'])).toBeGreaterThanOrEqual(0);
    expect(r3.headers['X-RateLimit-Reset']).toMatch(/^\d+$/);
  });
});
