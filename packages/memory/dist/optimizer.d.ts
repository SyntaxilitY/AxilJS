/**
 * Memory Optimizer.
 * Actively reduces memory footprint by cleaning up known waste sources.
 *
 * Optimizations:
 *   1. Trigger GC if available
 *   2. Clear require() module cache of unused modules
 *   3. Compact string buffers
 *   4. Release idle stream buffers
 *   5. Prune registered caches
 */
import { MemorySnapshot } from './types';
export interface OptimizationResult {
    before: MemorySnapshot;
    after: MemorySnapshot;
    freedBytes: number;
    freedMb: number;
    gcTriggered: boolean;
    actions: string[];
}
export declare class MemoryOptimizer {
    private actions;
    /**
     * Run all optimizations.
     * Returns a report showing before/after memory usage.
     */
    optimize(): Promise<OptimizationResult>;
    private step1_triggerGC;
    private step2_clearModuleCache;
    private step3_pruneCaches;
    private step4_clearConsoleHistory;
}
export declare const optimizer: MemoryOptimizer;
//# sourceMappingURL=optimizer.d.ts.map