"use strict";
/**
 * @axil/events - Public API
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
exports.registerEventHandlers = exports.OnEvent = exports.setGlobalEventBus = exports.getGlobalEventBus = exports.EventBus = void 0;
var event_bus_1 = require("./event-bus");
Object.defineProperty(exports, "EventBus", { enumerable: true, get: function () { return event_bus_1.EventBus; } });
Object.defineProperty(exports, "getGlobalEventBus", { enumerable: true, get: function () { return event_bus_1.getGlobalEventBus; } });
Object.defineProperty(exports, "setGlobalEventBus", { enumerable: true, get: function () { return event_bus_1.setGlobalEventBus; } });
var decorators_1 = require("./decorators");
Object.defineProperty(exports, "OnEvent", { enumerable: true, get: function () { return decorators_1.OnEvent; } });
Object.defineProperty(exports, "registerEventHandlers", { enumerable: true, get: function () { return decorators_1.registerEventHandlers; } });
__exportStar(require("./types"), exports);
//# sourceMappingURL=index.js.map