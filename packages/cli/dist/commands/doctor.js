"use strict";
/**
 * axil doctor
 * Diagnoses project for common issues.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDoctor = runDoctor;
const fs_1 = require("fs");
const path_1 = require("path");
const child_process_1 = require("child_process");
async function runDoctor() {
    console.log('\n\x1b[36m[AxilJS]\x1b[0m Running diagnostics...\n');
    const checks = [];
    const cwd = process.cwd();
    // Node.js version
    const nodeVersion = process.version;
    const nodeMajor = parseInt(nodeVersion.slice(1));
    checks.push({
        name: 'Node.js version',
        pass: nodeMajor >= 18,
        message: `${nodeVersion} ${nodeMajor >= 18 ? '(OK)' : '(need >= 18)'}`
    });
    // TypeScript
    let tsVersion = 'not found';
    let hasTs = false;
    try {
        tsVersion = (0, child_process_1.execSync)('npx tsc --version', { stdio: 'pipe' }).toString().trim();
        hasTs = true;
    }
    catch { }
    checks.push({ name: 'TypeScript', pass: hasTs, message: tsVersion });
    // Project files
    const requiredFiles = [
        { file: 'package.json', name: 'package.json' },
        { file: 'tsconfig.json', name: 'tsconfig.json' },
        { file: 'src/main.ts', name: 'src/main.ts (entry point)' }
    ];
    for (const { file, name } of requiredFiles) {
        const exists = (0, fs_1.existsSync)((0, path_1.join)(cwd, file));
        checks.push({ name, pass: exists, message: exists ? 'Found' : 'Missing' });
    }
    // Check for @axil/core
    const pkgPath = (0, path_1.join)(cwd, 'package.json');
    if ((0, fs_1.existsSync)(pkgPath)) {
        const pkg = JSON.parse((0, fs_1.readFileSync)(pkgPath, 'utf-8'));
        const hasCore = pkg.dependencies?.['@axil/core'] !== undefined ||
            pkg.devDependencies?.['@axil/core'] !== undefined;
        checks.push({
            name: '@axil/core dependency',
            pass: hasCore,
            message: hasCore
                ? pkg.dependencies?.['@axil/core'] || pkg.devDependencies?.['@axil/core']
                : 'Not found in dependencies'
        });
        // Lock file
        const hasLock = (0, fs_1.existsSync)((0, path_1.join)(cwd, 'axil.lock'));
        checks.push({
            name: 'axil.lock (deterministic installs)',
            pass: hasLock,
            message: hasLock ? 'Found' : 'Missing — run axil install'
        });
    }
    // .env protection
    const hasGitignore = (0, fs_1.existsSync)((0, path_1.join)(cwd, '.gitignore'));
    let envProtected = false;
    if (hasGitignore) {
        const gitignore = (0, fs_1.readFileSync)((0, path_1.join)(cwd, '.gitignore'), 'utf-8');
        envProtected = gitignore.includes('.env');
    }
    checks.push({
        name: '.env protected in .gitignore',
        pass: envProtected,
        message: envProtected ? 'Protected' : '.env not in .gitignore'
    });
    // Print results
    const passed = checks.filter(c => c.pass).length;
    const failed = checks.filter(c => !c.pass).length;
    for (const check of checks) {
        const icon = check.pass ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
        console.log(`  ${icon} ${check.name.padEnd(35)} ${check.message}`);
    }
    console.log('');
    console.log(`  ${passed}/${checks.length} checks passed` +
        (failed > 0 ? ` \x1b[31m(${failed} issues found)\x1b[0m` : ' \x1b[32m✓\x1b[0m'));
    console.log('');
}
//# sourceMappingURL=doctor.js.map