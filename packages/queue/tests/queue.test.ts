import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Queue } from '../src/queue';
import { createJob, Job } from '../src/job';
import { InMemoryQueueStore, QueueStore } from '../src/store';

let queues: Queue[] = [];

function makeQueue(opts: ConstructorParameters<typeof Queue>[1] = {}): Queue {
  const q = new Queue('test', { pollIntervalMs: 10, backoff: { type: 'fixed', delay: 100 }, ...opts });
  queues.push(q);
  return q;
}

const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(async () => {
  for (const q of queues) {
    const p = q.stop();
    await vi.advanceTimersByTimeAsync(10000);
    await p;
  }
  queues = [];
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('createJob', () => {
  it('applies defaults', () => {
    const j = createJob('q', 'n', { a: 1 });
    expect(j).toMatchObject({ queue: 'q', name: 'n', status: 'pending', attempts: 0, maxAttempts: 3, priority: 0, delay: 0 });
    expect(j.timeoutMs).toBeUndefined();
  });

  it('marks delayed jobs and honours runAt / timeoutMs', () => {
    const j = createJob('q', 'n', null, { delay: 50, timeoutMs: 1000 });
    expect(j.status).toBe('delayed');
    expect(j.runAt.getTime() - j.createdAt.getTime()).toBe(50);
    expect(j.timeoutMs).toBe(1000);
    const at = new Date(Date.now() + 99999);
    expect(createJob('q', 'n', null, { runAt: at }).runAt).toBe(at);
  });
});

describe('Queue processing', () => {
  it('processes a job and emits completed', async () => {
    const q = makeQueue();
    const completed = vi.fn();
    q.on('completed', completed);
    q.process<{ x: number }>('double', async (job) => job.data.x * 2);
    q.start();
    const job = await q.add('double', { x: 21 });
    await tick(20);
    expect(job.status).toBe('completed');
    expect(job.result).toBe(42);
    expect(job.attempts).toBe(1);
    expect(job.finishedAt).toBeInstanceOf(Date);
    expect(completed).toHaveBeenCalledWith(job, 42);
    expect(q.getStats()).toMatchObject({ completed: 1, pending: 0 });
  });

  it('processes higher priority first, FIFO within a priority', async () => {
    const q = makeQueue();
    const order: string[] = [];
    q.process<string>('j', async (job) => { order.push(job.data); });
    await q.add('j', 'low1');
    await q.add('j', 'high', { priority: 10 });
    await q.add('j', 'low2');
    q.start();
    await tick(100);
    expect(order).toEqual(['high', 'low1', 'low2']);
  });

  it('does not run delayed jobs before their delay', async () => {
    const q = makeQueue();
    const fn = vi.fn(async () => {});
    q.process('j', fn);
    q.start();
    await q.add('j', null, { delay: 200 });
    await tick(150);
    expect(fn).not.toHaveBeenCalled();
    await tick(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('fills all concurrency slots', async () => {
    const q = makeQueue({ concurrency: 3 });
    q.process('j', () => new Promise(() => { /* never settles */ }));
    await q.addMany('j', [1, 2, 3, 4, 5]);
    q.start();
    await tick(10);
    expect(q.getStats().active).toBe(3);
    expect(q.getStats().pending).toBe(2);
    // Cancel the hung jobs so stop() can finish
    for (const j of q.getJobs('active')) q.cancel(j.id);
    for (const j of q.getJobs('pending')) q.cancel(j.id);
  });

  it('retries with backoff and then succeeds', async () => {
    const q = makeQueue();
    const retry = vi.fn();
    let calls = 0;
    q.on('retry', retry);
    q.process('flaky', async () => {
      calls++;
      if (calls < 3) throw new Error('nope ' + calls);
      return 'ok';
    });
    q.start();
    const job = await q.add('flaky', null);
    await tick(10);
    expect(job.status).toBe('delayed');
    expect(job.error).toBe('nope 1');
    await tick(110);
    await tick(110);
    expect(job.status).toBe('completed');
    expect(job.attempts).toBe(3);
    expect(retry).toHaveBeenCalledTimes(2);
  });

  it('marks failed after maxAttempts', async () => {
    const q = makeQueue();
    const failed = vi.fn();
    q.on('failed', failed);
    q.process('bad', async () => { throw new Error('always'); });
    q.start();
    const job = await q.add('bad', null, { maxAttempts: 2 });
    await tick(300);
    expect(job.status).toBe('failed');
    expect(job.attempts).toBe(2);
    expect(job.error).toBe('always');
    expect(job.stack).toContain('always');
    expect(failed).toHaveBeenCalledTimes(1);
  });

  it('uses exponential backoff by default', async () => {
    const q = new Queue('exp', { pollIntervalMs: 10 });
    queues.push(q);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    q.process('bad', async () => { throw new Error('x'); });
    q.start();
    const job = await q.add('bad', null);
    await tick(10);
    const firstRetryAt = job.runAt.getTime();
    expect(firstRetryAt - Date.now()).toBeGreaterThan(900);
    await tick(1010);
    expect(job.attempts).toBe(2);
    expect(job.runAt.getTime() - Date.now()).toBeGreaterThan(1900);
  });

  it('fails jobs without a handler', async () => {
    const q = makeQueue();
    const failed = vi.fn();
    q.on('failed', failed);
    q.start();
    const job = await q.add('missing', null);
    await tick(20);
    expect(job.status).toBe('failed');
    expect(job.error).toMatch(/No handler/);
    expect(failed).toHaveBeenCalled();
  });

  it('getJob/getJobs/purge', async () => {
    const q = makeQueue();
    q.process('ok', async () => 1);
    q.process('bad', async () => { throw new Error('x'); });
    const a = await q.add('ok', null);
    await q.add('bad', null, { maxAttempts: 1 });
    const c = await q.add('ok', null, { delay: 100000 });
    q.start();
    await tick(50);
    expect(q.getJob(a.id)).toBe(a);
    expect(q.getJobs()).toHaveLength(3);
    expect(q.getJobs('failed')).toHaveLength(1);
    q.purge();
    expect(q.getJobs().map(j => j.id)).toEqual([c.id]);
  });

  it('stop() waits for active jobs', async () => {
    const q = makeQueue();
    q.process('slow', () => new Promise(r => setTimeout(() => r('done'), 250)));
    q.start();
    const job = await q.add('slow', null);
    await tick(10);
    let stopped = false;
    const p = q.stop().then(() => { stopped = true; });
    await tick(100);
    expect(stopped).toBe(false);
    await tick(300);
    await p;
    expect(stopped).toBe(true);
    expect(job.status).toBe('completed');
  });
});

describe('cancel', () => {
  it('cancels pending and delayed jobs so they never run', async () => {
    const q = makeQueue();
    const fn = vi.fn(async () => {});
    const cancelled = vi.fn();
    q.on('cancelled', cancelled);
    q.process('j', fn);
    const a = await q.add('j', null);
    const b = await q.add('j', null, { delay: 50 });
    expect(q.cancel(a.id)).toBe(true);
    expect(q.cancel(b.id)).toBe(true);
    q.start();
    await tick(200);
    expect(fn).not.toHaveBeenCalled();
    expect(a.status).toBe('cancelled');
    expect(b.status).toBe('cancelled');
    expect(cancelled).toHaveBeenCalledTimes(2);
    expect(q.getStats().cancelled).toBe(2);
  });

  it('cancels an active job: aborts signal, frees the slot, no retry/completed/failed', async () => {
    const q = makeQueue();
    let signal: AbortSignal | undefined;
    let rejectLater!: (e: Error) => void;
    q.process('long', (_job, ctx) => {
      signal = ctx?.signal;
      return new Promise((_r, rej) => { rejectLater = rej; });
    });
    const events = vi.fn();
    q.on('completed', events);
    q.on('failed', events);
    q.on('retry', events);
    const cancelled = vi.fn();
    q.on('cancelled', cancelled);
    q.start();
    const job = await q.add('long', null);
    await tick(10);
    expect(job.status).toBe('active');

    expect(q.cancel(job.id)).toBe(true);
    expect(job.status).toBe('cancelled');
    expect(signal?.aborted).toBe(true);
    expect(cancelled).toHaveBeenCalledWith(job);

    // Handler failing afterwards must not trigger a retry
    rejectLater(new Error('late'));
    await tick(500);
    expect(job.status).toBe('cancelled');
    expect(job.attempts).toBe(1);
    expect(events).not.toHaveBeenCalled();

    // Slot is free for the next job
    q.process('quick', async () => 'ok');
    const next = await q.add('quick', null);
    await tick(20);
    expect(next.status).toBe('completed');
  });

  it('returns false for unknown or finished jobs', async () => {
    const q = makeQueue();
    q.process('j', async () => 1);
    q.start();
    const job = await q.add('j', null);
    await tick(20);
    expect(q.cancel(job.id)).toBe(false);
    expect(q.cancel('nope')).toBe(false);
  });
});

describe('timeoutMs', () => {
  it('fails a hung attempt, retries, then fails for good', async () => {
    const q = makeQueue();
    const signals: AbortSignal[] = [];
    const retry = vi.fn();
    const failed = vi.fn();
    q.on('retry', retry);
    q.on('failed', failed);
    q.process('hang', (_job, ctx) => {
      signals.push(ctx!.signal);
      return new Promise(() => { /* never settles */ });
    });
    q.start();
    const job = await q.add('hang', null, { timeoutMs: 100, maxAttempts: 2 });
    await tick(10);
    expect(job.status).toBe('active');
    await tick(100);
    expect(job.status).toBe('delayed');
    expect(retry).toHaveBeenCalledTimes(1);
    expect(retry.mock.calls[0][1].name).toBe('JobTimeoutError');
    expect(signals[0].aborted).toBe(true);
    expect(q.getStats().active).toBe(0);

    await tick(300);
    expect(job.status).toBe('failed');
    expect(job.attempts).toBe(2);
    expect(job.error).toMatch(/timed out after 100ms/);
    expect(failed).toHaveBeenCalledTimes(1);
  });

  it('does not affect jobs that finish in time', async () => {
    const q = makeQueue();
    q.process('fast', () => new Promise(r => setTimeout(() => r('ok'), 50)));
    q.start();
    const job = await q.add('fast', null, { timeoutMs: 100 });
    await tick(200);
    expect(job.status).toBe('completed');
    expect(job.result).toBe('ok');
  });
});

describe('listener isolation', () => {
  it('a throwing completed listener does not cause a retry', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const q = makeQueue();
    const handler = vi.fn(async () => 'v');
    const retry = vi.fn();
    q.on('completed', () => { throw new Error('listener boom'); });
    q.on('retry', retry);
    q.process('j', handler);
    q.start();
    const job = await q.add('j', null);
    await tick(500);
    expect(job.status).toBe('completed');
    expect(handler).toHaveBeenCalledTimes(1);
    expect(retry).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalled();
  });

  it('async listeners that reject do not cause unhandled rejections', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const q = makeQueue();
      q.on('completed', async () => { throw new Error('async boom'); });
      q.on('failed', async () => { throw new Error('async boom 2'); });
      q.on('retry', async () => { throw new Error('async boom 3'); });
      q.process('ok', async () => 1);
      q.process('bad', async () => { throw new Error('x'); });
      q.start();
      await q.add('ok', null);
      const bad = await q.add('bad', null, { maxAttempts: 2 });
      await tick(500);
      expect(bad.status).toBe('failed');
      expect(bad.attempts).toBe(2);
      // Let any stray rejection surface
      vi.useRealTimers();
      await new Promise(r => setTimeout(r, 20));
      expect(unhandled).not.toHaveBeenCalled();
      expect(err.mock.calls.length).toBeGreaterThanOrEqual(3);
    } finally {
      process.off('unhandledRejection', unhandled);
      vi.useFakeTimers();
    }
  });

  it('throwing retry/failed listeners keep the retry flow intact', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const q = makeQueue();
    q.on('retry', () => { throw new Error('r'); });
    q.on('failed', () => { throw new Error('f'); });
    let calls = 0;
    q.process('j', async () => { calls++; throw new Error('x'); });
    q.start();
    const job = await q.add('j', null, { maxAttempts: 3 });
    await tick(1000);
    expect(calls).toBe(3);
    expect(job.status).toBe('failed');
  });

  it('a throwing failed listener for a handler-less job does not crash the poller', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const q = makeQueue();
    q.on('failed', () => { throw new Error('f'); });
    q.process('ok', async () => 1);
    q.start();
    const a = await q.add('missing', null);
    const b = await q.add('ok', null);
    await tick(50);
    expect(a.status).toBe('failed');
    expect(b.status).toBe('completed');
  });

  it('once() listeners still fire only once', async () => {
    const q = makeQueue();
    const fn = vi.fn();
    q.once('completed', fn);
    q.process('j', async () => 1);
    q.start();
    await q.addMany('j', [1, 2]);
    await tick(50);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('QueueStore', () => {
  it('InMemoryQueueStore keeps priority order and supports CRUD', () => {
    const s = new InMemoryQueueStore();
    const a = createJob('q', 'a', null);
    const b = createJob('q', 'b', null, { priority: 5 });
    s.add(a);
    s.add(b);
    expect(s.list().map(j => j.name)).toEqual(['b', 'a']);
    expect(s.get(a.id)).toBe(a);
    const copy = { ...a, status: 'completed' as const };
    s.update(copy);
    expect(s.get(a.id)!.status).toBe('completed');
    s.remove(b.id);
    expect(s.list()).toHaveLength(1);
    s.remove('nope');
    s.update(createJob('q', 'ghost', null));
    expect(s.list()).toHaveLength(1);
  });

  it('Queue uses a custom store', async () => {
    const jobs = new Map<string, Job>();
    const calls: string[] = [];
    const store: QueueStore = {
      add: (j) => { calls.push('add'); jobs.set(j.id, j); },
      get: (id) => jobs.get(id),
      update: (j) => { calls.push('update:' + j.status); jobs.set(j.id, j); },
      list: () => Array.from(jobs.values()),
      remove: (id) => { jobs.delete(id); }
    };
    const q = makeQueue({ store });
    q.process('j', async () => 'r');
    q.start();
    const job = await q.add('j', null);
    await tick(20);
    expect(jobs.get(job.id)!.status).toBe('completed');
    expect(calls).toEqual(['add', 'update:active', 'update:completed']);
    q.purge();
    expect(jobs.size).toBe(0);
  });
});
