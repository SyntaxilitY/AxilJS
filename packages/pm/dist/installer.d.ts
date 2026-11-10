/**
 * Package installer.
 * Orchestrates the full install process:
 *   1. Read package.json
 *   2. Resolve the full dependency tree (from lock file or registry),
 *      deduplicated by name@version
 *   3. Plan a flat node_modules layout; a version that conflicts with the
 *      hoisted one is nested under the package that needs it
 *   4. Download packages (local cache first, checksum/integrity verified)
 *   5. Extract each .tgz into node_modules (node:zlib + built-in tar reader)
 *   6. Update lock file
 *
 * Cache: ~/.axiljs/cache (or $AXILJS_CACHE_DIR). Tarballs cached by older
 * versions under ~/.@axiljsjs/cache are still read, never written.
 */
import { RegistryClient } from './registry';
export interface InstallOptions {
    cwd?: string;
    includeDev?: boolean;
    force?: boolean;
    verbose?: boolean;
    registry?: string | RegistryClient;
    cacheDir?: string;
    transitive?: boolean;
    silent?: boolean;
}
/** Where a package version is placed on disk. */
export interface InstallPlacement {
    name: string;
    version: string;
    path: string;
}
export interface InstallResult {
    installed: number;
    cached: number;
    failed: number;
    placements: InstallPlacement[];
    errors: Array<{
        name: string;
        range: string;
        error: Error;
    }>;
}
/** Default cache directory: $AXILJS_CACHE_DIR or ~/.axiljs/cache. */
export declare function defaultCacheDir(): string;
/** Pre-0.3.x cache path, kept readable for back-compat. */
export declare function legacyCacheDir(): string;
/**
 * Verify a registry SRI string ("sha512-<base64>") or a hex sha1 shasum.
 * Unknown/empty values are accepted (nothing to check against).
 */
export declare function verifyIntegrity(data: Buffer, integrity: string | undefined, shasum: string | undefined, packageName: string): void;
export declare class Installer {
    private cwd;
    private lockManager;
    private registry;
    private cacheDir;
    private legacyCacheDir;
    private transitive;
    private silent;
    constructor(options?: InstallOptions);
    private log;
    /**
     * Install all dependencies from package.json (plus their dependencies).
     */
    install(options?: InstallOptions): Promise<InstallResult>;
    private resolveCache;
    /** Resolve name@range via the lock file (unless forced) or the registry. */
    private resolve;
    /**
     * Breadth-first resolution of the whole tree. Root dependencies claim the
     * top-level slots first; a transitive dependency reuses the copy visible
     * from its parent (walking up like Node's resolver) when the version
     * matches its range, is hoisted when the top-level slot is free, and is
     * nested under its parent otherwise.
     */
    private resolveTree;
    private cachePaths;
    private fetchTarball;
    private extractTo;
    /**
     * Extract a tarball into node_modules.
     * npm tarballs contain a 'package/' directory - it is stripped, so the
     * files land in node_modules/<packageName>/ (scoped names included).
     * Entries that would escape that directory are rejected.
     */
    private extract;
}
//# sourceMappingURL=installer.d.ts.map