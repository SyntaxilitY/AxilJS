"use strict";
/**
 * rest build
 *
 * Compiles TypeScript, bundles for production.
 * Zero-config - reads tsconfig.json from project root.
 *
 * Steps:
 *   1. Type check (tsc --noEmit)
 *   2. Compile TypeScript (tsc)
 *   3. Report bundle size
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildProject = buildProject;
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const path_1 = require("path");
/**
 * Build the project for production.
 */
async function buildProject() {
    const cwd = process.cwd();
    console.log('\n\x1b[36m[REstJS]\x1b[0m Building for production...\n');
    // Ensure tsconfig.json exists
    if (!(0, fs_1.existsSync)((0, path_1.join)(cwd, 'tsconfig.json'))) {
        console.error('\x1b[31mError:\x1b[0m No tsconfig.json found.\n' +
            'Run from a REstJS project directory.');
        process.exit(1);
    }
    const start = Date.now();
    // Step 1: Type check
    console.log('  \x1b[90mType checking...\x1b[0m');
    try {
        (0, child_process_1.execSync)('npx tsc --noEmit', {
            cwd,
            stdio: 'pipe'
        });
        console.log('  \x1b[32m✓\x1b[0m Type check passed');
    }
    catch (error) {
        console.error('  \x1b[31m✗\x1b[0m Type check failed:\n');
        console.error(error.stdout?.toString() || error.message);
        process.exit(1);
    }
    // Step 2: Compile TypeScript
    console.log('  \x1b[90mCompiling TypeScript...\x1b[0m');
    try {
        (0, child_process_1.execSync)('npx tsc', {
            cwd,
            stdio: 'pipe'
        });
        console.log('  \x1b[32m✓\x1b[0m Compilation complete');
    }
    catch (error) {
        console.error('  \x1b[31m✗\x1b[0m Compilation failed:\n');
        console.error(error.stdout?.toString() || error.message);
        process.exit(1);
    }
    // Step 3: Report output
    const distDir = (0, path_1.join)(cwd, 'dist');
    if ((0, fs_1.existsSync)(distDir)) {
        const size = getDirSize(distDir);
        const duration = Date.now() - start;
        console.log('');
        console.log(`\x1b[32m✓\x1b[0m Build complete in \x1b[1m${duration}ms\x1b[0m`);
        console.log(`  Output: \x1b[36mdist/\x1b[0m (${formatBytes(size)})`);
        console.log('');
        console.log('  Start production server:');
        console.log('  \x1b[90mnode dist/main.js\x1b[0m');
        console.log('');
    }
}
/**
 * Calculate total size of a directory recursively.
 */
function getDirSize(dirPath) {
    let total = 0;
    const items = (0, fs_1.readdirSync)(dirPath, {
        withFileTypes: true
    });
    for (const item of items) {
        const itemPath = (0, path_1.join)(dirPath, item.name);
        if (item.isDirectory()) {
            total += getDirSize(itemPath);
        }
        else {
            total += (0, fs_1.statSync)(itemPath).size;
        }
    }
    return total;
}
/**
 * Format bytes into human readable string.
 */
function formatBytes(bytes) {
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
//# sourceMappingURL=build.js.map