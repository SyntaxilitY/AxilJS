/**
 * Garbage Collection Utilities.
 * Triggers Node.js GC programmatically and safely.
 *
 * Node.js exposes global.gc() ONLY when started with --expose-gc flag.
 * REstJS handles both cases gracefully.
 */
/**
 * Check if manual GC is available.
 */
export declare function isGCAvailable(): boolean;
/**
 * Trigger garbage collection if available.
 * Returns true if GC was triggered, false if not available.
 *
 * To enable: node --expose-gc dist/server.js
 * Or in package.json: "start": "node --expose-gc dist/server.js"
 */
export declare function triggerGC(): boolean;
/**
 * Force GC and wait for it to complete.
 * The 100ms delay allows GC to fully finish before measuring.
 */
export declare function triggerGCAsync(): Promise<boolean>;
/**
 * Suggest GC tip to the developer if --expose-gc is not set.
 */
export declare function gcTip(): string;
//# sourceMappingURL=gc.d.ts.map