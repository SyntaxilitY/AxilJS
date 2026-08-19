/**
 * Memory Snapshot Utility.
 * Takes a point-in-time picture of process memory.
 * Used to compare before and after cleanup.
 */
import { MemorySnapshot } from './types';
/**
 * Take a current memory snapshot.
 */
export declare function takeSnapshot(): MemorySnapshot;
/**
 * Calculate difference between two snapshots.
 */
export declare function diffSnapshots(before: MemorySnapshot, after: MemorySnapshot): {
    freedBytes: number;
    freedMb: number;
    increased: boolean;
};
/**
 * Format bytes into human-readable string.
 */
export declare function formatBytes(bytes: number): string;
//# sourceMappingURL=snapshot.d.ts.map