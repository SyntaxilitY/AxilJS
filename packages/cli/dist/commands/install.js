"use strict";
/**
 * axil install [package]
 * Install packages using the AxilJS package manager.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.installPackages = installPackages;
const fs_1 = require("fs");
const path_1 = require("path");
async function installPackages(packages, isDev = false) {
    const cwd = process.cwd();
    if (packages.length > 0) {
        await addToPackageJson(packages, isDev, cwd);
    }
    // Delegate to npm for actual installation
    const { execSync } = require('child_process');
    try {
        execSync('npm install', { cwd, stdio: 'inherit' });
    }
    catch {
        console.error('\x1b[31m[AxilJS]\x1b[0m Installation failed.');
        process.exit(1);
    }
}
async function addToPackageJson(packages, isDev, cwd) {
    const pkgPath = (0, path_1.join)(cwd, 'package.json');
    if (!(0, fs_1.existsSync)(pkgPath)) {
        console.error('\x1b[31mError:\x1b[0m No package.json found.');
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
        pkg[section][name] = `^${version}`;
        console.log(`  \x1b[32m+\x1b[0m Added ${name}@${version} to ${section}`);
    }
    (0, fs_1.writeFileSync)(pkgPath, JSON.stringify(pkg, null, 2), 'utf-8');
}
//# sourceMappingURL=install.js.map