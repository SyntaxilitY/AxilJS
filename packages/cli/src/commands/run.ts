/**
 * rest run
 * Development server with hot reload.
 * Watches src/ for TypeScript changes → recompiles → restarts automatically.
 *
 * How it works:
 *   1. Compile the project once on startup
 *   2. Start the compiled server from dist/
 *   3. Watch src/ for .ts file changes
 *   4. On change: recompile only changed files (incremental)
 *   5. Kill old server process
 *   6. Start new server process
 *   7. Show timing and what changed
 *
 * This approach is faster than ts-node because:
 *   - Uses tsc incremental compilation (only recompiles changed files)
 *   - Runs compiled JS directly (no TypeScript overhead at runtime)
 *   - Sub-second restarts for most changes
 */

import { spawn, ChildProcess, execSync } from 'child_process';
import { watch, existsSync, mkdirSync }  from 'fs';
import { join, resolve, relative }       from 'path';

// ─── State ────────────────────────────────────────────────────────────────────

let serverProcess: ChildProcess | null = null;
let restartTimer:  ReturnType<typeof setTimeout> | null = null;
let isCompiling:   boolean = false;
let startCount:    number  = 0;

// Changed files collected during debounce window
const changedFiles: Set<string> = new Set();

// ─── Colors ───────────────────────────────────────────────────────────────────

const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  cyan:   '\x1b[36m',
  blue:   '\x1b[34m',
  gray:   '\x1b[90m'
};

// ─── Logging ──────────────────────────────────────────────────────────────────

function log(msg: string): void {
  const time = new Date().toLocaleTimeString('en-US', { hour12: false });
  console.log(`${C.gray}${time}${C.reset} ${C.cyan}[rest run]${C.reset} ${msg}`);
}

function logError(msg: string): void {
  const time = new Date().toLocaleTimeString('en-US', { hour12: false });
  console.log(`${C.gray}${time}${C.reset} ${C.red}[rest run]${C.reset} ${msg}`);
}

function logSuccess(msg: string): void {
  const time = new Date().toLocaleTimeString('en-US', { hour12: false });
  console.log(`${C.gray}${time}${C.reset} ${C.green}[rest run]${C.reset} ${msg}`);
}

// ─── Compile ──────────────────────────────────────────────────────────────────

/**
 * Run TypeScript compiler.
 * Uses --incremental so only changed files are recompiled.
 * Much faster than full compilation on every save.
 *
 * @returns true if compilation succeeded, false if there were errors
 */
function compile(cwd: string): boolean {
  const start = Date.now();

  try {
    // --incremental uses .tsbuildinfo cache for speed
    // --noEmitOnError ensures broken code does not replace working dist/
    execSync('npx tsc --incremental --noEmitOnError', {
      cwd,
      stdio: 'pipe'  // Capture output — we handle errors ourselves
    });

    const duration = Date.now() - start;
    logSuccess(
      `Compiled ${C.bold}${changedFiles.size > 0 ? changedFiles.size + ' file(s)' : 'project'}${C.reset}${C.green} in ${C.bold}${duration}ms${C.reset}`
    );

    changedFiles.clear();
    return true;

  } catch (error: any) {
    const duration = Date.now() - start;
    const output   = error.stdout?.toString() || '';
    const stderr   = error.stderr?.toString()  || '';

    logError(`Compilation failed in ${duration}ms`);

    // Print TypeScript errors cleanly
    const errorOutput = output || stderr;
    if (errorOutput) {
      // Highlight error lines
      errorOutput.split('\n').forEach((line: string) => {
        if (line.includes('error TS')) {
          console.log(`  ${C.red}${line}${C.reset}`);
        } else if (line.trim()) {
          console.log(`  ${C.gray}${line}${C.reset}`);
        }
      });
    }

    logError('Server NOT restarted — fix the errors above');
    changedFiles.clear();
    return false;
  }
}

// ─── Server Process ───────────────────────────────────────────────────────────

/**
 * Find the entry point in dist/.
 * Looks for dist/main.js first, then dist/server.js, then dist/index.js.
 */
