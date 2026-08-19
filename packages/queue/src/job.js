"use strict";
/**
 * Job definitions and types for the queue system.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createJob = createJob;
const crypto_1 = require("crypto");
// ─── Factory ──────────────────────────────────────────────────────────────────
function createJob(queue, name, data, options = {}) {
    const now = new Date();
    const delay = options.delay || 0;
    return {
        id: (0, crypto_1.randomUUID)(),
        queue,
        name,
        data,
        status: delay > 0 ? 'delayed' : 'pending',
        attempts: 0,
        maxAttempts: options.maxAttempts ?? 3,
        delay,
        priority: options.priority ?? 0,
        createdAt: now,
        runAt: options.runAt || new Date(now.getTime() + delay)
    };
}
//# sourceMappingURL=job.js.map