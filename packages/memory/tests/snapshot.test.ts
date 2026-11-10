import { describe, it, expect } from 'vitest';
import { getHeapStatistics } from 'v8';
import { takeSnapshot, diffSnapshots, formatBytes } from '../src/snapshot';
import { MemorySnapshot } from '../src/types';

function fake(heapUsed: number): MemorySnapshot {
  return {
    heapUsed, heapTotal: heapUsed * 2, external: 0, rss: 0, arrayBuffers: 0,
    heapUsedMb: heapUsed / 1048576, heapTotalMb: 0, rssMb: 0, usagePercent: 50,
    timestamp: new Date().toISOString()
  };
}

describe('snapshot', () => {
  it('takes a consistent snapshot', () => {
    const s = takeSnapshot();
    expect(s.heapUsed).toBeGreaterThan(0);
    expect(s.heapTotal).toBeGreaterThanOrEqual(s.heapUsed);
    expect(s.heapUsedMb).toBeCloseTo(s.heapUsed / 1024 / 1024, 1);
    expect(s.usagePercent).toBeGreaterThan(0);
    expect(s.usagePercent).toBeLessThanOrEqual(100);
    expect(new Date(s.timestamp).toString()).not.toBe('Invalid Date');
  });

  it('reports usage against the V8 heap limit', () => {
    const s = takeSnapshot();
    expect(s.heapLimit).toBe(getHeapStatistics().heap_size_limit);
    expect(s.heapLimitMb).toBeCloseTo(s.heapLimit! / 1024 / 1024, 1);
    expect(s.heapLimitPercent).toBeCloseTo((s.heapUsed / s.heapLimit!) * 100, 0);
    // The limit is far above the current heap, so this is the smaller number
    expect(s.heapLimitPercent!).toBeLessThan(s.usagePercent);
  });

  it('diffs snapshots', () => {
    expect(diffSnapshots(fake(3 * 1048576), fake(1048576))).toEqual({ freedBytes: 2 * 1048576, freedMb: 2, increased: false });
    expect(diffSnapshots(fake(1048576), fake(1.5 * 1048576))).toEqual({ freedBytes: -0.5 * 1048576, freedMb: -0.5, increased: true });
  });

  it('formats bytes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1048576)).toBe('5.00 MB');
    expect(formatBytes(-2048)).toBe('-2.0 KB');
  });
});
