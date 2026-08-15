/**
 * Lock file management.
 * Ensures deterministic, reproducible installs.
 *
 * The lock file (@axiljs.lock) records:
 *   - Exact resolved version of every package
 *   - SHA-256 checksum for integrity verification
 *   - Dependency tree for each package
 *
 * If @axiljs.lock exists → use exact versions from it
 * If @axiljs.lock missing → resolve versions, create lock file
 */
export interface LockEntry {
    version: string;
    resolved: string;
    checksum: string;
    dependencies: Record<string, string>;
}
export interface LockFile {
    lockfileVersion: number;
    updatedAt: string;
    packages: Record<string, LockEntry>;
}
export declare class LockFileManager {
    private lockfilePath;
    private data;
    constructor(cwd?: string);
    /**
     * Load lock file from disk.
     * Returns empty lock file if it doesn't exist.
     */
    private load;
    /**
     * Save lock file to disk.
     */
    save(): void;
    /**
     * Check if a package is already locked.
     */
    has(name: string, range: string): boolean;
    /**
     * Get a locked package entry.
     */
    get(name: string, range: string): LockEntry | undefined;
    /**
     * Add or update a package in the lock file.
     */
    set(name: string, range: string, entry: LockEntry): void;
    /**
     * Remove a package from the lock file.
     */
    remove(name: string, range: string): void;
    /**
     * Get all locked packages.
     */
    getAll(): Record<string, LockEntry>;
}
/**
 * Calculate SHA-256 checksum of a buffer.
 * Used to verify downloaded packages haven't been tampered with.
 */
export declare function calculateChecksum(data: Buffer): string;
/**
 * Verify that downloaded data matches the expected checksum.
 * Throws if verification fails.
 */
export declare function verifyChecksum(data: Buffer, expectedChecksum: string, packageName: string): void;
//# sourceMappingURL=lockfile.d.ts.map