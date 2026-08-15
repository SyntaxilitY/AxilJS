"use strict";
/**
 * axil test [pattern]
 * Discovers and runs test files.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runTests = runTests;
const fs_1 = require("fs");
const path_1 = require("path");
async function runTests(pattern) {
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
        console.log('\x1b[33m[AxilJS Test]\x1b[0m No test files found.');
        return;
    }
    const filtered = pattern
        ? testFiles.filter(f => f.includes(pattern))
        : testFiles;
    if (filtered.length === 0) {
        console.log(`\x1b[33m[AxilJS Test]\x1b[0m No tests match: ${pattern}`);
        return;
    }
    console.log(`\n\x1b[36m[AxilJS Test]\x1b[0m Found ${filtered.length} test file(s)\n`);
    try {
        require('ts-node/register');
    }
    catch { }
    for (const file of filtered) {
        try {
            require((0, path_1.resolve)(file));
        }
        catch (error) {
            console.error(`\x1b[31m[AxilJS Test]\x1b[0m Error loading ${file}:`, error.message);
        }
    }
    const { runTests: run } = require('@axil/testing');
    const passed = await run();
    process.exit(passed ? 0 : 1);
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