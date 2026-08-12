"use strict";
/**
 * @restjs/testing - Public API
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTestClient = exports.TestClient = exports.AssertionError = exports.expect = exports.runTests = exports.afterEach = exports.beforeEach = exports.afterAll = exports.beforeAll = exports.fit = exports.xit = exports.test = exports.it = exports.describe = void 0;
// Test runner
var test_runner_1 = require("./runner/test-runner");
Object.defineProperty(exports, "describe", { enumerable: true, get: function () { return test_runner_1.describe; } });
Object.defineProperty(exports, "it", { enumerable: true, get: function () { return test_runner_1.it; } });
Object.defineProperty(exports, "test", { enumerable: true, get: function () { return test_runner_1.test; } });
Object.defineProperty(exports, "xit", { enumerable: true, get: function () { return test_runner_1.xit; } });
Object.defineProperty(exports, "fit", { enumerable: true, get: function () { return test_runner_1.fit; } });
Object.defineProperty(exports, "beforeAll", { enumerable: true, get: function () { return test_runner_1.beforeAll; } });
Object.defineProperty(exports, "afterAll", { enumerable: true, get: function () { return test_runner_1.afterAll; } });
Object.defineProperty(exports, "beforeEach", { enumerable: true, get: function () { return test_runner_1.beforeEach; } });
Object.defineProperty(exports, "afterEach", { enumerable: true, get: function () { return test_runner_1.afterEach; } });
Object.defineProperty(exports, "runTests", { enumerable: true, get: function () { return test_runner_1.runTests; } });
// Assertions
var expect_1 = require("./assertions/expect");
Object.defineProperty(exports, "expect", { enumerable: true, get: function () { return expect_1.expect; } });
Object.defineProperty(exports, "AssertionError", { enumerable: true, get: function () { return expect_1.AssertionError; } });
// HTTP test client
var test_client_1 = require("./http/test-client");
Object.defineProperty(exports, "TestClient", { enumerable: true, get: function () { return test_client_1.TestClient; } });
Object.defineProperty(exports, "createTestClient", { enumerable: true, get: function () { return test_client_1.createTestClient; } });
//# sourceMappingURL=index.js.map