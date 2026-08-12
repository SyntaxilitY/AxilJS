/**
 * rest doctor
 * Diagnoses the current project for common issues.
 * Checks environment, dependencies, and configuration.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';

interface Check {
  name: string;
  pass: boolean;
  message: string;
}

/**
 * Run diagnostics on the current project.
 */
export async function runDoctor(): Promise<void> {
  console.log('\n\x1b[36m[REstJS]\x1b[0m Running diagnostics...\n');

  const checks: Check[] = [];
  const cwd = process.cwd();

  // ── Environment Checks ──────────────────────────────────────────────────────

  // Node.js version
  const nodeVersion = process.version;
  const nodeMajor = parseInt(nodeVersion.slice(1));
  checks.push({
    name: 'Node.js version',
    pass: nodeMajor >= 18,
    message: `${nodeVersion} ${nodeMajor >= 18 ? '(OK)' : '(need >= 18)'}`
  });

  // TypeScript installed
  let tsVersion = 'not found';
  let hasTs = false;
  try {
    tsVersion = execSync('npx tsc --version', { stdio: 'pipe' })
      .toString()
      .trim();
    hasTs = true;
  } catch {
    // TypeScript not available
  }
  checks.push({
    name: 'TypeScript',
    pass: hasTs,
    message: tsVersion
  });

  // ── Project File Checks ─────────────────────────────────────────────────────

  const requiredFiles = [
    { file: 'package.json', name: 'package.json' },
    { file: 'tsconfig.json', name: 'tsconfig.json' },
    { file: 'src/main.ts', name: 'src/main.ts (entry point)' }
  ];

  for (const { file, name } of requiredFiles) {
    const exists = existsSync(join(cwd, file));
    checks.push({
      name,
      pass: exists,
      message: exists ? 'Found' : 'Missing'
    });
  }

  // ── package.json Checks ─────────────────────────────────────────────────────

  const pkgPath = join(cwd, 'package.json');
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

    // Check for @restjs/core
    const hasCore =
      pkg.dependencies?.['@restjs/core'] !== undefined ||
      pkg.devDependencies?.['@restjs/core'] !== undefined;

    checks.push({
      name: '@restjs/core dependency',
      pass: hasCore,
      message: hasCore
        ? pkg.dependencies?.['@restjs/core'] || pkg.devDependencies?.['@restjs/core']
        : 'Not found in dependencies'
    });

    // Check for lock file
    const hasLock = existsSync(join(cwd, 'rest.lock'));
    checks.push({
      name: 'rest.lock (deterministic installs)',
      pass: hasLock,
      message: hasLock ? 'Found' : 'Missing - run rest install'
    });
  }

  // ── Security Checks ─────────────────────────────────────────────────────────

  // Check for .env file exposure
  const hasGitignore = existsSync(join(cwd, '.gitignore'));
  let envProtected = false;

  if (hasGitignore) {
    const gitignore = readFileSync(join(cwd, '.gitignore'), 'utf-8');
    envProtected = gitignore.includes('.env');
  }

  checks.push({
    name: '.env protected in .gitignore',
    pass: envProtected,
    message: envProtected
      ? 'Protected'
      : hasGitignore
      ? '.env not in .gitignore - add it!'
      : 'No .gitignore found'
  });

    // ── Print Results ───────────────────────────────────────────────────────────

  const passed = checks.filter(c => c.pass).length;
  const failed = checks.filter(c => !c.pass).length;

  for (const check of checks) {
    const icon = check.pass
      ? '\x1b[32m✓\x1b[0m'
      : '\x1b[31m✗\x1b[0m';

    const name = check.name.padEnd(35);

    console.log(`  ${icon} ${name} ${check.message}`);
  }

  console.log('');

  console.log(
    `  ${passed}/${checks.length} checks passed` +
      (failed > 0
        ? ` \x1b[31m(${failed} issues found)\x1b[0m`
        : ' \x1b[32m✓\x1b[0m')
  );

  console.log('');
}