"use strict";
/**
 * Lock file management.
 * Ensures deterministic, reproducible installs.
 *
 * The lock file (rest.lock) records:
 *   - Exact resolved version of every package
 *   - SHA-256 checksum for integrity verification
 *   - Dependency tree for each package
 *
 * If rest.lock exists → use exact versions from it
 * If rest.lock missing → resolve versions, create lock file
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.LockFileManager = void 0;
exports.calculateChecksum = calculateChecksum;
exports.verifyChecksum = verifyChecksum;
const fs_1 = require("fs");
const path_1 = require("path");
const crypto_1 = require("crypto");
// ─── Lock File Manager ────────────────────────────────────────────────────────
const LOCKFILE_NAME = 'rest.lock';
const LOCKFILE_VERSION = 1;
class LockFileManager {
    lockfilePath;
    data;
    constructor(cwd = process.cwd()) {
        this.lockfilePath = (0, path_1.join)(cwd, LOCKFILE_NAME);
        this.data = this.load();
    }
    /**
     * Load lock file from disk.
     * Returns empty lock file if it doesn't exist.
     */
    load() {
        if (!(0, fs_1.existsSync)(this.lockfilePath)) {
            return {
                lockfileVersion: LOCKFILE_VERSION,
                updatedAt: new Date().toISOString(),
                packages: {}
            };
        }
        try {
            const content = (0, fs_1.readFileSync)(this.lockfilePath, 'utf-8');
            return JSON.parse(content);
        }
        catch {
            console.warn('[REstJS PM] Warning: Could not parse rest.lock - creating new one');
            return {
                lockfileVersion: LOCKFILE_VERSION,
                updatedAt: new Date().toISOString(),
                packages: {}
            };
        }
    }
    /**
     * Save lock file to disk.
     */
    save() {
        this.data.updatedAt = new Date().toISOString();
        // Sort packages alphabetically for consistent diffs
        const sorted = {};
        Object.keys(this.data.packages)
            .sort()
            .forEach(key => {
            sorted[key] = this.data.packages[key];
        });
        this.data.packages = sorted;
        (0, fs_1.writeFileSync)(this.lockfilePath, JSON.stringify(this.data, null, 2), 'utf-8');
    }
    /**
     * Check if a package is already locked.
     */
    has(name, range) {
        return `${name}@${range}` in this.data.packages;
    }
    /**
     * Get a locked package entry.
     */
    get(name, range) {
        return this.data.packages[`${name}@${range}`];
    }
    /**
     * Add or update a package in the lock file.
     */
    set(name, range, entry) {
        this.data.packages[`${name}@${range}`] = entry;
    }
    /**
     * Remove a package from the lock file.
     */
    remove(name, range) {
        delete this.data.packages[`${name}@${range}`];
    }
    /**
     * Get all locked packages.
     */
    getAll() {
        return { ...this.data.packages };
    }
}
exports.LockFileManager = LockFileManager;
// ─── Checksum Utilities ───────────────────────────────────────────────────────
/**
 * Calculate SHA-256 checksum of a buffer.
 * Used to verify downloaded packages haven't been tampered with.
 */
function calculateChecksum(data) {
    return (0, crypto_1.createHash)('sha256').update(data).digest('hex');
}
/**
 * Verify that downloaded data matches the expected checksum.
 * Throws if verification fails.
 */
function verifyChecksum(data, expectedChecksum, packageName) {
    const actual = calculateChecksum(data);
    if (actual !== expectedChecksum) {
        throw new Error(`Checksum verification failed for ${packageName}.\n` +
            `  Expected: ${expectedChecksum}\n` +
            `  Got:      ${actual}\n` +
            `This package may have been tampered with.`);
    }
}
//# sourceMappingURL=lockfile.js.map