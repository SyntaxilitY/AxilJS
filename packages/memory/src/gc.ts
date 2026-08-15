/**
 * Garbage Collection Utilities.
 * Triggers Node.js GC programmatically and safely.
 *
 * Node.js exposes global.gc() ONLY when started with --expose-gc flag.
 * @axiljsJS handles both cases gracefully.
 */

/**
 * Check if manual GC is available.
 */
export function isGCAvailable(): boolean {
  return typeof (global as any).gc === 'function';
}

/**
 * Trigger garbage collection if available.
 * Returns true if GC was triggered, false if not available.
 *
 * To enable: node --expose-gc dist/server.js
 * Or in package.json: "start": "node --expose-gc dist/server.js"
 */
export function triggerGC(): boolean {
  if (!isGCAvailable()) {
    return false;
  }

  try {
    (global as any).gc();
    return true;
  } catch {
    return false;
  }
}

/**
 * Force GC and wait for it to complete.
 * The 100ms delay allows GC to fully finish before measuring.
 */
export async function triggerGCAsync(): Promise<boolean> {
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
export function gcTip(): string {
  return isGCAvailable()
    ? 'GC available — manual collection enabled'
    : 'Tip: Start with --expose-gc flag for manual GC support\n' +
      '  node --expose-gc dist/server.js';
}