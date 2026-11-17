"use strict";
/**
 * @axiljs/events - Public API
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLUSTER_EVENTS_VERSION = exports.CLUSTER_EVENTS_TAG = exports.nodeClusterHost = exports.processChannel = exports.isClusterEventEnvelope = exports.installClusterEventRelay = exports.ClusterTransport = exports.createLinkedTransports = exports.InMemoryTransport = exports.registerEventHandlers = exports.OnEvent = exports.assertJsonSafe = exports.setGlobalEventBus = exports.getGlobalEventBus = exports.EventBus = void 0;
var event_bus_1 = require("./event-bus");
Object.defineProperty(exports, "EventBus", { enumerable: true, get: function () { return event_bus_1.EventBus; } });
Object.defineProperty(exports, "getGlobalEventBus", { enumerable: true, get: function () { return event_bus_1.getGlobalEventBus; } });
Object.defineProperty(exports, "setGlobalEventBus", { enumerable: true, get: function () { return event_bus_1.setGlobalEventBus; } });
Object.defineProperty(exports, "assertJsonSafe", { enumerable: true, get: function () { return event_bus_1.assertJsonSafe; } });
var decorators_1 = require("./decorators");
Object.defineProperty(exports, "OnEvent", { enumerable: true, get: function () { return decorators_1.OnEvent; } });
Object.defineProperty(exports, "registerEventHandlers", { enumerable: true, get: function () { return decorators_1.registerEventHandlers; } });
var in_memory_transport_1 = require("./in-memory-transport");
Object.defineProperty(exports, "InMemoryTransport", { enumerable: true, get: function () { return in_memory_transport_1.InMemoryTransport; } });
Object.defineProperty(exports, "createLinkedTransports", { enumerable: true, get: function () { return in_memory_transport_1.createLinkedTransports; } });
var cluster_transport_1 = require("./cluster-transport");
Object.defineProperty(exports, "ClusterTransport", { enumerable: true, get: function () { return cluster_transport_1.ClusterTransport; } });
Object.defineProperty(exports, "installClusterEventRelay", { enumerable: true, get: function () { return cluster_transport_1.installClusterEventRelay; } });
Object.defineProperty(exports, "isClusterEventEnvelope", { enumerable: true, get: function () { return cluster_transport_1.isClusterEventEnvelope; } });
Object.defineProperty(exports, "processChannel", { enumerable: true, get: function () { return cluster_transport_1.processChannel; } });
Object.defineProperty(exports, "nodeClusterHost", { enumerable: true, get: function () { return cluster_transport_1.nodeClusterHost; } });
Object.defineProperty(exports, "CLUSTER_EVENTS_TAG", { enumerable: true, get: function () { return cluster_transport_1.CLUSTER_EVENTS_TAG; } });
Object.defineProperty(exports, "CLUSTER_EVENTS_VERSION", { enumerable: true, get: function () { return cluster_transport_1.CLUSTER_EVENTS_VERSION; } });
__exportStar(require("./types"), exports);
//# sourceMappingURL=index.js.map