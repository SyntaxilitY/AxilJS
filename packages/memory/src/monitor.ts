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

import { EventEmitter }                  from 'events';
import { MemoryMonitorOptions,
         MemoryReport, LeakRecord }       from './types';
import { takeSnapshot, diffSnapshots }   from './snapshot';
import { detectAndFix }                  from './leak-detector';
import { optimizer }                     from './optimizer';
import { triggerGCAsync }               from './gc';

// ─── Colors ───────────────────────────────────────────────────────────────────

const C = {
  reset:  '\x1b[0m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  cyan:   '\x1b[36m',
  gray:   '\x1b[90m',
  bold:   '\x1b[1m'
};

// ─── Memory Monitor ───────────────────────────────────────────────────────────

export class MemoryMonitor extends EventEmitter {
  private options:  Required<MemoryMonitorOptions>;
  private timer?:   ReturnType<typeof setInterval>;
  private running:  boolean = false;
  private reports:  MemoryReport[] = [];
  private maxReports = 100;

  constructor(options: MemoryMonitorOptions = {}) {
    super();

    this.options = {
      intervalMs:               options.intervalMs               ?? 30000,
      warnThresholdPercent:     options.warnThresholdPercent     ?? 70,
      criticalThresholdPercent: options.criticalThresholdPercent ?? 85,
      maxHeapMb:                options.maxHeapMb                ?? 512,
      autoFix:                  options.autoFix                  ?? true,
      verbose:                  options.verbose                  ?? false,
      onLeak:                   options.onLeak                   ?? (() => {}),
      onCritical:               options.onCritical               ?? (() => {})
    };
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────────

  /**
   * Start monitoring.
   * Runs an immediate scan then schedules recurring scans.
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    console.log(
      `${C.cyan}[@axilJS Memory]${C.reset} Monitor started ` +
      `${C.gray}(scan every ${this.options.intervalMs / 1000}s)${C.reset}`
    );

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
  stop(): void {
    if (!this.running) return;
    this.running = false;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    console.log(`${C.cyan}[@axilJS Memory]${C.reset} Monitor stopped`);
  }

  // ─── Scan ─────────────────────────────────────────────────────────────────

  /**
   * Run a single memory scan.
   * Detects leaks, fixes them, and reports results.
   */
  async scan(): Promise<MemoryReport> {
    const scanStart = Date.now();
    const before    = takeSnapshot();

    // Detect and optionally fix leaks
    const leaks   = await detectAndFix(this.options.autoFix);
    const fixedCount = leaks.filter(l => l.fixed).length;

    // Trigger GC after fixes
    await triggerGCAsync();

    // Allow memory to settle
    await new Promise(r => setTimeout(r, 100));

    const after  = takeSnapshot();
    const diff   = diffSnapshots(before, after);
    const scanMs = Date.now() - scanStart;

    // Determine status
    let status: MemoryReport['status'] = 'clean';

    if (after.usagePercent >= this.options.criticalThresholdPercent) {
      status = 'critical';
    } else if (leaks.length > 0 && fixedCount < leaks.length) {
      status = 'leaks-detected';
    } else if (leaks.length > 0) {
      status = 'leaks-fixed';
    }

    const report: MemoryReport = {
      before,
      after,
      freedBytes:  diff.freedBytes,
      freedMb:     diff.freedMb,
      leaks,
      leakCount:   leaks.length,
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
      await optimizer.optimize();
    }

    return report;
  }

  // ─── Logging ─────────────────────────────────────────────────────────────

  private logReport(report: MemoryReport): void {
    const { after, leaks, freedMb, status } = report;

    // Always log critical and leaks
    // Only log clean state if verbose mode is on
    if (status === 'clean' && !this.options.verbose) return;

    const statusColor =
      status === 'clean'          ? C.green  :
      status === 'leaks-fixed'    ? C.green  :
      status === 'leaks-detected' ? C.yellow :
      C.red;

    const statusLabel =
      status === 'clean'          ? '✓ Clean'         :
      status === 'leaks-fixed'    ? '✓ Leaks Fixed'   :
      status === 'leaks-detected' ? '⚠ Leaks Found'   :
      '✗ Critical';

    console.log(
      `${C.cyan}[@axilJS Memory]${C.reset} ` +
      `${statusColor}${statusLabel}${C.reset} ` +
      `${C.gray}heap: ${after.heapUsedMb}MB/${after.heapTotalMb}MB ` +
      `(${after.usagePercent}%)${C.reset}` +
      (freedMb > 0 ? ` ${C.green}freed: ${freedMb}MB${C.reset}` : '')
    );

    // Log each leak
    for (const leak of leaks) {
      const icon = leak.fixed ? `${C.green}✓${C.reset}` : `${C.yellow}⚠${C.reset}`;
      console.log(
        `  ${icon} ${leak.type}: ${C.gray}${leak.description}${C.reset}`
      );
    }

    // Critical warning
    if (status === 'critical') {
      console.log(
        `${C.red}${C.bold}[@axilJS Memory] CRITICAL: ` +
        `${after.heapUsedMb}MB used — running emergency optimization${C.reset}`
      );
    }
  }

  // ─── Reports ─────────────────────────────────────────────────────────────

  /**
   * Get all stored scan reports.
   */
  getReports(): MemoryReport[] {
    return [...this.reports];
  }

  /**
   * Get the latest scan report.
   */
  getLatestReport(): MemoryReport | null {
    return this.reports[this.reports.length - 1] || null;
  }

  /**
   * Get current memory snapshot without running a full scan.
   */
  getCurrentSnapshot() {
    return takeSnapshot();
  }
}