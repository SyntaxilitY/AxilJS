"use strict";
/**
 * @axil/cli — Public API
 * Exports CLI utilities for programmatic use.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.deploy = exports.runDoctor = exports.runTests = exports.installPackages = exports.buildProject = exports.runDev = exports.createProject = void 0;
var create_1 = require("./commands/create");
Object.defineProperty(exports, "createProject", { enumerable: true, get: function () { return create_1.createProject; } });
var run_1 = require("./commands/run");
Object.defineProperty(exports, "runDev", { enumerable: true, get: function () { return run_1.runDev; } });
var build_1 = require("./commands/build");
Object.defineProperty(exports, "buildProject", { enumerable: true, get: function () { return build_1.buildProject; } });
var install_1 = require("./commands/install");
Object.defineProperty(exports, "installPackages", { enumerable: true, get: function () { return install_1.installPackages; } });
var test_1 = require("./commands/test");
Object.defineProperty(exports, "runTests", { enumerable: true, get: function () { return test_1.runTests; } });
var doctor_1 = require("./commands/doctor");
Object.defineProperty(exports, "runDoctor", { enumerable: true, get: function () { return doctor_1.runDoctor; } });
var deploy_1 = require("./commands/deploy");
Object.defineProperty(exports, "deploy", { enumerable: true, get: function () { return deploy_1.deploy; } });
//# sourceMappingURL=index.js.map