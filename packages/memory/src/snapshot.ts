/**
 * Memory Snapshot Utility.
 * Takes a point-in-time picture of process memory.
 * Used to compare before and after cleanup.
 */

import { getHeapStatistics } from 'v8';
import { MemorySnapshot } from './types';

/**
 * Take a current memory snapshot.
 */
export function takeSnapshot(): MemorySnapshot {
  const mem = process.memoryUsage();

  const heapUsedMb  = parseFloat((mem.heapUsed  / 1024 / 1024).toFixed(2));
  const heapTotalMb = parseFloat((mem.heapTotal / 1024 / 1024).toFixed(2));
  const rssMb       = parseFloat((mem.rss       / 1024 / 1024).toFixed(2));

  const usagePercent = heapTotalMb > 0
    ? parseFloat(((mem.heapUsed / mem.heapTotal) * 100).toFixed(1))
    : 0;

  // heapTotal grows on demand, so heapUsed/heapTotal is not memory pressure;
  // compare against the V8 heap ceiling as well
  let heapLimit = 0;
  try {
    heapLimit = getHeapStatistics().heap_size_limit;
  } catch {
    heapLimit = 0;
  }
  const heapLimitMb = parseFloat((heapLimit / 1024 / 1024).toFixed(2));
  const heapLimitPercent = heapLimit > 0
    ? parseFloat(((mem.heapUsed / heapLimit) * 100).toFixed(1))
    : usagePercent;

  return {
    heapUsed:     mem.heapUsed,
    heapTotal:    mem.heapTotal,
    external:     mem.external,
    rss:          mem.rss,
    arrayBuffers: mem.arrayBuffers || 0,
    heapUsedMb,
    heapTotalMb,
    rssMb,
    usagePercent,
    heapLimit,
    heapLimitMb,
    heapLimitPercent,
    timestamp: new Date().toISOString()
  };
}

/**
 * Calculate difference between two snapshots.
 */
export function diffSnapshots(
  before: MemorySnapshot,
  after:  MemorySnapshot
): { freedBytes: number; freedMb: number; increased: boolean } {
  const freedBytes = before.heapUsed - after.heapUsed;
  const freedMb    = parseFloat((freedBytes / 1024 / 1024).toFixed(2));

  return {
    freedBytes,
    freedMb,
    increased: freedBytes < 0   // Memory went up — possible new allocation
  };
}

/**
 * Format bytes into human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (Math.abs(bytes) < 1024)        return `${bytes} B`;
  if (Math.abs(bytes) < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}