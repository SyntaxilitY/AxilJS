/**
 * @axil/memory — Public API
 * Memory management, leak detection, and optimization for @axilJS.
 */
export { MemoryMonitor } from './monitor';
export type { MemoryMonitorOptions } from './types';
export { MemoryOptimizer, optimizer } from './optimizer';
export type { OptimizationResult } from './optimizer';
export { detectAndFix, trackTimer, trackInterval, untrackTimer, untrackInterval, trackCache, trackEmitter } from './leak-detector';
export { takeSnapshot, diffSnapshots, formatBytes } from './snapshot';
export { triggerGC, triggerGCAsync, isGCAvailable, gcTip } from './gc';
export { memoryMiddleware } from './middleware';
export type { MemoryMiddlewareOptions } from './middleware';
export type { LeakRecord, LeakType, MemorySnapshot, MemoryReport } from './types';
//# sourceMappingURL=index.d.ts.map