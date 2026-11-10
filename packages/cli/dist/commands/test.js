"use strict";
/**
 * axil test [pattern]
 * Discovers and runs test files.
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
exports.runTests = runTests;
const fs_1 = require("fs");
const path_1 = require("path");
const url_1 = require("url");
const ui = __importStar(require("../ui"));
const exec_1 = require("../utils/exec");
async function runTests(pattern) {
    ui.title('test', 'Run tests');
    const cwd = process.cwd();
    const srcDir = (0, path_1.join)(cwd, 'src');
    const testDir = (0, path_1.join)(cwd, 'tests');
    const testFiles = [];
    if ((0, fs_1.statSync)(srcDir, { throwIfNoEntry: false })?.isDirectory()) {
        scanDir(srcDir, testFiles);
    }
    if ((0, fs_1.statSync)(testDir, { throwIfNoEntry: false })?.isDirectory()) {
        scanDir(testDir, testFiles);
    }
    if (testFiles.length === 0) {
        ui.warn('No test files found.', 'looked for *.test.ts / *.spec.ts in src/ and tests/');
        ui.line();
        return;
    }
    const filtered = pattern
        ? testFiles.filter(f => f.includes(pattern) || f.replace(/\\/g, '/').includes(pattern))
        : testFiles;
    if (filtered.length === 0) {
        ui.warn(`No tests match: ${pattern}`, `${testFiles.length} test file(s) found`);
        ui.line();
        return;
    }
    ui.info(`Found ${filtered.length} test file(s)`, pattern ? `matching "${pattern}"` : undefined);
    // TypeScript projects: compile with the project's tsc (as `axil run` does)
    // and load the compiled tests. Source files can't be loaded directly: ESM
    // projects import siblings as './x.js', which only exists after compiling.
    const ts = readTsConfigDirs(cwd);
    const compiles = ts !== undefined && filtered.some(f => f.endsWith('.ts') && isInside(ts.rootDir, f));
    if (compiles) {
        const spin = ui.spinner('Compiling TypeScript');
        const result = await (0, exec_1.runCaptured)('npx tsc -p tsconfig.json', cwd);
        if (result.code !== 0) {
            spin.fail('Compilation failed');
            (0, exec_1.printCaptured)(result.output, l => console.error(l));
            ui.failed('Tests not run', 'fix the type errors above');
            process.exit(1);
        }
        spin.succeed('Compiled', ui.path((0, path_1.relative)(cwd, ts.outDir) || '.'));
    }
    else {
        try {
            require(resolveFromProject('ts-node/register', cwd));
        }
        catch { }
    }
    ui.outro();
    let loadFailed = false;
    for (const file of filtered) {
        const target = compiles && file.endsWith('.ts') && isInside(ts.rootDir, file)
            ? (0, path_1.join)(ts.outDir, (0, path_1.relative)(ts.rootDir, file)).replace(/\.ts$/, '.js')
            : (0, path_1.resolve)(file);
        try {
            await import((0, url_1.pathToFileURL)(target).href);
        }
        catch (error) {
            loadFailed = true;
            ui.error(`Error loading ${ui.path((0, path_1.relative)(cwd, file))}`, error.message);
        }
    }
    // Must be the same @axiljs/testing instance the test files imported (the
    // project's copy), otherwise the suite registry is empty and 0 tests "pass".
    const { runTests: run } = require(resolveFromProject('@axiljs/testing', cwd));
    const passed = await run();
    process.exit(passed && !loadFailed ? 0 : 1);
}
/** rootDir/outDir from tsconfig.json (JSON with comments allowed); undefined without an outDir. */
function readTsConfigDirs(cwd) {
    const file = (0, path_1.join)(cwd, 'tsconfig.json');
    if (!(0, fs_1.existsSync)(file))
        return undefined;
    try {
        const raw = (0, fs_1.readFileSync)(file, 'utf8')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^\s*\/\/.*$/gm, '')
            .replace(/,(\s*[}\]])/g, '$1');
        const options = JSON.parse(raw).compilerOptions ?? {};
        if (!options.outDir)
            return undefined;
        return { rootDir: (0, path_1.resolve)(cwd, options.rootDir ?? '.'), outDir: (0, path_1.resolve)(cwd, options.outDir) };
    }
    catch {
        return undefined;
    }
}
function isInside(dir, file) {
    const rel = (0, path_1.relative)(dir, file);
    return rel !== '' && !rel.startsWith('..') && !(0, path_1.isAbsolute)(rel);
}
function resolveFromProject(id, cwd) {
    try {
        return require.resolve(id, { paths: [cwd] });
    }
    catch {
        return id;
    }
}
function scanDir(dir, results) {
    const items = (0, fs_1.readdirSync)(dir, { withFileTypes: true });
    for (const item of items) {
        const fullPath = (0, path_1.join)(dir, item.name);
        if (item.isDirectory() && item.name !== 'node_modules') {
            scanDir(fullPath, results);
        }
        else if (item.isFile() &&
            (item.name.endsWith('.test.ts') || item.name.endsWith('.spec.ts') ||
                item.name.endsWith('.test.js') || item.name.endsWith('.spec.js'))) {
            results.push(fullPath);
        }
    }
}
//# sourceMappingURL=test.js.map