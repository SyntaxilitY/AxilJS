"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryMonitor = void 0;
const events_1 = require("events");
const snapshot_1 = require("./snapshot");
const leak_detector_1 = require("./leak-detector");
const optimizer_1 = require("./optimizer");
const gc_1 = require("./gc");
// ─── Colors ───────────────────────────────────────────────────────────────────
const C = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m',
    bold: '\x1b[1m'
};
// ─── Memory Monitor ───────────────────────────────────────────────────────────
class MemoryMonitor extends events_1.EventEmitter {
    options;
    timer;
    running = false;
    reports = [];
    maxReports = 100;
    constructor(options = {}) {
        super();
        this.options = {
            intervalMs: options.intervalMs ?? 30000,
            warnThresholdPercent: options.warnThresholdPercent ?? 70,
            criticalThresholdPercent: options.criticalThresholdPercent ?? 85,
            maxHeapMb: options.maxHeapMb ?? 512,
            autoFix: options.autoFix ?? true,
            verbose: options.verbose ?? false,
            onLeak: options.onLeak ?? (() => { }),
            onCritical: options.onCritical ?? (() => { })
        };
    }
    // ─── Lifecycle ───────────────────────────────────────────────────────────────
    /**
     * Start monitoring.
     * Runs an immediate scan then schedules recurring scans.
     */
    start() {
        if (this.running)
            return;
        this.running = true;
        console.log(`${C.cyan}[REstJS Memory]${C.reset} Monitor started ` +
            `${C.gray}(scan every ${this.options.intervalMs / 1000}s)${C.reset}`);
        // Immediate first scan
        this.scan();
        // Recurring scans
        this.timer = setInterval(() => this.scan(), this.options.intervalMs);
        // Prevent this interval from keeping Node.js alive if nothing else is running
        if (this.timer.unref) {
            this.timer.unref();
        }
    }
    /**
     * Stop monitoring.
     */
    stop() {
        if (!this.running)
            return;
        this.running = false;
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = undefined;
        }
        console.log(`${C.cyan}[REstJS Memory]${C.reset} Monitor stopped`);
    }
    // ─── Scan ─────────────────────────────────────────────────────────────────
    /**
     * Run a single memory scan.
     * Detects leaks, fixes them, and reports results.
     */
    async scan() {
        const scanStart = Date.now();
        const before = (0, snapshot_1.takeSnapshot)();
        // Detect and optionally fix leaks
        const leaks = await (0, leak_detector_1.detectAndFix)(this.options.autoFix);
        const fixedCount = leaks.filter(l => l.fixed).length;
        // Trigger GC after fixes
        await (0, gc_1.triggerGCAsync)();
        // Allow memory to settle
        await new Promise(r => setTimeout(r, 100));
        const after = (0, snapshot_1.takeSnapshot)();
        const diff = (0, snapshot_1.diffSnapshots)(before, after);
        const scanMs = Date.now() - scanStart;
        // Determine status
        let status = 'clean';
        if (after.usagePercent >= this.options.criticalThresholdPercent) {
            status = 'critical';
        }
        else if (leaks.length > 0 && fixedCount < leaks.length) {
            status = 'leaks-detected';
        }
        else if (leaks.length > 0) {
            status = 'leaks-fixed';
        }
        const report = {
            before,
            after,
            freedBytes: diff.freedBytes,
            freedMb: diff.freedMb,
            leaks,
            leakCount: leaks.length,
            fixedCount,
            scanMs,
            status
        };
        // Store report
        this.reports.push(report);
        if (this.reports.length > this.maxReports) {
            this.reports.shift();
        }
        // Log based on status
        this.logReport(report);
        // Emit events for external handlers
        this.emit('scan', report);
        if (leaks.length > 0) {
            this.options.onLeak(leaks);
            this.emit('leak', leaks);
        }
        if (status === 'critical') {
            this.options.onCritical(after);
            this.emit('critical', after);
            // Force optimization on critical memory
            await optimizer_1.optimizer.optimize();
        }
        return report;
    }
    // ─── Logging ─────────────────────────────────────────────────────────────
    logReport(report) {
        const { after, leaks, freedMb, status } = report;
        // Always log critical and leaks
        // Only log clean state if verbose mode is on
        if (status === 'clean' && !this.options.verbose)
            return;
        const statusColor = status === 'clean' ? C.green :
            status === 'leaks-fixed' ? C.green :
                status === 'leaks-detected' ? C.yellow :
                    C.red;
        const statusLabel = status === 'clean' ? '✓ Clean' :
            status === 'leaks-fixed' ? '✓ Leaks Fixed' :
                status === 'leaks-detected' ? '⚠ Leaks Found' :
                    '✗ Critical';
        console.log(`${C.cyan}[REstJS Memory]${C.reset} ` +
            `${statusColor}${statusLabel}${C.reset} ` +
            `${C.gray}heap: ${after.heapUsedMb}MB/${after.heapTotalMb}MB ` +
            `(${after.usagePercent}%)${C.reset}` +
            (freedMb > 0 ? ` ${C.green}freed: ${freedMb}MB${C.reset}` : ''));
        // Log each leak
        for (const leak of leaks) {
            const icon = leak.fixed ? `${C.green}✓${C.reset}` : `${C.yellow}⚠${C.reset}`;
            console.log(`  ${icon} ${leak.type}: ${C.gray}${leak.description}${C.reset}`);
        }
        // Critical warning
        if (status === 'critical') {
            console.log(`${C.red}${C.bold}[REstJS Memory] CRITICAL: ` +
                `${after.heapUsedMb}MB used — running emergency optimization${C.reset}`);
        }
    }
    // ─── Reports ─────────────────────────────────────────────────────────────
    /**
     * Get all stored scan reports.
     */
    getReports() {
        return [...this.reports];
    }
    /**
     * Get the latest scan report.
     */
    getLatestReport() {
        return this.reports[this.reports.length - 1] || null;
    }
    /**
     * Get current memory snapshot without running a full scan.
     */
    getCurrentSnapshot() {
        return (0, snapshot_1.takeSnapshot)();
    }
}
exports.MemoryMonitor = MemoryMonitor;
//# sourceMappingURL=monitor.js.map