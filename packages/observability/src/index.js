"use strict";
/**
 * @axiljs/observability - Public API
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.metricsHandler = exports.observabilityMiddleware = exports.Span = exports.Tracer = exports.HealthChecker = exports.Histogram = exports.Gauge = exports.Counter = exports.MetricsRegistry = exports.FileTransport = exports.ConsoleTransport = exports.Logger = void 0;
// Logging
var logger_1 = require("./logger");
Object.defineProperty(exports, "Logger", { enumerable: true, get: function () { return logger_1.Logger; } });
Object.defineProperty(exports, "ConsoleTransport", { enumerable: true, get: function () { return logger_1.ConsoleTransport; } });
Object.defineProperty(exports, "FileTransport", { enumerable: true, get: function () { return logger_1.FileTransport; } });
// Metrics
var metrics_1 = require("./metrics");
Object.defineProperty(exports, "MetricsRegistry", { enumerable: true, get: function () { return metrics_1.MetricsRegistry; } });
Object.defineProperty(exports, "Counter", { enumerable: true, get: function () { return metrics_1.Counter; } });
Object.defineProperty(exports, "Gauge", { enumerable: true, get: function () { return metrics_1.Gauge; } });
Object.defineProperty(exports, "Histogram", { enumerable: true, get: function () { return metrics_1.Histogram; } });
// Health checks
var health_1 = require("./health");
Object.defineProperty(exports, "HealthChecker", { enumerable: true, get: function () { return health_1.HealthChecker; } });
// Tracing
var tracing_1 = require("./tracing");
Object.defineProperty(exports, "Tracer", { enumerable: true, get: function () { return tracing_1.Tracer; } });
Object.defineProperty(exports, "Span", { enumerable: true, get: function () { return tracing_1.Span; } });
// Middleware
var middleware_1 = require("./middleware");
Object.defineProperty(exports, "observabilityMiddleware", { enumerable: true, get: function () { return middleware_1.observabilityMiddleware; } });
Object.defineProperty(exports, "metricsHandler", { enumerable: true, get: function () { return middleware_1.metricsHandler; } });
//# sourceMappingURL=index.js.map