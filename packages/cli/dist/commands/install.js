"use strict";
/**
 * axil install [package]
 * Install packages using the AxilJS package manager.
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
exports.installPackages = installPackages;
const fs_1 = require("fs");
const path_1 = require("path");
const ui = __importStar(require("../ui"));
const exec_1 = require("../utils/exec");
async function installPackages(packages, isDev = false) {
    const cwd = process.cwd();
    const started = Date.now();
    ui.title('install', packages.length > 0 ? `Add ${packages.length} package(s)` : 'Install dependencies');
    if (packages.length > 0) {
        await addToPackageJson(packages, isDev, cwd);
    }
    // Delegate to npm for actual installation
    const spin = ui.spinner('Installing dependencies');
    let result;
    try {
        result = await (0, exec_1.runCaptured)('npm install', cwd);
    }
    catch (error) {
        result = { code: 1, output: error?.message ?? String(error) };
    }
    if (result.code !== 0) {
        spin.fail('Installation failed', 'npm install');
        console.error('');
        (0, exec_1.printCaptured)(result.output, l => console.error(l));
        ui.error('Installation failed.', 'See the npm output above.');
        process.exit(1);
    }
    spin.succeed('Dependencies installed', (0, exec_1.npmSummary)(result.output));
    ui.done('Install done', started);
}
async function addToPackageJson(packages, isDev, cwd) {
    const pkgPath = (0, path_1.join)(cwd, 'package.json');
    if (!(0, fs_1.existsSync)(pkgPath)) {
        ui.error('No package.json found.', 'Run axil install from the project root.');
        process.exit(1);
    }
    const pkg = JSON.parse((0, fs_1.readFileSync)(pkgPath, 'utf-8'));
    const section = isDev ? 'devDependencies' : 'dependencies';
    if (!pkg[section])
        pkg[section] = {};
    for (const packageName of packages) {
        const atIndex = packageName.lastIndexOf('@');
        let name = packageName;
        let version = 'latest';
        if (atIndex > 0) {
            name = packageName.slice(0, atIndex);
            version = packageName.slice(atIndex + 1);
        }
        // Only exact versions get a caret; tags ("latest") and explicit ranges
        // ("^1.2", "~1.2.3", ">=2") are written as-is ("^latest" is invalid).
        pkg[section][name] = /^\d/.test(version) ? `^${version}` : version;
        ui.success(`Added ${ui.c.bold(`${name}@${version}`)} to ${section}`);
    }
    (0, fs_1.writeFileSync)(pkgPath, JSON.stringify(pkg, null, 2), 'utf-8');
}
//# sourceMappingURL=install.js.map