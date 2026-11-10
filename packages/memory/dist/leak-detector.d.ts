/**
 * Memory Leak Detector.
 * Detects and automatically fixes the most common memory leaks in Node.js.
 *
 * Detects:
 *   1. Unremoved event listeners (EventEmitter listener accumulation)
 *   2. Uncleared timers (setTimeout / setInterval handles)
 *   3. Cache overflow (Maps/Sets that grew too large)
 *   4. Large string accumulation
 *   5. Abandoned streams
 */
import { EventEmitter } from 'events';
import { LeakRecord } from './types';
declare const trackedTimers: Set<ReturnType<typeof setTimeout>>;
declare const trackedIntervals: Set<ReturnType<typeof setInterval>>;
declare const trackedCaches: Map<string, Map<any, any> | Set<any>>;
declare const trackedEmitters: Set<WeakRef<EventEmitter>>;
/**
 * Register a timer for automatic cleanup tracking.
 * Use this instead of raw setTimeout to enable leak detection.
 *
 * Usage:
 *   const timer = trackTimer(setTimeout(() => doWork(), 5000))
 *   // AxilJS now knows about this timer and can clean it up
 */
export declare function trackTimer(timer: ReturnType<typeof setTimeout>): ReturnType<typeof setTimeout>;
/**
 * Register an interval for automatic cleanup tracking.
 */
export declare function trackInterval(interval: ReturnType<typeof setInterval>): ReturnType<typeof setInterval>;
/**
 * Unregister a timer (called after manual clearTimeout).
 */
export declare function untrackTimer(timer: ReturnType<typeof setTimeout>): void;
/**
 * Unregister an interval (called after manual clearInterval).
 */
export declare function untrackInterval(interval: ReturnType<typeof setInterval>): void;
/**
 * Register a Map or Set cache for overflow monitoring.
 * If the cache grows beyond maxSize, older entries are pruned automatically.
 *
 * Usage:
 *   const cache = trackCache('session-cache', new Map(), 1000)
 */
export declare function trackCache<T extends Map<any, any> | Set<any>>(name: string, cache: T, maxSize?: number): T;
/**
 * Register an EventEmitter for listener leak detection.
 * Node.js warns at 10 listeners — AxilJS monitors and alerts.
 *
 * Usage:
 *   trackEmitter(myEmitter, 'MyService')
 */
export declare function trackEmitter(emitter: EventEmitter, name?: string): EventEmitter;
/**
 * Run a full leak detection scan.
 * Returns all leaks found and whether they were fixed.
 */
export declare function detectAndFix(autoFix?: boolean): Promise<LeakRecord[]>;
export { trackedTimers, trackedIntervals, trackedCaches, trackedEmitters };
//# sourceMappingURL=leak-detector.d.ts.map