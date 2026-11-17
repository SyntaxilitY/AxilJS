"use strict";
/**
 * axil run
 * Development server with hot reload and automatic Studio launcher.
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
exports.readEnvValue = readEnvValue;
exports.readAppPort = readAppPort;
exports.runDev = runDev;
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const path_1 = require("path");
const url_1 = require("url");
const ui = __importStar(require("../ui"));
const env_1 = require("../utils/env");
// ── State ─────────────────────────────────────────────────────────────────────
let serverProcess = null;
let restartTimer = null;
let isCompiling = false;
let startCount = 0;
let studioInstance = null;
let studioAttempted = false;
const changedFiles = new Set();
// ── Logging ───────────────────────────────────────────────────────────────────
// Compact timestamped one-liners, e.g. "  12:04:31 ✔ Restarted in 320ms".
// The app's own output (child process stdio) passes through untouched.
function stamped(icon, msg, details) {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    console.log(`  ${ui.muted(time)} ${icon} ${msg}${details ? `  ${ui.muted(details)}` : ''}`);
}
function log(msg, details) {
    stamped(ui.muted(ui.sym.arrow), msg, details);
}
function logWarn(msg, details) {
    stamped(ui.c.yellow(ui.sym.warn), ui.c.yellow(msg), details);
}
function logError(msg, details) {
    stamped(ui.c.red(ui.sym.cross), ui.c.red(msg), details);
}
function logSuccess(msg, details) {
    stamped(ui.c.green(ui.sym.tick), msg, details);
}
/** "src/a.ts" · "src/a.ts, src/b.ts" · "src/a.ts, src/b.ts +3 more" */
function describeChanges(files) {
    if (files.length === 0)
        return 'project';
    const shown = files.slice(0, 2).map(f => f.replace(/\\/g, '/'));
    return shown.join(', ') + (files.length > 2 ? ` +${files.length - 2} more` : '');
}
// ── Helpers ───────────────────────────────────────────────────────────────────
// Values are unquoted (PORT="4000" → 4000) and inline comments stripped.
function readEnvValue(cwd, key) {
    const value = (0, env_1.readEnvFile)(cwd)[key];
    return value === undefined || value === '' ? undefined : value;
}
function readAppPort(cwd) {
    const raw = readEnvValue(cwd, 'PORT');
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isNaN(n) ? 3000 : n;
}
// ── Dynamic Studio Loader ─────────────────────────────────────────────────────
async function loadStudioClass(cwd) {
    const dynamicImport = new Function('specifier', 'return import(specifier)');
    // 1. Try standard package name
    try {
        const mod = typeof require !== 'undefined'
            ? require('@axiljs/studio')
            : await dynamicImport('@axiljs/studio');
        if (mod.StudioServer)
            return mod.StudioServer;
        if (mod.default?.StudioServer)
            return mod.default.StudioServer;
    }
    catch { }
    // 2. Try project-local node_modules
    try {
        const localPath = (0, path_1.join)(cwd, 'node_modules', '@axiljs', 'studio', 'dist', 'index.js');
        if ((0, fs_1.existsSync)(localPath)) {
            const mod = typeof require !== 'undefined'
                ? require(localPath)
                : await dynamicImport((0, url_1.pathToFileURL)(localPath).href);
            if (mod.StudioServer)
                return mod.StudioServer;
            if (mod.default?.StudioServer)
                return mod.default.StudioServer;
        }
    }
    catch { }
    // 3. Try monorepo sibling directory (packages/studio/dist/index.js)
    try {
        const currentDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
        const monorepoPath = (0, path_1.resolve)(currentDir, '..', '..', '..', 'studio', 'dist', 'index.js');
        if ((0, fs_1.existsSync)(monorepoPath)) {
            const mod = typeof require !== 'undefined'
                ? require(monorepoPath)
                : await dynamicImport((0, url_1.pathToFileURL)(monorepoPath).href);
            if (mod.StudioServer)
                return mod.StudioServer;
            if (mod.default?.StudioServer)
                return mod.default.StudioServer;
        }
    }
    catch { }
    return null;
}
async function startStudio(cwd, appPort) {
    try {
        const StudioServer = await loadStudioClass(cwd);
        if (!StudioServer) {
            log('Studio skipped', '@axiljs/studio not installed: npm install -D @axiljs/studio');
            return null;
        }
        const pkgPath = (0, path_1.join)(cwd, 'package.json');
        const appName = (0, fs_1.existsSync)(pkgPath)
            ? JSON.parse((0, fs_1.readFileSync)(pkgPath, 'utf-8')).name ?? 'axiljs-app'
            : 'axiljs-app';
        let dbDriver;
        let dbFile;
        let dbUrl;
        const rawUrl = readEnvValue(cwd, 'DATABASE_URL');
        const rawFile = readEnvValue(cwd, 'DATABASE_FILENAME');
        if (rawUrl) {
            dbUrl = rawUrl;
            if (dbUrl.startsWith('postgres') || dbUrl.startsWith('postgresql')) {
                dbDriver = 'postgres';
            }
            else if (dbUrl.startsWith('mysql')) {
                dbDriver = 'mysql';
            }
        }
        if (rawFile) {
            dbDriver = 'sqlite';
            dbFile = rawFile;
        }
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
        return studio;
    }
    catch (err) {
        logWarn('Studio error', err.message);
        return null;
    }
}
/** Run tsc; prints nothing (callers report success/failure their own way). */
function compile(cwd) {
    const start = Date.now();
    try {
        (0, child_process_1.execSync)('npx tsc --incremental --noEmitOnError', {
            cwd,
            stdio: 'pipe'
        });
        return { ok: true, duration: Date.now() - start, output: '' };
    }
    catch (error) {
        const output = error.stdout?.toString() ?? '';
        const stderr = error.stderr?.toString() ?? '';
        return { ok: false, duration: Date.now() - start, output: output || stderr };
    }
}
/** tsc diagnostics: "error TS…" lines red, the rest muted. */
function printCompileErrors(output) {
    for (const line of output.split('\n')) {
        const text = line.replace(/\s+$/, '');
        if (text.includes('error TS'))
            console.log(`    ${ui.c.red(text)}`);
        else if (text.trim())
            console.log(`    ${ui.muted(text)}`);
    }
}
// ── Entry Point Finder ────────────────────────────────────────────────────────
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
// ── App Server Process ────────────────────────────────────────────────────────
// A crashed child never emits 'exit' again, so waiting on it would always
// hit the kill timeout (and the 'exit' listener would never fire).
function hasExited(child) {
    return child.exitCode !== null || child.signalCode !== null;
}
/**
 * (Re)start the app. `announce` runs right before the child is spawned so
 * the CLI's status line comes before the app's own output.
 */
