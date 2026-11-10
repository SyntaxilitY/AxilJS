import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { retry, withTimeout } from '../src/retry';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('retry', () => {
  it('returns the first success', async () => {
    const fn = vi.fn().mockResolvedValue('v');
    await expect(retry(fn)).resolves.toBe('v');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries with exponential backoff and onRetry', async () => {
    const onRetry = vi.fn();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('a'))
      .mockRejectedValueOnce(new Error('b'))
      .mockResolvedValue('ok');
    const p = retry(fn, { attempts: 3, delay: 100, jitter: false, onRetry });
    await vi.advanceTimersByTimeAsync(99);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(200);
    await expect(p).resolves.toBe('ok');
    expect(onRetry.mock.calls.map(c => [c[0], c[1].message, c[2]])).toEqual([[1, 'a', 100], [2, 'b', 200]]);
  });

  it('supports linear and fixed backoff and maxDelay', async () => {
    const delays: number[] = [];
    const fn = vi.fn().mockRejectedValue(new Error('x'));
    const p1 = retry(fn, { attempts: 4, delay: 100, backoff: 'linear', jitter: false, onRetry: (_a, _e, d) => delays.push(d) });
    const a1 = expect(p1).rejects.toThrow('x');
    await vi.advanceTimersByTimeAsync(1000);
    await a1;
    expect(delays).toEqual([100, 200, 300]);

    delays.length = 0;
    const p2 = retry(fn, { attempts: 3, delay: 50, backoff: 'fixed', jitter: false, onRetry: (_a, _e, d) => delays.push(d) });
    const a2 = expect(p2).rejects.toThrow('x');
    await vi.advanceTimersByTimeAsync(1000);
    await a2;
    expect(delays).toEqual([50, 50]);

    delays.length = 0;
    const p3 = retry(fn, { attempts: 4, delay: 100, maxDelay: 150, jitter: false, onRetry: (_a, _e, d) => delays.push(d) });
    const a3 = expect(p3).rejects.toThrow('x');
    await vi.advanceTimersByTimeAsync(1000);
    await a3;
    expect(delays).toEqual([100, 150, 150]);
  });

  it('applies jitter within ±25%', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const delays: number[] = [];
    const fn = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue(1);
    const p = retry(fn, { attempts: 2, delay: 100, onRetry: (_a, _e, d) => delays.push(d) });
    await vi.advanceTimersByTimeAsync(200);
    await p;
    expect(delays).toEqual([125]);
  });

  it('stops when retryIf returns false', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fatal'));
    await expect(retry(fn, { retryIf: (e) => e.message !== 'fatal' })).rejects.toThrow('fatal');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('wraps non-Error rejections', async () => {
    const fn = vi.fn().mockRejectedValue('str');
    await expect(retry(fn, { attempts: 1 })).rejects.toThrow('str');
  });

  it('attempts: 0 (or invalid) runs exactly once instead of throwing undefined', async () => {
    const ok = vi.fn().mockResolvedValue('v');
    await expect(retry(ok, { attempts: 0 })).resolves.toBe('v');
    expect(ok).toHaveBeenCalledTimes(1);

    const bad = vi.fn().mockRejectedValue(new Error('boom'));
    await expect(retry(bad, { attempts: 0 })).rejects.toThrow('boom');
    await expect(retry(bad, { attempts: -5 })).rejects.toThrow('boom');
    await expect(retry(bad, { attempts: NaN })).rejects.toThrow('boom');
    expect(bad).toHaveBeenCalledTimes(3);
  });
});

describe('withTimeout', () => {
  it('resolves when the promise settles in time', async () => {
    await expect(withTimeout(Promise.resolve(5), 100)).resolves.toBe(5);
    await expect(withTimeout(Promise.reject(new Error('e')), 100)).rejects.toThrow('e');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects with a default or custom message on timeout', async () => {
    const p1 = withTimeout(new Promise(() => {}), 100);
    const a1 = expect(p1).rejects.toThrow('Operation timed out after 100ms');
    vi.advanceTimersByTime(100);
    await a1;
    const p2 = withTimeout(new Promise(() => {}), 10, 'custom');
    const a2 = expect(p2).rejects.toThrow('custom');
    vi.advanceTimersByTime(10);
    await a2;
  });
});
