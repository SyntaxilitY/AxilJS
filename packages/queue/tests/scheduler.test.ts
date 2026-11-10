import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Scheduler, parseCron, matchesCron } from '../src/scheduler';

let schedulers: Scheduler[] = [];
function makeScheduler(): Scheduler {
  const s = new Scheduler();
  schedulers.push(s);
  return s;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  for (const s of schedulers) s.stop();
  schedulers = [];
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// Local-time helper (the scheduler evaluates local time)
const at = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) => new Date(y, mo - 1, d, h, mi, s);

describe('parseCron', () => {
  it('parses wildcards, ranges, lists and steps', () => {
    const c = parseCron('*/15 9-11 1,15 * 1-5');
    expect(c.minutes).toEqual([0, 15, 30, 45]);
    expect(c.hours).toEqual([9, 10, 11]);
    expect(c.days).toEqual([1, 15]);
    expect(c.months).toHaveLength(12);
    expect(c.weekdays).toEqual([1, 2, 3, 4, 5]);
  });

  it('supports range steps, start/step and lists of steps', () => {
    expect(parseCron('0-30/10 * * * *').minutes).toEqual([0, 10, 20, 30]);
    expect(parseCron('5/20 * * * *').minutes).toEqual([5, 25, 45]);
    expect(parseCron('1,*/30 * * * *').minutes).toEqual([0, 1, 30]);
  });

  it('treats 7 as Sunday', () => {
    expect(parseCron('0 0 * * 7').weekdays).toEqual([0]);
    expect(parseCron('0 0 * * 0,7').weekdays).toEqual([0]);
  });

  it('rejects malformed expressions', () => {
    expect(() => parseCron('* * * *')).toThrow(/exactly 5 fields/);
    expect(() => parseCron('*/0 * * * *')).toThrow(/step/);
    expect(() => parseCron('x * * * *')).toThrow();
  });
});

describe('matchesCron day-of-month / day-of-week semantics', () => {
  // 2026-11-06 is a Friday, 2026-11-10 a Tuesday, 2026-12-13 a Sunday
  it('ORs DOM and DOW when both are restricted', () => {
    const c = parseCron('0 0 13 * 5');
    expect(matchesCron(at(2026, 11, 6), c)).toBe(true);   // Friday, not 13th
    expect(matchesCron(at(2026, 12, 13), c)).toBe(true);  // 13th, not Friday
    expect(matchesCron(at(2026, 11, 13), c)).toBe(true);  // Friday 13th
    expect(matchesCron(at(2026, 11, 10), c)).toBe(false); // neither
  });

  it('ANDs when only one of them is restricted', () => {
    const dowOnly = parseCron('0 0 * * 5');
    expect(matchesCron(at(2026, 11, 6), dowOnly)).toBe(true);
    expect(matchesCron(at(2026, 12, 13), dowOnly)).toBe(false);
    const domOnly = parseCron('0 0 13 * *');
    expect(matchesCron(at(2026, 12, 13), domOnly)).toBe(true);
    expect(matchesCron(at(2026, 11, 6), domOnly)).toBe(false);
  });

  it('treats a starred step (*/n) as unrestricted', () => {
    const c = parseCron('0 0 */2 * 5');
    // Friday 2026-11-06: day 6 is not in */2 starting at 1 (1,3,5,...) → AND fails
    expect(matchesCron(at(2026, 11, 6), c)).toBe(false);
    // Friday 2026-11-13: day 13 is odd → matches
    expect(matchesCron(at(2026, 11, 13), c)).toBe(true);
  });

  it('checks minute, hour and month', () => {
    const c = parseCron('30 9 * 11 *');
    expect(matchesCron(at(2026, 11, 10, 9, 30), c)).toBe(true);
    expect(matchesCron(at(2026, 11, 10, 9, 31), c)).toBe(false);
    expect(matchesCron(at(2026, 11, 10, 10, 30), c)).toBe(false);
    expect(matchesCron(at(2026, 10, 10, 9, 30), c)).toBe(false);
  });
});

