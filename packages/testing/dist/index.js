"use strict";
/**
 * @axiljs/testing - Public API
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RUNTIME_REPORT_KEY = exports.DEFAULT_IDEMPOTENCY_IGNORE = exports.ContractViolationError = exports.extractRows = exports.expectNoIntentViolations = exports.expectTenantIsolated = exports.expectIdempotent = exports.createTestClient = exports.TestRequest = exports.TestClient = exports.isMockFunction = exports.spyOn = exports.fn = exports.AssertionError = exports.expect = exports.DEFAULT_TIMEOUT = exports.resetTests = exports.runTestsWithResults = exports.runTests = exports.afterEach = exports.beforeEach = exports.afterAll = exports.beforeAll = exports.fdescribe = exports.xdescribe = exports.fit = exports.xit = exports.test = exports.it = exports.describe = void 0;
// Test runner
var test_runner_1 = require("./runner/test-runner");
Object.defineProperty(exports, "describe", { enumerable: true, get: function () { return test_runner_1.describe; } });
Object.defineProperty(exports, "it", { enumerable: true, get: function () { return test_runner_1.it; } });
Object.defineProperty(exports, "test", { enumerable: true, get: function () { return test_runner_1.test; } });
Object.defineProperty(exports, "xit", { enumerable: true, get: function () { return test_runner_1.xit; } });
Object.defineProperty(exports, "fit", { enumerable: true, get: function () { return test_runner_1.fit; } });
Object.defineProperty(exports, "xdescribe", { enumerable: true, get: function () { return test_runner_1.xdescribe; } });
Object.defineProperty(exports, "fdescribe", { enumerable: true, get: function () { return test_runner_1.fdescribe; } });
Object.defineProperty(exports, "beforeAll", { enumerable: true, get: function () { return test_runner_1.beforeAll; } });
Object.defineProperty(exports, "afterAll", { enumerable: true, get: function () { return test_runner_1.afterAll; } });
Object.defineProperty(exports, "beforeEach", { enumerable: true, get: function () { return test_runner_1.beforeEach; } });
Object.defineProperty(exports, "afterEach", { enumerable: true, get: function () { return test_runner_1.afterEach; } });
Object.defineProperty(exports, "runTests", { enumerable: true, get: function () { return test_runner_1.runTests; } });
Object.defineProperty(exports, "runTestsWithResults", { enumerable: true, get: function () { return test_runner_1.runTestsWithResults; } });
Object.defineProperty(exports, "resetTests", { enumerable: true, get: function () { return test_runner_1.resetTests; } });
Object.defineProperty(exports, "DEFAULT_TIMEOUT", { enumerable: true, get: function () { return test_runner_1.DEFAULT_TIMEOUT; } });
// Assertions
var expect_1 = require("./assertions/expect");
Object.defineProperty(exports, "expect", { enumerable: true, get: function () { return expect_1.expect; } });
Object.defineProperty(exports, "AssertionError", { enumerable: true, get: function () { return expect_1.AssertionError; } });
// Mock functions and spies
var mock_1 = require("./mock/mock");
Object.defineProperty(exports, "fn", { enumerable: true, get: function () { return mock_1.fn; } });
Object.defineProperty(exports, "spyOn", { enumerable: true, get: function () { return mock_1.spyOn; } });
Object.defineProperty(exports, "isMockFunction", { enumerable: true, get: function () { return mock_1.isMockFunction; } });
// HTTP test client
var test_client_1 = require("./http/test-client");
Object.defineProperty(exports, "TestClient", { enumerable: true, get: function () { return test_client_1.TestClient; } });
Object.defineProperty(exports, "TestRequest", { enumerable: true, get: function () { return test_client_1.TestRequest; } });
Object.defineProperty(exports, "createTestClient", { enumerable: true, get: function () { return test_client_1.createTestClient; } });
// Contract testing (idempotency, tenant isolation, runtime intent)
var contracts_1 = require("./contracts");
Object.defineProperty(exports, "expectIdempotent", { enumerable: true, get: function () { return contracts_1.expectIdempotent; } });
Object.defineProperty(exports, "expectTenantIsolated", { enumerable: true, get: function () { return contracts_1.expectTenantIsolated; } });
Object.defineProperty(exports, "expectNoIntentViolations", { enumerable: true, get: function () { return contracts_1.expectNoIntentViolations; } });
Object.defineProperty(exports, "extractRows", { enumerable: true, get: function () { return contracts_1.extractRows; } });
Object.defineProperty(exports, "ContractViolationError", { enumerable: true, get: function () { return contracts_1.ContractViolationError; } });
Object.defineProperty(exports, "DEFAULT_IDEMPOTENCY_IGNORE", { enumerable: true, get: function () { return contracts_1.DEFAULT_IDEMPOTENCY_IGNORE; } });
Object.defineProperty(exports, "RUNTIME_REPORT_KEY", { enumerable: true, get: function () { return contracts_1.RUNTIME_REPORT_KEY; } });
//# sourceMappingURL=index.js.map