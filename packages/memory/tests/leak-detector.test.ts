import { describe, it, expect, afterEach } from 'vitest';
import { EventEmitter } from 'events';
import {
  detectAndFix, trackTimer, trackInterval, untrackTimer, untrackInterval,
  trackCache, trackEmitter, trackedTimers, trackedIntervals, trackedCaches, trackedEmitters
} from '../src/leak-detector';

const timers: Array<ReturnType<typeof setTimeout>> = [];
const intervals: Array<ReturnType<typeof setInterval>> = [];

afterEach(() => {
  timers.splice(0).forEach(t => { clearTimeout(t); untrackTimer(t); });
  intervals.splice(0).forEach(t => { clearInterval(t); untrackInterval(t); });
  trackedTimers.clear();
  trackedIntervals.clear();
  trackedCaches.clear();
  trackedEmitters.clear();
});

describe('leak detector registries', () => {
  it('tracks and untracks timers and intervals', () => {
    const t = trackTimer(setTimeout(() => {}, 60000));
    const i = trackInterval(setInterval(() => {}, 60000));
    timers.push(t);
    intervals.push(i);
    expect(trackedTimers.has(t)).toBe(true);
    expect(trackedIntervals.has(i)).toBe(true);

    untrackTimer(t);
    untrackInterval(i);
    expect(trackedTimers.size).toBe(0);
    expect(trackedIntervals.size).toBe(0);
  });

  it('flags excessive live timers and intervals, ignoring cleared ones', async () => {
    for (let n = 0; n < 105; n++) timers.push(trackTimer(setTimeout(() => {}, 60000)));
    for (let n = 0; n < 55; n++) intervals.push(trackInterval(setInterval(() => {}, 60000)));

    let leaks = await detectAndFix(false);
    expect(leaks.find(l => l.type === 'timer')!.description).toMatch(/^105 tracked timers active\. 5 may be orphaned/);
    expect(leaks.find(l => l.type === 'interval')!.description).toMatch(/^55 tracked intervals/);

    // Cleared without untrack -> pruned from the registry, no false positive
    timers.forEach(t => clearTimeout(t));
    intervals.forEach(t => clearInterval(t));
    leaks = await detectAndFix(false);
    expect(leaks.some(l => l.type === 'timer' || l.type === 'interval')).toBe(false);
    expect(trackedTimers.size).toBe(0);
    expect(trackedIntervals.size).toBe(0);
  });

  it('reports cache overflow and prunes oldest entries only with autoFix', async () => {
    const cache = trackCache('sessions', new Map<number, number>(), 5);
    expect(trackedCaches.get('sessions')).toBe(cache);
    for (let n = 0; n < 8; n++) cache.set(n, n);

    let leaks = (await detectAndFix(false)).filter(l => l.type === 'cache-overflow');
    expect(leaks).toHaveLength(1);
    expect(leaks[0]).toMatchObject({ fixed: false, source: 'cache:sessions' });
    expect(cache.size).toBe(8);

    leaks = (await detectAndFix(true)).filter(l => l.type === 'cache-overflow');
    expect(leaks[0]).toMatchObject({ fixed: true, recoveredBytes: 3 * 500 });
    expect([...cache.keys()]).toEqual([3, 4, 5, 6, 7]);

    const set = trackCache('ids', new Set(['a', 'b', 'c']), 2);
    await detectAndFix(true);
    expect([...set]).toEqual(['b', 'c']);
  });

  it('flags emitters above their max listeners, but not unlimited ones', async () => {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(2);
    trackEmitter(emitter, 'bus');
    for (let n = 0; n < 4; n++) emitter.on('tick', () => {});

    const unlimited = new EventEmitter();
    unlimited.setMaxListeners(0);
    trackEmitter(unlimited, 'free');
    for (let n = 0; n < 20; n++) unlimited.on('tick', () => {});

    const leaks = (await detectAndFix()).filter(l => l.source?.startsWith('bus') || l.source?.startsWith('free'));
    expect(leaks).toHaveLength(1);
    expect(leaks[0]).toMatchObject({ source: 'bus.tick', fixed: false, recoveredBytes: 400 });
    expect(leaks[0].description).toMatch(/'bus' has 4 listeners on 'tick' \(max: 2\)/);
  });

  it('flags large global objects', async () => {
    (global as any).__axilBigGlobal = { blob: 'x'.repeat(20000) };
    try {
      const leaks = await detectAndFix();
      expect(leaks.some(l => l.source === 'global.__axilBigGlobal')).toBe(true);
    } finally {
      delete (global as any).__axilBigGlobal;
    }
  });
});