describe('Scheduler', () => {
  it('ticks exactly on minute boundaries without drift', async () => {
    vi.setSystemTime(at(2026, 11, 10, 8, 59, 30));
    const s = makeScheduler();
    const times: number[] = [];
    const nine = vi.fn();
    s.schedule('every-minute', '* * * * *', () => { times.push(Date.now()); });
    s.schedule('nine', '0 9 * * *', nine);
    s.start();

    await vi.advanceTimersByTimeAsync(29_999);
    expect(times).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(times).toHaveLength(1);
    expect(nine).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(120 * 60_000);
    expect(times).toHaveLength(121);
    expect(times.every(t => t % 60_000 === 0)).toBe(true);
    expect(nine).toHaveBeenCalledTimes(1);
    // Only a single pending timer is ever armed (no setInterval)
    expect(vi.getTimerCount()).toBe(1);
  });

  it('does not double-fire when a timer fires slightly early', async () => {
    vi.setSystemTime(at(2026, 11, 10, 8, 59, 59));
    const s = makeScheduler();
    const fn = vi.fn();
    s.schedule('m', '* * * * *', fn);
    // Simulate an early wake-up: clock lags 5ms behind the timer
    const realNow = Date.now;
    let skew = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => realNow() - skew);
    s.start();
    skew = 5;
    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(1);
    // The early wake-up must not re-arm for the minute that just ran
    await vi.advanceTimersByTimeAsync(1000);
    expect(fn).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('stop() cancels pending ticks and start() resumes', async () => {
    vi.setSystemTime(at(2026, 11, 10, 9, 0, 30));
    const s = makeScheduler();
    const fn = vi.fn();
    s.schedule('m', '* * * * *', fn);
    s.start();
    s.start(); // idempotent
    await vi.advanceTimersByTimeAsync(30_000);
    expect(fn).toHaveBeenCalledTimes(1);
    s.stop();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(180_000);
    expect(fn).toHaveBeenCalledTimes(1);
    s.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('setEnabled(false) skips a task', async () => {
    vi.setSystemTime(at(2026, 11, 10, 9, 0, 0));
    const s = makeScheduler();
    const fn = vi.fn();
    s.schedule('m', '* * * * *', fn);
    s.setEnabled('m', false);
    s.start();
    await vi.advanceTimersByTimeAsync(180_000);
    expect(fn).not.toHaveBeenCalled();
  });

  it('emits completed/failed and tracks runCount/lastRunAt', async () => {
    vi.setSystemTime(at(2026, 11, 10, 9, 0, 0));
    const s = makeScheduler();
    const completed = vi.fn();
    const failed = vi.fn();
    s.on('completed', completed);
    s.on('failed', failed);
    s.schedule('ok', '* * * * *', async () => {});
    s.schedule('bad', '* * * * *', async () => { throw new Error('nope'); });
    s.start();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(completed).toHaveBeenCalledWith('ok', expect.any(Number));
    expect(failed.mock.calls[0][0]).toBe('bad');
    expect(failed.mock.calls[0][1].message).toBe('nope');
    const ok = s.getTasks().find(t => t.name === 'ok')!;
    expect(ok.runCount).toBe(1);
    expect(ok.lastRunAt).toBeInstanceOf(Date);
    expect((ok as any).parsed).toBeUndefined();
  });

  it('runNow runs immediately and rejects unknown names', async () => {
    const s = makeScheduler();
    const fn = vi.fn();
    s.schedule('x', '0 0 1 1 *', fn);
    await s.runNow('x');
    expect(fn).toHaveBeenCalledTimes(1);
    await expect(s.runNow('nope')).rejects.toThrow(/not found/);
  });

  it('schedule() validates the expression', () => {
    const s = makeScheduler();
    expect(() => s.schedule('bad', '* *', () => {})).toThrow();
  });
});
