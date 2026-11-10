"use strict";
/**
 * axil build
 * Compiles TypeScript and reports output.
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
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildProject = buildProject;
const fs_1 = require("fs");
const path_1 = require("path");
const ui = __importStar(require("../ui"));
const exec_1 = require("../utils/exec");
async function buildProject() {
    const cwd = process.cwd();
    ui.title('build', 'Build for production');
    if (!(0, fs_1.existsSync)((0, path_1.join)(cwd, 'tsconfig.json'))) {
        ui.error('No tsconfig.json found.', 'Run axil build from the project root.');
        process.exit(1);
    }
    const start = Date.now();
    await runStep('Type checking', 'Type check passed', 'Type check failed', 'npx tsc --noEmit', cwd);
    await runStep('Compiling TypeScript', 'Compilation complete', 'Compilation failed', 'npx tsc', cwd);
    const distDir = (0, path_1.join)(cwd, 'dist');
    if ((0, fs_1.existsSync)(distDir)) {
        const size = getDirSize(distDir);
        ui.done('Build complete', start);
        ui.keyValue([['Output', `${ui.path('dist/')}  ${ui.muted(formatBytes(size))}`]]);
        ui.box('Start production server', [ui.cmd('node dist/main.js')]);
    }
}
async function runStep(text, ok, fail, command, cwd) {
    const started = Date.now();
    const spin = ui.spinner(text);
    let result;
    try {
        result = await (0, exec_1.runCaptured)(command, cwd);
    }
    catch (error) {
        result = { code: 1, output: error?.message ?? String(error) };
    }
    const elapsed = ui.formatDuration(Date.now() - started);
    if (result.code === 0) {
        spin.succeed(ok, elapsed);
        return;
    }
    spin.fail(fail, elapsed);
    console.error('');
    (0, exec_1.printCaptured)(result.output, l => console.error(l));
    console.error('');
    process.exit(1);
}
function getDirSize(dirPath) {
    let total = 0;
    const items = (0, fs_1.readdirSync)(dirPath, { withFileTypes: true });
    for (const item of items) {
        const itemPath = (0, path_1.join)(dirPath, item.name);
        if (item.isDirectory())
            total += getDirSize(itemPath);
        else
            total += (0, fs_1.statSync)(itemPath).size;
    }
    return total;
}
function formatBytes(bytes) {
    if (bytes < 1024)
        return `${bytes} B`;
    if (bytes < 1024 * 1024)
        return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
//# sourceMappingURL=build.js.map