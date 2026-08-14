/**
 * Memory Management Types.
 * All types used across the memory package.
 */

// ─── Leak Types ───────────────────────────────────────────────────────────────

// Every type of memory leak REstJS can detect and fix
export type LeakType =
  | 'event-listener'    // Unremoved event listeners
  | 'timer'             // Uncleared setTimeout / setInterval
  | 'interval'          // Specifically setInterval leaks
  | 'promise'           // Dangling unresolved promises
  | 'large-string'      // Strings held in memory unnecessarily
  | 'circular-ref'      // Circular references preventing GC
  | 'cache-overflow'    // Caches that grew too large
  | 'stream-leak'       // Streams not properly closed
  | 'socket-leak';      // Sockets not properly closed

// ─── Leak Record ──────────────────────────────────────────────────────────────

export interface LeakRecord {
  // What type of leak was detected
  type: LeakType;

  // Human readable description
  description: string;

  // Estimated memory recovered in bytes
  recoveredBytes: number;

  // When the leak was detected
  detectedAt: string;

  // Was it automatically fixed
  fixed: boolean;

  // Source location if detectable
  source?: string;
}

// ─── Memory Snapshot ──────────────────────────────────────────────────────────

export interface MemorySnapshot {
  // Node.js process memory
  heapUsed:     number;   // bytes currently used
  heapTotal:    number;   // bytes allocated
  external:     number;   // C++ objects bound to JS
  rss:          number;   // Resident Set Size
  arrayBuffers: number;   // ArrayBuffer allocations

  // Derived metrics
  heapUsedMb:   number;
  heapTotalMb:  number;
  rssMb:        number;
  usagePercent: number;   // heapUsed / heapTotal * 100

  // When taken
  timestamp: string;
}

// ─── Memory Report ────────────────────────────────────────────────────────────

export interface MemoryReport {
  // Before cleanup
  before: MemorySnapshot;

  // After cleanup
  after: MemorySnapshot;

  // Memory freed
  freedBytes:  number;
  freedMb:     number;

  // Leaks found and fixed
  leaks:       LeakRecord[];
  leakCount:   number;
  fixedCount:  number;

  // Duration of scan
  scanMs:      number;

  // Overall status
  status: 'clean' | 'leaks-fixed' | 'leaks-detected' | 'critical';
}

// ─── Monitor Options ──────────────────────────────────────────────────────────

export interface MemoryMonitorOptions {
  // How often to run the monitor in ms (default: 30000)
  intervalMs?: number;

  // Heap usage % that triggers a warning (default: 70)
  warnThresholdPercent?: number;

  // Heap usage % that triggers critical alert (default: 85)
  criticalThresholdPercent?: number;

  // Max heap in MB before forcing GC (default: 512)
  maxHeapMb?: number;

  // Auto-fix leaks when detected (default: true)
  autoFix?: boolean;

  // Log every scan result (default: false — only logs issues)
  verbose?: boolean;

  // Called when a leak is detected
  onLeak?: (leaks: LeakRecord[]) => void;

  // Called when memory goes critical
  onCritical?: (snapshot: MemorySnapshot) => void;
}