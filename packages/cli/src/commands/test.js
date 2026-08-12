"use strict";
/**
 * rest test
 * Discovers and runs test files using the @restjs/testing framework.
 * Looks for *.test.ts and *.spec.ts files in the project.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runTests = runTests;
const fs_1 = require("fs");
const path_1 = require("path");
/**
 * Run all tests in the project.
 *
 * @param pattern  Optional path/pattern to filter test files
 */
async function runTests(pattern) {
    const cwd = process.cwd();
    const srcDir = (0, path_1.join)(cwd, 'src');
    const testDir = (0, path_1.join)(cwd, 'tests');
    // Find all test files
    const testFiles = [];
    // Scan src/ for *.test.ts files (co-located tests)
    if ((0, fs_1.statSync)(srcDir, { throwIfNoEntry: false })?.isDirectory()) {
        scanDir(srcDir, testFiles);
    }
    // Scan tests/ for test files
    if ((0, fs_1.statSync)(testDir, { throwIfNoEntry: false })?.isDirectory()) {
        scanDir(testDir, testFiles);
    }
    if (testFiles.length === 0) {
        console.log('\x1b[33m[REstJS Test]\x1b[0m No test files found.');
        console.log('Create a file ending in .test.ts or .spec.ts\n');
        return;
    }
    // Filter by pattern if provided
    const filtered = pattern
        ? testFiles.filter(f => f.includes(pattern))
        : testFiles;
    if (filtered.length === 0) {
        console.log(`\x1b[33m[REstJS Test]\x1b[0m No test files match pattern: ${pattern}`);
        return;
    }
    console.log(`\n\x1b[36m[REstJS Test]\x1b[0m Found ${filtered.length} test file(s)\n`);
    // Register ts-node for TypeScript support
    try {
        require('ts-node/register');
    }
    catch {
        console.warn('\x1b[33m[REstJS Test]\x1b[0m ts-node not found. ' +
            'Install it: npm install -D ts-node');
    }
    // Import and run each test file
    for (const file of filtered) {
        try {
            require((0, path_1.resolve)(file));
        }
        catch (error) {
            console.error(`\x1b[31m[REstJS Test]\x1b[0m Error loading ${file}:`, error.message);
        }
    }
    // Run all collected tests
    const { runTests: run } = require('@restjs/testing');
    const passed = await run();
    process.exit(passed ? 0 : 1);
}
/**
 * Recursively scan a directory for test files.
 */
function scanDir(dir, results) {
    const items = (0, fs_1.readdirSync)(dir, { withFileTypes: true });
    for (const item of items) {
        const fullPath = (0, path_1.join)(dir, item.name);
        if (item.isDirectory() && item.name !== 'node_modules') {
            scanDir(fullPath, results);
        }
        else if (item.isFile() &&
            (item.name.endsWith('.test.ts') ||
                item.name.endsWith('.spec.ts') ||
                item.name.endsWith('.test.js') ||
                item.name.endsWith('.spec.js'))) {
            results.push(fullPath);
        }
    }
}
//# sourceMappingURL=test.js.map