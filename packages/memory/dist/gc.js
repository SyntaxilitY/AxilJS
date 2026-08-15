"use strict";
/**
 * Garbage Collection Utilities.
 * Triggers Node.js GC programmatically and safely.
 *
 * Node.js exposes global.gc() ONLY when started with --expose-gc flag.
 * @axilJS handles both cases gracefully.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isGCAvailable = isGCAvailable;
exports.triggerGC = triggerGC;
exports.triggerGCAsync = triggerGCAsync;
exports.gcTip = gcTip;
/**
 * Check if manual GC is available.
 */
function isGCAvailable() {
    return typeof global.gc === 'function';
}
/**
 * Trigger garbage collection if available.
 * Returns true if GC was triggered, false if not available.
 *
 * To enable: node --expose-gc dist/server.js
 * Or in package.json: "start": "node --expose-gc dist/server.js"
 */
function triggerGC() {
    if (!isGCAvailable()) {
        return false;
    }
    try {
        global.gc();
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Force GC and wait for it to complete.
 * The 100ms delay allows GC to fully finish before measuring.
 */
async function triggerGCAsync() {
    const triggered = triggerGC();
    if (triggered) {
        // Give GC time to finish sweeping
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    return triggered;
}
/**
 * Suggest GC tip to the developer if --expose-gc is not set.
 */
function gcTip() {
    return isGCAvailable()
        ? 'GC available — manual collection enabled'
        : 'Tip: Start with --expose-gc flag for manual GC support\n' +
            '  node --expose-gc dist/server.js';
}
//# sourceMappingURL=gc.js.map