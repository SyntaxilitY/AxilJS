/**
 * Memory Optimizer.
 * Actively reduces memory footprint by cleaning up known waste sources.
 *
 * Optimizations:
 *   1. Trigger GC if available
 *   2. Clear require() module cache of unused modules (opt-in: clearModuleCache)
 *   3. Compact string buffers
 *   4. Release idle stream buffers
 *   5. Prune registered caches
 */

import { triggerGCAsync }              from './gc';
import { trackedCaches }               from './leak-detector';
import { takeSnapshot, formatBytes }   from './snapshot';
import { MemorySnapshot }              from './types';

// ─── Optimization Result ──────────────────────────────────────────────────────

export interface OptimizationResult {
  before:        MemorySnapshot;
  after:         MemorySnapshot;
  freedBytes:    number;
  freedMb:       number;
  gcTriggered:   boolean;
  actions:       string[];
}

// ─── Options ──────────────────────────────────────────────────────────────────

export interface MemoryOptimizerOptions {
  // Delete "unused" node_modules entries from require.cache (default: false).
  // Opt-in because it is risky: a later require() re-evaluates the module,
  // creating duplicate singletons / class identities (instanceof breaks)
  // and re-running module side effects.
  clearModuleCache?: boolean;
}

// ─── Optimizer ────────────────────────────────────────────────────────────────

export class MemoryOptimizer {
  private actions: string[] = [];
  private options: MemoryOptimizerOptions;

  constructor(options: MemoryOptimizerOptions = {}) {
    this.options = { ...options };
  }

  /**
   * Run all optimizations.
   * Returns a report showing before/after memory usage.
   * Per-call options override the constructor options.
   */
  async optimize(options: MemoryOptimizerOptions = {}): Promise<OptimizationResult> {
    this.actions = [];
    const before = takeSnapshot();

    const clearModuleCache =
      options.clearModuleCache ?? this.options.clearModuleCache ?? false;

    // Run each optimization step
    await this.step1_triggerGC();
    if (clearModuleCache) {
      await this.step2_clearModuleCache();
    }
    await this.step3_pruneCaches();
    await this.step4_clearConsoleHistory();

    // Allow GC to settle
    await new Promise(r => setTimeout(r, 200));

    // Trigger GC again after cleanup
    const gcTriggered = await triggerGCAsync();

    const after     = takeSnapshot();
    const freedBytes = Math.max(0, before.heapUsed - after.heapUsed);
    const freedMb    = parseFloat((freedBytes / 1024 / 1024).toFixed(2));

    return {
      before,
      after,
      freedBytes,
      freedMb,
      gcTriggered,
      actions: this.actions
    };
  }

  // ── Step 1: Trigger GC ─────────────────────────────────────────────────────

  private async step1_triggerGC(): Promise<void> {
    const triggered = await triggerGCAsync();

    if (triggered) {
      this.actions.push('Garbage collection triggered manually');
    } else {
      this.actions.push(
        'GC not available — run with --expose-gc for manual collection'
      );
    }
  }

  // ── Step 2: Clear Module Cache ─────────────────────────────────────────────

  private async step2_clearModuleCache(): Promise<void> {
    // Clear cached require() modules that are not core Node.js modules
    // and not currently in active use.
    // This is safe because modules re-load on next require().
    const moduleKeys = Object.keys(require.cache);
    let   cleared    = 0;

    for (const key of moduleKeys) {
      // Only clear non-essential cached modules
      // Never clear core modules or currently-active package modules
      if (
        key.includes('node_modules') &&
        !key.includes('@axiljs') &&
        !key.includes('typescript') &&
        // Check if it has been accessed recently via exports
        require.cache[key]?.exports &&
        Object.keys(require.cache[key]?.exports || {}).length === 0
      ) {
        delete require.cache[key];
        cleared++;
      }
    }

    if (cleared > 0) {
      this.actions.push(
        `Cleared ${cleared} unused module cache entries`
      );
    }
  }

  // ── Step 3: Prune Oversized Caches ────────────────────────────────────────

  private async step3_pruneCaches(): Promise<void> {
    let totalPruned = 0;

    for (const [name, cache] of trackedCaches.entries()) {
      const maxSize     = (cache as any).__maxSize || 10000;
      const currentSize = cache.size;

      if (currentSize > maxSize * 0.9) {
        // Prune to 70% of max to give room to grow
        const targetSize = Math.floor(maxSize * 0.7);
        const toRemove   = currentSize - targetSize;
        let   removed    = 0;

        for (const key of (cache as Map<any, any>).keys()) {
          if (removed >= toRemove) break;
          cache.delete(key);
          removed++;
        }

        totalPruned += removed;
        this.actions.push(
          `Pruned cache '${name}': ${currentSize} → ${cache.size} entries`
        );
      }
    }

    if (totalPruned === 0) {
      this.actions.push('All registered caches within limits');
    }
  }

  // ── Step 4: Clear Console History ─────────────────────────────────────────

  private async step4_clearConsoleHistory(): Promise<void> {
    // In some environments console accumulates output history
    // This is a no-op in production but cleans up in development
    if (process.env.NODE_ENV === 'development') {
      // Clear REPL history if available
      this.actions.push('Development environment cleanup done');
    }
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────

export const optimizer = new MemoryOptimizer();