async function startServer(cwd, announce) {
    if (serverProcess && !hasExited(serverProcess)) {
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
    }
    serverProcess = null;
    const entry = findEntryPoint(cwd);
    if (!entry) {
        logError('Could not find entry point (dist/main.js).');
        return false;
    }
    startCount++;
    announce((0, path_1.relative)(cwd, entry).replace(/\\/g, '/'), startCount - 1);
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
    return true;
}
// ── Watcher ───────────────────────────────────────────────────────────────────
function watchFiles(cwd) {
    const srcDir = (0, path_1.join)(cwd, 'src');
    if (!(0, fs_1.existsSync)(srcDir)) {
        logError(`src/ directory not found at ${srcDir}`);
        return;
    }
    log(`Watching ${ui.path('src/')} for changes`, 'Ctrl+C to stop');
    (0, fs_1.watch)(srcDir, { recursive: true }, (event, filename) => {
        if (!filename)
            return;
        if (!filename.endsWith('.ts') && !filename.endsWith('.tsx'))
            return;
        changedFiles.add(filename);
        scheduleRebuild(cwd);
    });
}
function scheduleRebuild(cwd) {
    if (restartTimer)
        clearTimeout(restartTimer);
    restartTimer = setTimeout(async () => {
        // A rebuild/restart is still in progress — retry later instead of
        // dropping this change (otherwise the save is silently ignored).
        if (isCompiling) {
            scheduleRebuild(cwd);
            return;
        }
        isCompiling = true;
        const files = Array.from(changedFiles);
        const changes = describeChanges(files);
        changedFiles.clear();
        const started = Date.now();
        try {
            const result = compile(cwd);
            if (!result.ok) {
                logError(`Compilation failed in ${ui.formatDuration(result.duration)}`, changes);
                printCompileErrors(result.output);
                logWarn('Server not restarted', 'fix the errors above and save again');
            }
            else {
                await startServer(cwd, (relEntry, restarts) => {
                    const took = ui.formatDuration(Date.now() - started);
                    if (restarts === 0)
                        logSuccess(`Started ${ui.path(relEntry)} in ${took}`, changes);
                    else
                        logSuccess(`Restarted in ${took}`, `${changes} ${ui.sym.dot} #${restarts}`);
                });
                // The first compile failed, so Studio was never started — start it
                // now that the project builds (exactly once).
                if (!studioInstance && !studioAttempted) {
                    studioAttempted = true;
                    studioInstance = await startStudio(cwd, readAppPort(cwd));
                }
            }
        }
        finally {
            isCompiling = false;
        }
    }, 150);
}
// ── Validation ────────────────────────────────────────────────────────────────
function validateProject(cwd) {
    const hint = 'Run axil run from the root of an AxilJS project.';
    if (!(0, fs_1.existsSync)((0, path_1.join)(cwd, 'package.json'))) {
        ui.error('No package.json found.', hint);
        return false;
    }
    if (!(0, fs_1.existsSync)((0, path_1.join)(cwd, 'tsconfig.json'))) {
        ui.error('No tsconfig.json found.', hint);
        return false;
    }
    if (!(0, fs_1.existsSync)((0, path_1.join)(cwd, 'src'))) {
        ui.error('No src/ directory found.', hint);
        return false;
    }
    return true;
}
// ── Shutdown ──────────────────────────────────────────────────────────────────
function setupShutdown(studio) {
    process.removeAllListeners('SIGINT');
    process.removeAllListeners('SIGTERM');
    async function shutdown(signal) {
        ui.line();
        log(`${signal} received — shutting down...`);
        // Studio may have been started after setup (first compile failed)
        const activeStudio = studio ?? studioInstance;
        if (activeStudio) {
            try {
                await activeStudio.stop();
            }
            catch { }
        }
        if (serverProcess && !hasExited(serverProcess)) {
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
        ui.line();
        process.exit(0);
    }
    process.on('SIGINT', () => { void shutdown('SIGINT'); });
    process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
}
// ── Main Entry ────────────────────────────────────────────────────────────────
async function runDev() {
    const cwd = process.cwd();
    ui.title('run', 'Development server with hot reload');
    if (!validateProject(cwd))
        process.exit(1);
    const distDir = (0, path_1.join)(cwd, 'dist');
    if (!(0, fs_1.existsSync)(distDir))
        (0, fs_1.mkdirSync)(distDir, { recursive: true });
    const spin = ui.spinner('Initial compilation');
    const result = compile(cwd);
    if (!result.ok) {
        spin.fail('Initial compilation failed', ui.formatDuration(result.duration));
        printCompileErrors(result.output);
        ui.line();
        logWarn('Fix compilation errors then save a file to retry.');
        watchFiles(cwd);
        setupShutdown(null);
        return;
    }
    spin.succeed('Compiled project', ui.formatDuration(result.duration));
    const appPort = readAppPort(cwd);
    ui.keyValue([['App', ui.cmd(`http://localhost:${appPort}`)]]);
    ui.line();
    // 1. Start App Server
    await startServer(cwd, relEntry => log(`Starting ${ui.path(relEntry)}`));
    // 2. Start Studio
    studioAttempted = true;
    studioInstance = await startStudio(cwd, appPort);
    // 3. Watch for changes
    watchFiles(cwd);
    // 4. Register graceful shutdown
    setupShutdown(studioInstance);
}
//# sourceMappingURL=run.js.map