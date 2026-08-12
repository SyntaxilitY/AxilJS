/**
 * Package installer.
 * Orchestrates the full install process:
 *   1. Read package.json
 *   2. Resolve versions (from lock file or registry)
 *   3. Download packages (with checksum verification)
 *   4. Extract to node_modules
 *   5. Update lock file
 */
export interface InstallOptions {
    cwd?: string;
    includeDev?: boolean;
    force?: boolean;
    verbose?: boolean;
}
export declare class Installer {
    private cwd;
    private lockManager;
    private registry;
    private cacheDir;
    constructor(options?: InstallOptions);
    /**
     * Install all dependencies from package.json.
     */
    install(options?: InstallOptions): Promise<void>;
    /**
     * Install a single package.
     * Returns true if the package was served from cache.
     */
    private installPackage;
    /**
     * Extract a tarball into node_modules.
     * npm tarballs contain a 'package/' directory - we rename it to the package name.
     *
     * Note: This is a simplified extractor.
     * Full tar/gzip extraction requires the built-in zlib module.
     */
    private extract;
}
//# sourceMappingURL=installer.d.ts.map