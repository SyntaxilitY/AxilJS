"use strict";
/**
 * @restjs/memory — Public API
 * Memory management, leak detection, and optimization for REstJS.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.memoryMiddleware = exports.gcTip = exports.isGCAvailable = exports.triggerGCAsync = exports.triggerGC = exports.formatBytes = exports.diffSnapshots = exports.takeSnapshot = exports.trackEmitter = exports.trackCache = exports.untrackInterval = exports.untrackTimer = exports.trackInterval = exports.trackTimer = exports.detectAndFix = exports.optimizer = exports.MemoryOptimizer = exports.MemoryMonitor = void 0;
// Monitor
var monitor_1 = require("./monitor");
Object.defineProperty(exports, "MemoryMonitor", { enumerable: true, get: function () { return monitor_1.MemoryMonitor; } });
// Optimizer
var optimizer_1 = require("./optimizer");
Object.defineProperty(exports, "MemoryOptimizer", { enumerable: true, get: function () { return optimizer_1.MemoryOptimizer; } });
Object.defineProperty(exports, "optimizer", { enumerable: true, get: function () { return optimizer_1.optimizer; } });
// Leak Detector
var leak_detector_1 = require("./leak-detector");
Object.defineProperty(exports, "detectAndFix", { enumerable: true, get: function () { return leak_detector_1.detectAndFix; } });
Object.defineProperty(exports, "trackTimer", { enumerable: true, get: function () { return leak_detector_1.trackTimer; } });
Object.defineProperty(exports, "trackInterval", { enumerable: true, get: function () { return leak_detector_1.trackInterval; } });
Object.defineProperty(exports, "untrackTimer", { enumerable: true, get: function () { return leak_detector_1.untrackTimer; } });
Object.defineProperty(exports, "untrackInterval", { enumerable: true, get: function () { return leak_detector_1.untrackInterval; } });
Object.defineProperty(exports, "trackCache", { enumerable: true, get: function () { return leak_detector_1.trackCache; } });
Object.defineProperty(exports, "trackEmitter", { enumerable: true, get: function () { return leak_detector_1.trackEmitter; } });
// Snapshot utilities
var snapshot_1 = require("./snapshot");
Object.defineProperty(exports, "takeSnapshot", { enumerable: true, get: function () { return snapshot_1.takeSnapshot; } });
Object.defineProperty(exports, "diffSnapshots", { enumerable: true, get: function () { return snapshot_1.diffSnapshots; } });
Object.defineProperty(exports, "formatBytes", { enumerable: true, get: function () { return snapshot_1.formatBytes; } });
// GC utilities
var gc_1 = require("./gc");
Object.defineProperty(exports, "triggerGC", { enumerable: true, get: function () { return gc_1.triggerGC; } });
Object.defineProperty(exports, "triggerGCAsync", { enumerable: true, get: function () { return gc_1.triggerGCAsync; } });
Object.defineProperty(exports, "isGCAvailable", { enumerable: true, get: function () { return gc_1.isGCAvailable; } });
Object.defineProperty(exports, "gcTip", { enumerable: true, get: function () { return gc_1.gcTip; } });
// Middleware
var middleware_1 = require("./middleware");
Object.defineProperty(exports, "memoryMiddleware", { enumerable: true, get: function () { return middleware_1.memoryMiddleware; } });
//# sourceMappingURL=index.js.map