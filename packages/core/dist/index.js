"use strict";
/**
 * @axiljs/core - Public API
 * Everything a developer needs to build with @axiljsJS.
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
exports.sseHeartbeat = exports.createSSE = exports.serveStatic = exports.cors = exports.requestLogger = exports.bodyParser = exports.Response = exports.Request = exports.Router = exports.Application = void 0;
// Main application class
var application_1 = require("./application");
Object.defineProperty(exports, "Application", { enumerable: true, get: function () { return application_1.Application; } });
// Router for modular route definitions
var router_1 = require("./router/router");
Object.defineProperty(exports, "Router", { enumerable: true, get: function () { return router_1.Router; } });
// HTTP request/response (for type usage)
var request_1 = require("./http/request");
Object.defineProperty(exports, "Request", { enumerable: true, get: function () { return request_1.Request; } });
var response_1 = require("./http/response");
Object.defineProperty(exports, "Response", { enumerable: true, get: function () { return response_1.Response; } });
// Built-in middleware
var body_parser_1 = require("./middleware/body-parser");
Object.defineProperty(exports, "bodyParser", { enumerable: true, get: function () { return body_parser_1.bodyParser; } });
var logger_1 = require("./middleware/logger");
Object.defineProperty(exports, "requestLogger", { enumerable: true, get: function () { return logger_1.requestLogger; } });
var cors_1 = require("./middleware/cors");
Object.defineProperty(exports, "cors", { enumerable: true, get: function () { return cors_1.cors; } });
var static_1 = require("./middleware/static");
Object.defineProperty(exports, "serveStatic", { enumerable: true, get: function () { return static_1.serveStatic; } });
var sse_1 = require("./middleware/sse");
Object.defineProperty(exports, "createSSE", { enumerable: true, get: function () { return sse_1.createSSE; } });
Object.defineProperty(exports, "sseHeartbeat", { enumerable: true, get: function () { return sse_1.sseHeartbeat; } });
__exportStar(require("@axiljs/common"), exports);
//# sourceMappingURL=index.js.map