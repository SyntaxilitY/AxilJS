import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemorySnapshot } from '../src/types';

// Feed the monitor fake memory readings
const state = vi.hoisted(() => ({ next: null as any }));

vi.mock('../src/snapshot', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    takeSnapshot: () => state.next ?? actual.takeSnapshot()
  };
});

vi.mock('../src/optimizer', () => ({
  optimizer: { optimize: vi.fn(async () => ({ actions: [] })) }
}));

import { MemoryMonitor } from '../src/monitor';
import { optimizer } from '../src/optimizer';
import { trackCache, trackedCaches } from '../src/leak-detector';

function snapshot(p: Partial<MemorySnapshot>): MemorySnapshot {
  return {
    heapUsed: 50 * 1048576, heapTotal: 55 * 1048576, external: 0, rss: 100 * 1048576, arrayBuffers: 0,
    heapUsedMb: 50, heapTotalMb: 55, rssMb: 100, usagePercent: 91,
    heapLimit: 4096 * 1048576, heapLimitMb: 4096, heapLimitPercent: 1.2,
    timestamp: new Date().toISOString(),
    ...p
  };
}

describe('MemoryMonitor', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    (optimizer.optimize as any).mockClear();
  });

  afterEach(() => {
    state.next = null;
    trackedCaches.clear();
    vi.restoreAllMocks();
  });

  it('is clean when heapUsed/heapTotal is high but the heap limit is far away', async () => {
    state.next = snapshot({ usagePercent: 95, heapLimitPercent: 2 });
    const monitor = new MemoryMonitor();
    const critical = vi.fn();
    monitor.on('critical', critical);

    const report = await monitor.scan();
    expect(report.status).toBe('clean');
    expect(critical).not.toHaveBeenCalled();
    expect(optimizer.optimize).not.toHaveBeenCalled();
  });

  it('goes critical against the heap limit: emits, calls onCritical and optimizes', async () => {
    state.next = snapshot({ heapLimitPercent: 90 });
    const onCritical = vi.fn();
    const monitor = new MemoryMonitor({ onCritical, criticalThresholdPercent: 85 });
    const events: string[] = [];
    monitor.on('scan', () => events.push('scan'));
    monitor.on('critical', () => events.push('critical'));
    monitor.on('warning', () => events.push('warning'));

    const report = await monitor.scan();
    expect(report.status).toBe('critical');
    expect(onCritical).toHaveBeenCalledWith(state.next);
    expect(events).toEqual(['scan', 'critical']);
    expect(optimizer.optimize).toHaveBeenCalledTimes(1);
  });

  it('emits warning between the warn and critical thresholds', async () => {
    state.next = snapshot({ heapLimitPercent: 75 });
    const monitor = new MemoryMonitor({ warnThresholdPercent: 70, criticalThresholdPercent: 85 });
    const warning = vi.fn();
    monitor.on('warning', warning);

    const report = await monitor.scan();
    expect(report.status).toBe('clean');
    expect(warning).toHaveBeenCalledTimes(1);
  });

  it('falls back to usagePercent for snapshots without heapLimitPercent', async () => {
    state.next = snapshot({ usagePercent: 99, heapLimitPercent: undefined });
    expect((await new MemoryMonitor().scan()).status).toBe('critical');
  });

  it('honors maxHeapMb only when set', async () => {
    state.next = snapshot({ heapUsedMb: 700, heapLimitPercent: 10 });
    expect((await new MemoryMonitor().scan()).status).toBe('clean');

    const capped = new MemoryMonitor({ maxHeapMb: 512 });
    const critical = vi.fn();
    capped.on('critical', critical);
    expect((await capped.scan()).status).toBe('critical');
    expect(critical).toHaveBeenCalledTimes(1);
  });

  it('reports leaks via onLeak and the leak event', async () => {
    state.next = snapshot({});
    const cache = trackCache('monitor-test', new Map<number, number>(), 2);
    for (let n = 0; n < 5; n++) cache.set(n, n);

    const onLeak = vi.fn();
    const monitor = new MemoryMonitor({ onLeak });
    const leakEvent = vi.fn();
    monitor.on('leak', leakEvent);

    const report = await monitor.scan();
    const cacheLeaks = report.leaks.filter(l => l.type === 'cache-overflow');
    expect(cacheLeaks).toHaveLength(1);
    expect(cacheLeaks[0].fixed).toBe(true);
    expect(cache.size).toBe(2);
    expect(onLeak).toHaveBeenCalledWith(report.leaks);
    expect(leakEvent).toHaveBeenCalledWith(report.leaks);
    expect(monitor.getLatestReport()).toBe(report);
    expect(monitor.getReports()).toHaveLength(1);
  });

  it('start() scans immediately and stop() clears the interval', async () => {
    state.next = snapshot({});
    const monitor = new MemoryMonitor({ intervalMs: 60000 });
    const scanned = new Promise(resolve => monitor.once('scan', resolve));

    monitor.start();
    monitor.start(); // idempotent
    await scanned;
    expect(monitor.getReports()).toHaveLength(1);

    monitor.stop();
    expect((monitor as any).timer).toBeUndefined();
    monitor.stop(); // idempotent
  });

  it('getCurrentSnapshot returns a snapshot', () => {
    state.next = snapshot({ heapUsedMb: 12 });
    expect(new MemoryMonitor().getCurrentSnapshot().heapUsedMb).toBe(12);
  });
});
