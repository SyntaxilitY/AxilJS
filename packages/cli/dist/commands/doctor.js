"use strict";
/**
 * axil doctor
 * Diagnoses project for common issues.
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
exports.runDoctor = runDoctor;
const fs_1 = require("fs");
const path_1 = require("path");
const child_process_1 = require("child_process");
const ui = __importStar(require("../ui"));
async function runDoctor() {
    ui.title('doctor', 'Diagnose the project');
    const started = Date.now();
    const spin = ui.spinner('Running diagnostics');
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
    // Check for @axiljs/core
    const pkgPath = (0, path_1.join)(cwd, 'package.json');
    if ((0, fs_1.existsSync)(pkgPath)) {
        const pkg = JSON.parse((0, fs_1.readFileSync)(pkgPath, 'utf-8'));
        const hasCore = pkg.dependencies?.['@axiljs/core'] !== undefined ||
            pkg.devDependencies?.['@axiljs/core'] !== undefined;
        checks.push({
            name: '@axiljs/core dependency',
            pass: hasCore,
            message: hasCore
                ? pkg.dependencies?.['@axiljs/core'] || pkg.devDependencies?.['@axiljs/core']
                : 'Not found in dependencies'
        });
        // Lock file
        // `axil install` delegates to npm (package-lock.json); @axiljs/pm writes @axiljs.lock
        const hasLock = ['axil.lock', '@axiljs.lock', 'package-lock.json']
            .some(f => (0, fs_1.existsSync)((0, path_1.join)(cwd, f)));
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
    spin.stop();
    const passed = checks.filter(c => c.pass).length;
    const failed = checks.filter(c => !c.pass).length;
    ui.table(checks.map(check => [
        `${check.pass ? ui.c.green(ui.sym.tick) : ui.c.red(ui.sym.cross)} ${check.name}`,
        check.pass ? ui.muted(check.message) : ui.c.yellow(check.message)
    ]), { gap: 2 });
    const summary = `${passed}/${checks.length} checks passed`;
    if (failed > 0)
        ui.failed(summary, `${failed} issue(s) found`);
    else
        ui.done(summary, started);
}
//# sourceMappingURL=doctor.js.map