/**
 * Memory Management Types.
 * All types used across the memory package.
 */
export type LeakType = 'event-listener' | 'timer' | 'interval' | 'promise' | 'large-string' | 'circular-ref' | 'cache-overflow' | 'stream-leak' | 'socket-leak';
export interface LeakRecord {
    type: LeakType;
    description: string;
    recoveredBytes: number;
    detectedAt: string;
    fixed: boolean;
    source?: string;
}
export interface MemorySnapshot {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
    arrayBuffers: number;
    heapUsedMb: number;
    heapTotalMb: number;
    rssMb: number;
    usagePercent: number;
    timestamp: string;
}
export interface MemoryReport {
    before: MemorySnapshot;
    after: MemorySnapshot;
    freedBytes: number;
    freedMb: number;
    leaks: LeakRecord[];
    leakCount: number;
    fixedCount: number;
    scanMs: number;
    status: 'clean' | 'leaks-fixed' | 'leaks-detected' | 'critical';
}
export interface MemoryMonitorOptions {
    intervalMs?: number;
    warnThresholdPercent?: number;
    criticalThresholdPercent?: number;
    maxHeapMb?: number;
    autoFix?: boolean;
    verbose?: boolean;
    onLeak?: (leaks: LeakRecord[]) => void;
    onCritical?: (snapshot: MemorySnapshot) => void;
}
//# sourceMappingURL=types.d.ts.map