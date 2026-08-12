"use strict";
/**
 * rest install [package]
 * Install packages using the REstJS package manager.
 *
 * Usage:
 *   rest install              → Install all from package.json
 *   rest install express      → Install a specific package
 *   rest install -D nodemon   → Install as devDependency
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.installPackages = installPackages;
const pm_1 = require("@restjs/pm");
const fs_1 = require("fs");
const path_1 = require("path");
/**
 * Install packages.
 *
 * @param packages  Package names to install (empty = install all)
 * @param isDev     Install as devDependency
 */
async function installPackages(packages, isDev = false) {
    const cwd = process.cwd();
    if (packages.length > 0) {
        // Add specific packages to package.json first
        await addToPackageJson(packages, isDev, cwd);
    }
    // Run the installer
    const installer = new pm_1.Installer({ cwd });
    await installer.install({
        includeDev: true,
        verbose: false
    });
}
/**
 * Add packages to package.json before installing.
 */
async function addToPackageJson(packages, isDev, cwd) {
    const pkgPath = (0, path_1.join)(cwd, 'package.json');
    if (!(0, fs_1.existsSync)(pkgPath)) {
        console.error('\x1b[31mError:\x1b[0m No package.json found in current directory.');
        process.exit(1);
    }
    const pkg = JSON.parse((0, fs_1.readFileSync)(pkgPath, 'utf-8'));
    const section = isDev ? 'devDependencies' : 'dependencies';
    if (!pkg[section]) {
        pkg[section] = {};
    }
    for (const packageName of packages) {
        // Parse version if specified: express@4.18.0
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