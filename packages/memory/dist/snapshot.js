"use strict";
/**
 * Memory Snapshot Utility.
 * Takes a point-in-time picture of process memory.
 * Used to compare before and after cleanup.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.takeSnapshot = takeSnapshot;
exports.diffSnapshots = diffSnapshots;
exports.formatBytes = formatBytes;
const v8_1 = require("v8");
/**
 * Take a current memory snapshot.
 */
function takeSnapshot() {
    const mem = process.memoryUsage();
    const heapUsedMb = parseFloat((mem.heapUsed / 1024 / 1024).toFixed(2));
    const heapTotalMb = parseFloat((mem.heapTotal / 1024 / 1024).toFixed(2));
    const rssMb = parseFloat((mem.rss / 1024 / 1024).toFixed(2));
    const usagePercent = heapTotalMb > 0
        ? parseFloat(((mem.heapUsed / mem.heapTotal) * 100).toFixed(1))
        : 0;
    // heapTotal grows on demand, so heapUsed/heapTotal is not memory pressure;
    // compare against the V8 heap ceiling as well
    let heapLimit = 0;
    try {
        heapLimit = (0, v8_1.getHeapStatistics)().heap_size_limit;
    }
    catch {
        heapLimit = 0;
    }
    const heapLimitMb = parseFloat((heapLimit / 1024 / 1024).toFixed(2));
    const heapLimitPercent = heapLimit > 0
        ? parseFloat(((mem.heapUsed / heapLimit) * 100).toFixed(1))
        : usagePercent;
    return {
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        external: mem.external,
        rss: mem.rss,
        arrayBuffers: mem.arrayBuffers || 0,
        heapUsedMb,
        heapTotalMb,
        rssMb,
        usagePercent,
        heapLimit,
        heapLimitMb,
        heapLimitPercent,
        timestamp: new Date().toISOString()
    };
}
/**
 * Calculate difference between two snapshots.
 */
function diffSnapshots(before, after) {
    const freedBytes = before.heapUsed - after.heapUsed;
    const freedMb = parseFloat((freedBytes / 1024 / 1024).toFixed(2));
    return {
        freedBytes,
        freedMb,
        increased: freedBytes < 0 // Memory went up — possible new allocation
    };
}
/**
 * Format bytes into human-readable string.
 */
function formatBytes(bytes) {
    if (Math.abs(bytes) < 1024)
        return `${bytes} B`;
    if (Math.abs(bytes) < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
//# sourceMappingURL=snapshot.js.map