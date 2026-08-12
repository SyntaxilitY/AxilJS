/**
 * rest install [package]
 * Install packages using the REstJS package manager.
 *
 * Usage:
 *   rest install              → Install all from package.json
 *   rest install express      → Install a specific package
 *   rest install -D nodemon   → Install as devDependency
 */
/**
 * Install packages.
 *
 * @param packages  Package names to install (empty = install all)
 * @param isDev     Install as devDependency
 */
export declare function installPackages(packages: string[], isDev?: boolean): Promise<void>;
//# sourceMappingURL=install.d.ts.map