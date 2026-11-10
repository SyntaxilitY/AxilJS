/**
 * Memory Monitor.
 * Runs continuously in the background every 30 seconds.
 * Detects leaks, runs optimizations, and alerts when memory is critical.
 *
 * Usage:
 *   const monitor = new MemoryMonitor()
 *   monitor.start()
 *   monitor.stop()
 */
import { EventEmitter } from 'events';
import { MemoryMonitorOptions, MemoryReport } from './types';
export declare class MemoryMonitor extends EventEmitter {
    private options;
    private timer?;
    private running;
    private reports;
    private maxReports;
    private maxHeapMb?;
    constructor(options?: MemoryMonitorOptions);
    /**
     * Start monitoring.
     * Runs an immediate scan then schedules recurring scans.
     */
    start(): void;
    /**
     * Stop monitoring.
     */
    stop(): void;
    /**
     * Run a single memory scan.
     * Detects leaks, fixes them, and reports results.
     */
    scan(): Promise<MemoryReport>;
    private logReport;
    /**
     * Get all stored scan reports.
     */
    getReports(): MemoryReport[];
    /**
     * Get the latest scan report.
     */
    getLatestReport(): MemoryReport | null;
    /**
     * Get current memory snapshot without running a full scan.
     */
    getCurrentSnapshot(): import("./types").MemorySnapshot;
}
//# sourceMappingURL=monitor.d.ts.map