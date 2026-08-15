/**
 * @axil/memory — Public API
 * Memory management, leak detection, and optimization for @axilJS.
 */

// Monitor
export { MemoryMonitor }        from './monitor';
export type { MemoryMonitorOptions } from './types';

// Optimizer
export { MemoryOptimizer, optimizer } from './optimizer';
export type { OptimizationResult }    from './optimizer';

// Leak Detector
export {
  detectAndFix,
  trackTimer,
  trackInterval,
  untrackTimer,
  untrackInterval,
  trackCache,
  trackEmitter
}                               from './leak-detector';

// Snapshot utilities
export { takeSnapshot, diffSnapshots, formatBytes } from './snapshot';

// GC utilities
export { triggerGC, triggerGCAsync, isGCAvailable, gcTip } from './gc';

// Middleware
export { memoryMiddleware }     from './middleware';
export type { MemoryMiddlewareOptions } from './middleware';

// Types
export type {
  LeakRecord,
  LeakType,
  MemorySnapshot,
  MemoryReport
}                               from './types';