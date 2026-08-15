"use strict";
/**
 * axil run
 * Development server with hot reload.
 * Watches src/ for TypeScript changes → recompiles → restarts.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDev = runDev;
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const path_1 = require("path");
let serverProcess = null;
let restartTimer = null;
let isCompiling = false;
let startCount = 0;
const changedFiles = new Set();
const C = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    gray: '\x1b[90m'
};
function log(msg) {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    console.log(`${C.gray}${time}${C.reset} ${C.cyan}[axil run]${C.reset} ${msg}`);
}
function logError(msg) {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    console.log(`${C.gray}${time}${C.reset} ${C.red}[axil run]${C.reset} ${msg}`);
}
function logSuccess(msg) {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    console.log(`${C.gray}${time}${C.reset} ${C.green}[axil run]${C.reset} ${msg}`);
}
function compile(cwd) {
    const start = Date.now();
    try {
        (0, child_process_1.execSync)('npx tsc --incremental --noEmitOnError', {
            cwd,
            stdio: 'pipe'
        });
        const duration = Date.now() - start;
        logSuccess(`Compiled ${C.bold}${changedFiles.size > 0 ? changedFiles.size + ' file(s)' : 'project'}${C.reset}${C.green} in ${C.bold}${duration}ms${C.reset}`);
        changedFiles.clear();
        return true;
    }
    catch (error) {
        const duration = Date.now() - start;
        const output = error.stdout?.toString() || '';
        const stderr = error.stderr?.toString() || '';
        logError(`Compilation failed in ${duration}ms`);
        const errorOutput = output || stderr;
        if (errorOutput) {
            errorOutput.split('\n').forEach((line) => {
                if (line.includes('error TS')) {
                    console.log(`  ${C.red}${line}${C.reset}`);
                }
                else if (line.trim()) {
                    console.log(`  ${C.gray}${line}${C.reset}`);
                }
            });
        }
        logError('Server NOT restarted — fix the errors above');
        changedFiles.clear();
        return false;
    }
}
function findEntryPoint(cwd) {
    const candidates = [
        (0, path_1.join)(cwd, 'dist', 'main.js'),
        (0, path_1.join)(cwd, 'dist', 'server.js'),
        (0, path_1.join)(cwd, 'dist', 'index.js'),
        (0, path_1.join)(cwd, 'dist', 'src', 'main.js'),
        (0, path_1.join)(cwd, 'dist', 'src', 'server.js'),
        (0, path_1.join)(cwd, 'dist', 'src', 'index.js')
    ];
    for (const candidate of candidates) {
        if ((0, fs_1.existsSync)(candidate))
            return candidate;
    }
    return null;
}
async function startServer(cwd) {
    if (serverProcess) {
        serverProcess.kill('SIGTERM');
        await new Promise(resolve => {
            const timer = setTimeout(() => {
                if (serverProcess)
                    serverProcess.kill('SIGKILL');
                resolve();
            }, 2000);
            serverProcess.once('exit', () => {
                clearTimeout(timer);
                resolve();
            });
        });
        serverProcess = null;
    }
    const entry = findEntryPoint(cwd);
    if (!entry) {
        logError('Could not find entry point.');
        return;
    }
    startCount++;
    const relEntry = (0, path_1.relative)(cwd, entry);
    if (startCount === 1) {
        log(`Starting ${C.bold}${relEntry}${C.reset}`);
    }
    else {
        log(`Restarting ${C.bold}${relEntry}${C.reset} ${C.gray}(restart #${startCount - 1})${C.reset}`);
    }
    serverProcess = (0, child_process_1.spawn)('node', [entry], {
        cwd,
        stdio: 'inherit',
        env: {
            ...process.env,
            NODE_ENV: process.env.NODE_ENV || 'development',
            FORCE_COLOR: '1',
            NODE_NO_WARNINGS: '1'
        }
    });
    serverProcess.on('error', (err) => {
        logError(`Failed to start server: ${err.message}`);
    });
    serverProcess.on('exit', (code, signal) => {
        if (signal === 'SIGTERM' || signal === 'SIGKILL')
            return;
        if (code !== 0 && code !== null)
            logError(`Server exited with code ${code}`);
    });
}
function watchFiles(cwd) {
    const srcDir = (0, path_1.join)(cwd, 'src');
    if (!(0, fs_1.existsSync)(srcDir)) {
        logError(`src/ directory not found at ${srcDir}`);
        return;
    }
    log(`Watching ${C.bold}src/${C.reset} for changes...`);
    (0, fs_1.watch)(srcDir, { recursive: true }, (event, filename) => {
        if (!filename)
            return;
        if (!filename.endsWith('.ts') && !filename.endsWith('.tsx'))
            return;
        changedFiles.add(filename);
        if (restartTimer)
            clearTimeout(restartTimer);
        restartTimer = setTimeout(async () => {
            if (isCompiling)
                return;
            isCompiling = true;
            const files = Array.from(changedFiles);
            if (files.length === 1) {
                log(`Changed: ${C.yellow}${files[0]}${C.reset}`);
            }
            else {
                log(`Changed: ${C.yellow}${files.length} files${C.reset}`);
                files.forEach(f => console.log(`  ${C.gray}→ ${f}${C.reset}`));
            }
            const success = compile(cwd);
            if (success) {
                await startServer(cwd);
            }
            isCompiling = false;
        }, 150);
    });
}
function validateProject(cwd) {
    if (!(0, fs_1.existsSync)((0, path_1.join)(cwd, 'package.json'))) {
        logError('No package.json found.');
        return false;
    }
    if (!(0, fs_1.existsSync)((0, path_1.join)(cwd, 'tsconfig.json'))) {
        logError('No tsconfig.json found.');
        return false;
    }
    if (!(0, fs_1.existsSync)((0, path_1.join)(cwd, 'src'))) {
        logError('No src/ directory found.');
        return false;
    }
    return true;
}
async function runDev() {
    const cwd = process.cwd();
    console.log('');
    console.log(`${C.cyan}${C.bold} AxilJS${C.reset} ${C.gray}development server${C.reset}`);
    console.log(`${C.gray} ─────────────────────────────────────${C.reset}`);
    console.log('');
    if (!validateProject(cwd))
        process.exit(1);
    const distDir = (0, path_1.join)(cwd, 'dist');
    if (!(0, fs_1.existsSync)(distDir))
        (0, fs_1.mkdirSync)(distDir, { recursive: true });
    log('Initial compilation...');
    const success = compile(cwd);
    if (!success) {
        logError('Fix compilation errors then save a file to retry.');
        watchFiles(cwd);
        setupShutdown();
        return;
    }
    await startServer(cwd);
    watchFiles(cwd);
    setupShutdown();
}
function setupShutdown() {
    process.on('SIGINT', async () => {
        console.log('');
        log('Shutting down...');
        if (serverProcess) {
            serverProcess.kill('SIGTERM');
            await new Promise(resolve => {
                const timer = setTimeout(() => {
                    serverProcess?.kill('SIGKILL');
                    resolve();
                }, 3000);
                serverProcess.once('exit', () => {
                    clearTimeout(timer);
                    resolve();
                });
            });
        }
        console.log('');
        process.exit(0);
    });
}
//# sourceMappingURL=run.js.map