function findEntryPoint(cwd: string): string | null {
  const candidates = [
    join(cwd, 'dist', 'main.js'),
    join(cwd, 'dist', 'server.js'),
    join(cwd, 'dist', 'index.js'),
    join(cwd, 'dist', 'src', 'main.js'),
    join(cwd, 'dist', 'src', 'server.js'),
    join(cwd, 'dist', 'src', 'index.js')
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * Start the server process from compiled dist/.
 * Kills the old process first if one is running.
 */
async function startServer(cwd: string): Promise<void> {
  // Kill existing server
  if (serverProcess) {
    serverProcess.kill('SIGTERM');

    // Wait briefly for graceful shutdown
    await new Promise<void>(resolve => {
      const timer = setTimeout(() => {
        // Force kill if still alive after 2 seconds
        if (serverProcess) {
          serverProcess.kill('SIGKILL');
        }
        resolve();
      }, 2000);

      serverProcess!.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });

    serverProcess = null;
  }

  // Find entry point
  const entry = findEntryPoint(cwd);

  if (!entry) {
    logError(
      'Could not find entry point.\n' +
      '  Looked for: dist/main.js, dist/server.js, dist/index.js\n' +
      '  Make sure your tsconfig.json outDir is set to "./dist"'
    );
    return;
  }

  startCount++;
  const relEntry = relative(cwd, entry);

  if (startCount === 1) {
    log(`Starting ${C.bold}${relEntry}${C.reset}`);
  } else {
    log(`Restarting ${C.bold}${relEntry}${C.reset} ${C.gray}(restart #${startCount - 1})${C.reset}`);
  }

  // Spawn the server
  serverProcess = spawn('node', [entry], {
    cwd,
    stdio:  'inherit',   // Share parent's stdin/stdout/stderr
    env: {
      ...process.env,
      NODE_ENV:       process.env.NODE_ENV || 'development',
      FORCE_COLOR:    '1',  // Keep colors in child process
      NODE_NO_WARNINGS: '1' // Suppress Node warnings
    }
  });

  serverProcess.on('error', (err) => {
    logError(`Failed to start server: ${err.message}`);
  });

  serverProcess.on('exit', (code, signal) => {
    if (signal === 'SIGTERM' || signal === 'SIGKILL') {
      // Expected kill during restart — do not log
      return;
    }

    if (code !== 0 && code !== null) {
      logError(`Server exited with code ${code}`);
    }
  });
}

// ─── File Watcher ─────────────────────────────────────────────────────────────

/**
 * Watch the src/ directory for TypeScript file changes.
 * Debounces rapid saves (multiple files saved in quick succession).
 */
function watchFiles(cwd: string): void {
  const srcDir = join(cwd, 'src');

  if (!existsSync(srcDir)) {
    logError(`src/ directory not found at ${srcDir}`);
    return;
  }

  log(`Watching ${C.bold}src/${C.reset} for changes...`);

  watch(srcDir, { recursive: true }, (event, filename) => {
    if (!filename) return;

    // Only react to TypeScript files
    if (!filename.endsWith('.ts') && !filename.endsWith('.tsx')) return;

    // Track which files changed
    changedFiles.add(filename);

    // Debounce — collect all changes within 150ms then compile once
    if (restartTimer) {
      clearTimeout(restartTimer);
    }

    restartTimer = setTimeout(async () => {
      if (isCompiling) return;
      isCompiling = true;

      // Show what changed
      const files = Array.from(changedFiles);
      if (files.length === 1) {
        log(`Changed: ${C.yellow}${files[0]}${C.reset}`);
      } else {
        log(`Changed: ${C.yellow}${files.length} files${C.reset}`);
        files.forEach(f => console.log(`  ${C.gray}→ ${f}${C.reset}`));
      }

      // Recompile
      const success = compile(cwd);

      if (success) {
        // Restart server with new compiled code
        await startServer(cwd);
      }

      isCompiling = false;
    }, 150);
  });
}

// ─── Initial Setup Check ──────────────────────────────────────────────────────

/**
 * Validate that this is a REstJS project.
 */
function validateProject(cwd: string): boolean {
  // Check package.json exists
  if (!existsSync(join(cwd, 'package.json'))) {
    logError('No package.json found. Run this from a REstJS project directory.');
    return false;
  }

  // Check tsconfig.json exists
  if (!existsSync(join(cwd, 'tsconfig.json'))) {
    logError('No tsconfig.json found. Run this from a REstJS project directory.');
    return false;
  }

  // Check src/ directory exists
  if (!existsSync(join(cwd, 'src'))) {
    logError('No src/ directory found.');
    return false;
  }

  return true;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

/**
 * Start the REstJS development server with hot reload.
 */
export async function runDev(): Promise<void> {
  const cwd = process.cwd();

  console.log('');
  console.log(`${C.cyan}${C.bold} REstJS${C.reset} ${C.gray}development server${C.reset}`);
  console.log(`${C.gray} ─────────────────────────────────────${C.reset}`);
  console.log('');

  // Validate project structure
  if (!validateProject(cwd)) {
    process.exit(1);
  }

  // Ensure dist/ directory exists
  const distDir = join(cwd, 'dist');
  if (!existsSync(distDir)) {
    mkdirSync(distDir, { recursive: true });
  }

  // Step 1 — Initial compilation
  log('Initial compilation...');
  const success = compile(cwd);

  if (!success) {
    logError('Fix compilation errors then save a file to retry.');
    // Keep watching even if initial compile fails
    watchFiles(cwd);
    setupShutdown();
    return;
  }

  // Step 2 — Start server
  await startServer(cwd);

  // Step 3 — Watch for changes
  watchFiles(cwd);

  // Step 4 — Setup clean shutdown
  setupShutdown();
}

/**
 * Handle SIGINT (Ctrl+C) gracefully.
 */
function setupShutdown(): void {
  process.on('SIGINT', async () => {
    console.log('');
    log('Shutting down...');

    if (serverProcess) {
      serverProcess.kill('SIGTERM');

      await new Promise<void>(resolve => {
        const timer = setTimeout(() => {
          serverProcess?.kill('SIGKILL');
          resolve();
        }, 3000);

        serverProcess!.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }

    console.log('');
    process.exit(0);
  });
}