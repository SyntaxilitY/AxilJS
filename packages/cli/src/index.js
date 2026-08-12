"use strict";
/**
 * @restjs/cli - Public API
 * Exports CLI utilities for programmatic use.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDev = exports.createProject = void 0;
var create_1 = require("./commands/create");
Object.defineProperty(exports, "createProject", { enumerable: true, get: function () { return create_1.createProject; } });
var run_1 = require("./commands/run");
Object.defineProperty(exports, "runDev", { enumerable: true, get: function () { return run_1.runDev; } });
//# sourceMappingURL=index.js.map