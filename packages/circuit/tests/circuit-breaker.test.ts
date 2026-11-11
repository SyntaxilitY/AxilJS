import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CircuitBreaker, CircuitOpenError, BulkheadRejectedError } from '../src/circuit-breaker';

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const ok = () => Promise.resolve('ok');
const fail = () => Promise.reject(new Error('fail'));

function deferred<T = string>() {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

async function failTimes(cb: CircuitBreaker, n: number) {
  for (let i = 0; i < n; i++) await cb.execute(fail).catch(() => {});
}

describe('state machine', () => {
  it('opens after failureThreshold failures (below minimumRequests)', async () => {
    const cb = new CircuitBreaker('svc', { failureThreshold: 3 });
    const changes: string[] = [];
    cb.on('stateChange', (to, from) => changes.push(`${from}->${to}`));
    await failTimes(cb, 2);
    expect(cb.getState()).toBe('CLOSED');
    await failTimes(cb, 1);
    expect(cb.getState()).toBe('OPEN');
    expect(changes).toEqual(['CLOSED->OPEN']);
    await expect(cb.execute(ok)).rejects.toBeInstanceOf(CircuitOpenError);
  });

  it('opens on failure rate once minimumRequests is reached', async () => {
    const cb = new CircuitBreaker('svc', { failureThreshold: 100, minimumRequests: 4, failureRateThreshold: 0.5 });
    await cb.execute(ok);
    await cb.execute(ok);
    await failTimes(cb, 1);
    expect(cb.getState()).toBe('CLOSED');
    await failTimes(cb, 1); // 2/4 = 50%
    expect(cb.getState()).toBe('OPEN');
  });

  it('uses the fallback while OPEN', async () => {
    const cb = new CircuitBreaker('svc', { failureThreshold: 1, fallback: () => 'cached' });
    await failTimes(cb, 1);
    const fn = vi.fn(ok);
    await expect(cb.execute(fn)).resolves.toBe('cached');
    expect(fn).not.toHaveBeenCalled();
  });

  it('goes HALF_OPEN after resetTimeoutMs; success closes with fresh counters', async () => {
    const cb = new CircuitBreaker('svc', { failureThreshold: 1, resetTimeoutMs: 1000 });
    await failTimes(cb, 1);
    vi.advanceTimersByTime(999);
    await expect(cb.execute(ok)).rejects.toBeInstanceOf(CircuitOpenError);
    vi.advanceTimersByTime(1);
    await expect(cb.execute(ok)).resolves.toBe('ok');
    expect(cb.getState()).toBe('CLOSED');
    expect(cb.getStats()).toMatchObject({ failureCount: 0, successCount: 0, requestCount: 0, failureRate: 0 });
  });

  it('HALF_OPEN failure reopens and restarts the timer', async () => {
    const cb = new CircuitBreaker('svc', { failureThreshold: 1, resetTimeoutMs: 1000 });
    await failTimes(cb, 1);
    vi.advanceTimersByTime(1000);
    await failTimes(cb, 1);
    expect(cb.getState()).toBe('OPEN');
    vi.advanceTimersByTime(999);
    await expect(cb.execute(ok)).rejects.toBeInstanceOf(CircuitOpenError);
  });

  it('HALF_OPEN lets exactly one probe through', async () => {
    const cb = new CircuitBreaker('svc', { failureThreshold: 1, resetTimeoutMs: 1000, fallback: () => 'fb' });
    await failTimes(cb, 1);
    vi.advanceTimersByTime(1000);
    const probe = deferred();
    const probeFn = vi.fn(() => probe.promise);
    const other = vi.fn(ok);
    const p1 = cb.execute(probeFn);
    expect(cb.getState()).toBe('HALF_OPEN');
    await expect(cb.execute(other)).resolves.toBe('fb');
    expect(other).not.toHaveBeenCalled();
    probe.resolve('probe-ok');
    await expect(p1).resolves.toBe('probe-ok');
    expect(cb.getState()).toBe('CLOSED');
    await expect(cb.execute(other)).resolves.toBe('ok');
  });

  it('reset() closes the circuit', async () => {
    const cb = new CircuitBreaker('svc', { failureThreshold: 1 });
    await failTimes(cb, 1);
    cb.reset();
    expect(cb.getState()).toBe('CLOSED');
    expect(cb.getStats().requestCount).toBe(0);
  });

  it('times out slow requests and counts them as failures', async () => {
    const cb = new CircuitBreaker('svc', { failureThreshold: 1, requestTimeoutMs: 100 });
    const p = cb.execute(() => new Promise(() => {}));
    const assertion = expect(p).rejects.toThrow(/timeout after 100ms/);
    vi.advanceTimersByTime(100);
    await assertion;
    expect(cb.getState()).toBe('OPEN');
  });

  it('counts a synchronous throw as a failure', async () => {
    const cb = new CircuitBreaker('svc', { failureThreshold: 1 });
    await expect(cb.execute(() => { throw new Error('sync'); })).rejects.toThrow('sync');
    expect(cb.getState()).toBe('OPEN');
  });
});

describe('late results', () => {
  it('late failures from requests started before OPEN do not extend the OPEN timer', async () => {
    const cb = new CircuitBreaker('svc', { failureThreshold: 1, resetTimeoutMs: 1000, requestTimeoutMs: 60000 });
    const slow = deferred();
    const pSlow = cb.execute(() => slow.promise).catch(() => {});
    await failTimes(cb, 1);
    expect(cb.getState()).toBe('OPEN');

    vi.advanceTimersByTime(900);
    slow.reject(new Error('late'));
    await pSlow;
    expect(cb.getState()).toBe('OPEN');

    vi.advanceTimersByTime(100); // 1000ms after the original trip
    await expect(cb.execute(ok)).resolves.toBe('ok');
    expect(cb.getState()).toBe('CLOSED');
  });

  it('late results do not decide a HALF_OPEN probe', async () => {
    const cb = new CircuitBreaker('svc', { failureThreshold: 1, resetTimeoutMs: 1000, requestTimeoutMs: 60000, fallback: () => 'fb' });
    const stale = deferred();
    const pStale = cb.execute(() => stale.promise);
    await failTimes(cb, 1);
    vi.advanceTimersByTime(1000);
    const probe = deferred();
    const pProbe = cb.execute(() => probe.promise);
    expect(cb.getState()).toBe('HALF_OPEN');
    stale.resolve('stale-ok'); // must not close the circuit
    await pStale;
    expect(cb.getState()).toBe('HALF_OPEN');
    probe.reject(new Error('probe failed'));
    await pProbe.catch(() => {});
    expect(cb.getState()).toBe('OPEN');
  });
});

describe('rollingWindowMs', () => {
  it('default (cumulative) keeps counting old failures', async () => {
    const cb = new CircuitBreaker('svc', { failureThreshold: 3 });
    await failTimes(cb, 2);
    vi.advanceTimersByTime(3_600_000);
    await failTimes(cb, 1);
    expect(cb.getState()).toBe('OPEN');
  });

  it('forgets outcomes older than the window', async () => {
    const cb = new CircuitBreaker('svc', { failureThreshold: 3, rollingWindowMs: 10_000 });
    await failTimes(cb, 2);
    expect(cb.getStats().failureCount).toBe(2);
    vi.advanceTimersByTime(10_001);
    expect(cb.getStats()).toMatchObject({ failureCount: 0, requestCount: 0 });
    await failTimes(cb, 2);
    expect(cb.getState()).toBe('CLOSED');
    vi.advanceTimersByTime(5_000);
    await failTimes(cb, 1);
    expect(cb.getState()).toBe('OPEN');
  });

  it('applies to the failure rate too', async () => {
    const cb = new CircuitBreaker('svc', { failureThreshold: 100, minimumRequests: 4, failureRateThreshold: 0.5, rollingWindowMs: 1000 });
    await cb.execute(ok);
    await cb.execute(ok);
    await cb.execute(ok);
    await failTimes(cb, 1);
    vi.advanceTimersByTime(1001);
    // Old successes have expired: 4 new requests, 2 failures → 50%
    await cb.execute(ok);
    await cb.execute(ok);
    await failTimes(cb, 1);
    expect(cb.getState()).toBe('CLOSED');
    await failTimes(cb, 1);
    expect(cb.getState()).toBe('OPEN');
  });
});

describe('bulkhead', () => {
  it('rejects beyond maxConcurrent with BulkheadRejectedError', async () => {
    const cb = new CircuitBreaker('svc', { maxConcurrent: 2 });
    const rejected = vi.fn();
    cb.on('bulkheadRejected', rejected);
    const a = deferred();
    const b = deferred();
    const pa = cb.execute(() => a.promise);
    const pb = cb.execute(() => b.promise);
    await Promise.resolve();
    expect(cb.getStats().activeCount).toBe(2);
    await expect(cb.execute(ok)).rejects.toBeInstanceOf(BulkheadRejectedError);
    expect(rejected).toHaveBeenCalledTimes(1);
    a.resolve('a');
    await pa;
    await expect(cb.execute(ok)).resolves.toBe('ok');
    b.resolve('b');
    await pb;
    expect(cb.getStats().activeCount).toBe(0);
  });

  it('queues up to maxQueue callers and runs them FIFO', async () => {
    const cb = new CircuitBreaker('svc', { maxConcurrent: 1, maxQueue: 2 });
    const order: string[] = [];
    const first = deferred();
    const p1 = cb.execute(async () => { order.push('1'); return first.promise; });
    const p2 = cb.execute(async () => { order.push('2'); return '2'; });
    const p3 = cb.execute(async () => { order.push('3'); return '3'; });
    await expect(cb.execute(ok)).rejects.toBeInstanceOf(BulkheadRejectedError);
    await Promise.resolve();
    expect(cb.getStats().queuedCount).toBe(2);
    expect(order).toEqual(['1']);
    first.resolve('1');
    await expect(Promise.all([p1, p2, p3])).resolves.toEqual(['1', '2', '3']);
    expect(order).toEqual(['1', '2', '3']);
    expect(cb.getStats()).toMatchObject({ activeCount: 0, queuedCount: 0 });
  });

  it('releases the slot when the call fails', async () => {
    const cb = new CircuitBreaker('svc', { maxConcurrent: 1, failureThreshold: 100 });
    await cb.execute(fail).catch(() => {});
    await expect(cb.execute(ok)).resolves.toBe('ok');
  });

  it('bulkhead rejections are not circuit failures; OPEN rejects before the bulkhead', async () => {
    const cb = new CircuitBreaker('svc', { maxConcurrent: 1, failureThreshold: 1, fallback: () => 'fb' });
    const a = deferred();
    const pa = cb.execute(() => a.promise);
    await expect(cb.execute(ok)).rejects.toBeInstanceOf(BulkheadRejectedError);
    expect(cb.getStats().failureCount).toBe(0);
    a.reject(new Error('x'));
    await pa.catch(() => {});
    expect(cb.getState()).toBe('OPEN');
    await expect(cb.execute(ok)).resolves.toBe('fb');
  });
});

describe('logger option', () => {
  it('logger: false writes nothing to stdout; stateChange still fires', async () => {
    vi.restoreAllMocks();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const cb = new CircuitBreaker('svc', { failureThreshold: 1, resetTimeoutMs: 100, logger: false });
    const changes: string[] = [];
    cb.on('stateChange', (to, from) => changes.push(`${from}->${to}`));
    await failTimes(cb, 1);
    vi.advanceTimersByTime(100);
    await cb.execute(ok);
    write.mockRestore();
    expect(changes).toEqual(['CLOSED->OPEN', 'OPEN->HALF_OPEN', 'HALF_OPEN->CLOSED']);
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it('a custom logger receives plain-text transitions (OPEN via warn)', async () => {
    vi.restoreAllMocks();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logger = { info: vi.fn(), warn: vi.fn() };
    const cb = new CircuitBreaker('svc', { failureThreshold: 1, resetTimeoutMs: 100, logger });
    await failTimes(cb, 1);
    vi.advanceTimersByTime(100);
    await cb.execute(ok);
    expect(logger.warn).toHaveBeenCalledWith("[CircuitBreaker] 'svc': CLOSED → OPEN");
    expect(logger.info).toHaveBeenCalledWith("[CircuitBreaker] 'svc': OPEN → HALF_OPEN");
    expect(logger.info).toHaveBeenCalledWith("[CircuitBreaker] 'svc': HALF_OPEN → CLOSED");
    expect(log).not.toHaveBeenCalled();
  });

  it('defaults to console.log (unchanged behaviour)', async () => {
    const log = vi.mocked(console.log);
    const cb = new CircuitBreaker('svc', { failureThreshold: 1 });
    await failTimes(cb, 1);
    expect(log).toHaveBeenCalledWith(expect.stringContaining("'svc': CLOSED → OPEN"));
  });
});
