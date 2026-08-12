"use strict";
/**
 * rest run
 * Starts the REstJS development server with file watching.
 * Restarts automatically when files change.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDev = runDev;
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const path_1 = require("path");
let serverProcess = null;
let restartTimer = null;
/**
 * Start the development server.
 * Watches src/ for changes and restarts automatically.
 */
async function runDev() {
    const entryFile = (0, path_1.join)(process.cwd(), 'src', 'main.ts');
    console.log('\x1b[36m[REstJS]\x1b[0m Starting development server...\n');
    // Start the server
    startServer(entryFile);
    // Watch for file changes in src/
    watchFiles(entryFile);
    // Handle process termination
    process.on('SIGINT', () => {
        console.log('\n\x1b[36m[REstJS]\x1b[0m Shutting down...');
        if (serverProcess)
            serverProcess.kill();
        process.exit(0);
    });
}
/**
 * Start (or restart) the server process.
 */
function startServer(entryFile) {
    // Kill existing server if running
    if (serverProcess) {
        serverProcess.kill();
        serverProcess = null;
    }
    // Start new server process using ts-node
    serverProcess = (0, child_process_1.spawn)('node', ['-r', 'ts-node/register', entryFile], {
        stdio: 'inherit', // Share parent's stdin/stdout/stderr
        env: { ...process.env, NODE_ENV: 'development' }
    });
    serverProcess.on('error', (err) => {
        console.error('\x1b[31m[REstJS]\x1b[0m Failed to start server:', err.message);
    });
}
/**
 * Watch src/ directory for file changes.
 * Debounce restarts to avoid rapid restarts on multiple saves.
 */
function watchFiles(entryFile) {
    const srcDir = (0, path_1.join)(process.cwd(), 'src');
    (0, fs_1.watch)(srcDir, { recursive: true }, (event, filename) => {
        if (!filename?.endsWith('.ts'))
            return;
        // Debounce - wait 300ms after last change before restarting
        if (restartTimer)
            clearTimeout(restartTimer);
        restartTimer = setTimeout(() => {
            console.log(`\n\x1b[33m[REstJS]\x1b[0m File changed: ${filename} - Restarting...\n`);
            startServer(entryFile);
        }, 300);
    });
    console.log('\x1b[90m[REstJS] Watching src/ for changes...\x1b[0m\n');
}
//# sourceMappingURL=run.js.map