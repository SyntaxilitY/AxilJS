"use strict";
/**
 * @axil/circuit - Public API
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.withTimeout = exports.retry = exports.CircuitOpenError = exports.CircuitBreaker = void 0;
var circuit_breaker_1 = require("./circuit-breaker");
Object.defineProperty(exports, "CircuitBreaker", { enumerable: true, get: function () { return circuit_breaker_1.CircuitBreaker; } });
Object.defineProperty(exports, "CircuitOpenError", { enumerable: true, get: function () { return circuit_breaker_1.CircuitOpenError; } });
var retry_1 = require("./retry");
Object.defineProperty(exports, "retry", { enumerable: true, get: function () { return retry_1.retry; } });
Object.defineProperty(exports, "withTimeout", { enumerable: true, get: function () { return retry_1.withTimeout; } });
//# sourceMappingURL=index.js.map