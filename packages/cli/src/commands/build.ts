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

import { execSync } from 'child_process';
import { existsSync, statSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Build the project for production.
 */
export async function buildProject(): Promise<void> {
  const cwd = process.cwd();

  console.log('\n\x1b[36m[REstJS]\x1b[0m Building for production...\n');

  // Ensure tsconfig.json exists
  if (!existsSync(join(cwd, 'tsconfig.json'))) {
    console.error(
      '\x1b[31mError:\x1b[0m No tsconfig.json found.\n' +
        'Run from a REstJS project directory.'
    );

    process.exit(1);
  }

  const start = Date.now();

  // Step 1: Type check
  console.log('  \x1b[90mType checking...\x1b[0m');

  try {
    execSync('npx tsc --noEmit', {
      cwd,
      stdio: 'pipe'
    });

    console.log('  \x1b[32m✓\x1b[0m Type check passed');
  } catch (error: any) {
    console.error('  \x1b[31m✗\x1b[0m Type check failed:\n');
    console.error(error.stdout?.toString() || error.message);
    process.exit(1);
  }

  // Step 2: Compile TypeScript
  console.log('  \x1b[90mCompiling TypeScript...\x1b[0m');

  try {
    execSync('npx tsc', {
      cwd,
      stdio: 'pipe'
    });

    console.log('  \x1b[32m✓\x1b[0m Compilation complete');
  } catch (error: any) {
    console.error('  \x1b[31m✗\x1b[0m Compilation failed:\n');
    console.error(error.stdout?.toString() || error.message);
    process.exit(1);
  }

  // Step 3: Report output
  const distDir = join(cwd, 'dist');

  if (existsSync(distDir)) {
    const size = getDirSize(distDir);
    const duration = Date.now() - start;

    console.log('');

    console.log(
      `\x1b[32m✓\x1b[0m Build complete in \x1b[1m${duration}ms\x1b[0m`
    );

    console.log(
      `  Output: \x1b[36mdist/\x1b[0m (${formatBytes(size)})`
    );

    console.log('');

    console.log('  Start production server:');
    console.log('  \x1b[90mnode dist/main.js\x1b[0m');

    console.log('');
  }
}

/**
 * Calculate total size of a directory recursively.
 */
function getDirSize(dirPath: string): number {
  let total = 0;

  const items = readdirSync(dirPath, {
    withFileTypes: true
  });

  for (const item of items) {
    const itemPath = join(dirPath, item.name);

    if (item.isDirectory()) {
      total += getDirSize(itemPath);
    } else {
      total += statSync(itemPath).size;
    }
  }

  return total;
}

/**
 * Format bytes into human readable string.
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}