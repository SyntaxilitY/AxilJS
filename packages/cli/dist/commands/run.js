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
// ── State ─────────────────────────────────────────────────────────────────────
let serverProcess = null;
let restartTimer = null;
let isCompiling = false;
let startCount = 0;
let studioInstance = null;
const changedFiles = new Set();
// ── Colors ────────────────────────────────────────────────────────────────────
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
// ── Logging ───────────────────────────────────────────────────────────────────
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
// ── Helpers ───────────────────────────────────────────────────────────────────
/**
 * Read a value from the project .env file.
 * Returns undefined if the file or key does not exist.
 */
function readEnvValue(cwd, key) {
    const envPath = (0, path_1.join)(cwd, '.env');
    if (!(0, fs_1.existsSync)(envPath))
        return undefined;
    const content = (0, fs_1.readFileSync)(envPath, 'utf-8');
    const match = content.match(new RegExp(`^${key}=(.+)$`, 'm'));
    return match ? match[1].trim() : undefined;
}
/**
 * Read the app port from .env PORT= or fall back to 3000.
 */
function readAppPort(cwd) {
    const raw = readEnvValue(cwd, 'PORT');
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isNaN(n) ? 3000 : n;
}
// ── Compiler ──────────────────────────────────────────────────────────────────
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
        const output = error.stdout?.toString() ?? '';
        const stderr = error.stderr?.toString() ?? '';
        const errorOutput = output || stderr;
        logError(`Compilation failed in ${duration}ms`);
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
// ── Entry point detection ─────────────────────────────────────────────────────
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
// ── Server lifecycle ──────────────────────────────────────────────────────────
async function startServer(cwd) {
    // Kill existing process if running
    if (serverProcess) {
        serverProcess.kill('SIGTERM');
        await new Promise(done => {
            const timer = setTimeout(() => {
                if (serverProcess)
                    serverProcess.kill('SIGKILL');
                done();
            }, 2000);
            serverProcess.once('exit', () => {
                clearTimeout(timer);
                done();
            });
        });
        serverProcess = null;
    }
    const entry = findEntryPoint(cwd);
    if (!entry) {
        logError('Could not find entry point (dist/main.js, dist/server.js, dist/index.js).');
        return;
    }
    startCount++;
    const relEntry = (0, path_1.relative)(cwd, entry);
    if (startCount === 1) {
        log(`Starting ${C.bold}${relEntry}${C.reset}`);
    }
    else {
        log(`Restarting ${C.bold}${relEntry}${C.reset} ` +
            `${C.gray}(restart #${startCount - 1})${C.reset}`);
    }
    serverProcess = (0, child_process_1.spawn)('node', [entry], {
        cwd,
        stdio: 'inherit',
        env: {
            ...process.env,
            NODE_ENV: process.env.NODE_ENV ?? 'development',
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
        if (code !== 0 && code !== null) {
            logError(`Server exited with code ${code}`);
        }
    });
}
// ── File watcher ──────────────────────────────────────────────────────────────
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
            const ok = compile(cwd);
            if (ok)
                await startServer(cwd);
            isCompiling = false;
        }, 150);
    });
}
// ── Project validation ────────────────────────────────────────────────────────
function validateProject(cwd) {
    if (!(0, fs_1.existsSync)((0, path_1.join)(cwd, 'package.json'))) {
        logError('No package.json found. Are you inside an AxilJS project?');
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
// ── Studio ────────────────────────────────────────────────────────────────────
async function startStudio(cwd, appPort) {
    try {
        // Use require() so TypeScript does not attempt to resolve
        // @axiljs/studio at compile time. Studio is optional — if it
        // is not installed the catch block silently skips it.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const studioModule = (() => {
            try {
                return require('@axiljs/studio');
            }
            catch {
                return null;
            }
        })();
        if (!studioModule) {
            return null;
        }
        const { StudioServer } = studioModule;
        // ── App name ───────────────────────────────────────────────────
        const pkgPath = (0, path_1.join)(cwd, 'package.json');
        const appName = (0, fs_1.existsSync)(pkgPath)
            ? JSON.parse((0, fs_1.readFileSync)(pkgPath, 'utf-8')).name ?? 'axiljs-app'
            : 'axiljs-app';
        // ── Database config from .env ──────────────────────────────────
        let dbDriver;
        let dbFile;
        let dbUrl;
        const rawUrl = readEnvValue(cwd, 'DATABASE_URL');
        const rawFile = readEnvValue(cwd, 'DATABASE_FILENAME');
        if (rawUrl) {
            dbUrl = rawUrl;
            if (dbUrl.startsWith('postgres'))
                dbDriver = 'postgres';
            else if (dbUrl.startsWith('mysql'))
                dbDriver = 'mysql';
        }
        if (rawFile) {
            dbDriver = 'sqlite';
            dbFile = rawFile;
        }
        // ── Start Studio on appPort + 1 ────────────────────────────────
        const studioPort = appPort + 1;
        const studio = new StudioServer({
            port: studioPort,
            host: '127.0.0.1',
            appPort,
            appName,
            dbDriver,
            dbFile,
            dbUrl,
            enableQR: true
        });
        await studio.start();
        log(`Studio  ${C.bold}http://localhost:${studioPort}${C.reset} ` +
            `${C.gray}(auto-opened in browser)${C.reset}`);
        return studio;
    }
    catch (err) {
        log(`${C.yellow}Studio unavailable:${C.reset} ${err.message}`);
        return null;
    }
}
// ── Graceful shutdown ─────────────────────────────────────────────────────────
function setupShutdown(studio) {
    // Guard against registering the handler multiple times
    // (can happen if runDev is called programmatically)
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
    async function shutdown(signal) {
        console.log('');
        log(`${signal} received — shutting down...`);
        // 1. Stop Studio
        if (studio) {
            try {
                await studio.stop();
            }
            catch {
                // Best effort
            }
        }
        // 2. Kill app server
        if (serverProcess) {
            serverProcess.kill('SIGTERM');
            await new Promise(done => {
                const timer = setTimeout(() => {
                    serverProcess?.kill('SIGKILL');
                    done();
                }, 3000);
                serverProcess.once('exit', () => {
                    clearTimeout(timer);
                    done();
                });
            });
        }
        console.log('');
        process.exit(0);
    }
    process.on('SIGINT', () => { void shutdown('SIGINT'); });
    process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
}
// ── Main export ───────────────────────────────────────────────────────────────
async function runDev() {
    const cwd = process.cwd();
    console.log('');
    console.log(`${C.cyan}${C.bold} AxilJS${C.reset} ${C.gray}development server${C.reset}`);
    console.log(`${C.gray} ─────────────────────────────────────${C.reset}`);
    console.log('');
    if (!validateProject(cwd))
        process.exit(1);
    // Ensure dist/ exists so tsc has somewhere to write
    const distDir = (0, path_1.join)(cwd, 'dist');
    if (!(0, fs_1.existsSync)(distDir))
        (0, fs_1.mkdirSync)(distDir, { recursive: true });
    // ── Initial compile ────────────────────────────────────────────────
    log('Initial compilation...');
    const success = compile(cwd);
    if (!success) {
        logError('Fix compilation errors then save a file to retry.');
        watchFiles(cwd);
        setupShutdown(null);
        return;
    }
    // ── Read port before starting anything ────────────────────────────
    const appPort = readAppPort(cwd);
    // ── Start app server ───────────────────────────────────────────────
    await startServer(cwd);
    // ── Start Studio (optional, non-blocking) ─────────────────────────
    studioInstance = await startStudio(cwd, appPort);
    // ── Watch for changes ──────────────────────────────────────────────
    watchFiles(cwd);
    // ── Register shutdown handlers with studio reference ───────────────
    setupShutdown(studioInstance);
}
//# sourceMappingURL=run.js.map