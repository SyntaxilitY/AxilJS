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