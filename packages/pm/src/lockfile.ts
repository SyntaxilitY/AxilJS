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

import {
  readFileSync,
  writeFileSync,
  existsSync
} from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';

// ─── Lock File Types ──────────────────────────────────────────────────────────

export interface LockEntry {
  // Exact version that was resolved
  version: string;

  // Download URL
  resolved: string;

  // SHA-256 checksum of the downloaded tarball
  checksum: string;

  // This package's dependencies (name → version range)
  dependencies: Record<string, string>;
}

export interface LockFile {
  // AxilJS lock file version (for future migration)
  lockfileVersion: number;

  // Timestamp of last update
  updatedAt: string;

  // All locked packages
  // Key: "package-name@version-range"
  packages: Record<string, LockEntry>;
}

// ─── Lock File Manager ────────────────────────────────────────────────────────

const LOCKFILE_NAME = '@axiljs.lock';
const LOCKFILE_VERSION = 1;

export class LockFileManager {
  private lockfilePath: string;
  private data: LockFile;

  constructor(cwd: string = process.cwd()) {
    this.lockfilePath = join(cwd, LOCKFILE_NAME);
    this.data = this.load();
  }

  /**
   * Load lock file from disk.
   * Returns empty lock file if it doesn't exist.
   */
  private load(): LockFile {
    if (!existsSync(this.lockfilePath)) {
      return {
        lockfileVersion: LOCKFILE_VERSION,
        updatedAt: new Date().toISOString(),
        packages: {}
      };
    }

    try {
      const content = readFileSync(this.lockfilePath, 'utf-8');
      return JSON.parse(content) as LockFile;
    } catch {
      console.warn(
        '[AxilJS PM] Warning: Could not parse @axiljs.lock - creating new one'
      );
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
  save(): void {
    this.data.updatedAt = new Date().toISOString();

    // Sort packages alphabetically for consistent diffs
    const sorted: Record<string, LockEntry> = {};
    Object.keys(this.data.packages)
      .sort()
      .forEach(key => {
        sorted[key] = this.data.packages[key];
      });
    this.data.packages = sorted;

    writeFileSync(
      this.lockfilePath,
      JSON.stringify(this.data, null, 2),
      'utf-8'
    );
  }

  /**
   * Check if a package is already locked.
   */
  has(name: string, range: string): boolean {
    return `${name}@${range}` in this.data.packages;
  }

  /**
   * Get a locked package entry.
   */
  get(name: string, range: string): LockEntry | undefined {
    return this.data.packages[`${name}@${range}`];
  }

  /**
   * Add or update a package in the lock file.
   */
  set(name: string, range: string, entry: LockEntry): void {
    this.data.packages[`${name}@${range}`] = entry;
  }

  /**
   * Remove a package from the lock file.
   */
  remove(name: string, range: string): void {
    delete this.data.packages[`${name}@${range}`];
  }

  /**
   * Get all locked packages.
   */
  getAll(): Record<string, LockEntry> {
    return { ...this.data.packages };
  }
}

// ─── Checksum Utilities ───────────────────────────────────────────────────────

/**
 * Calculate SHA-256 checksum of a buffer.
 * Used to verify downloaded packages haven't been tampered with.
 */
export function calculateChecksum(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Verify that downloaded data matches the expected checksum.
 * Throws if verification fails.
 */
export function verifyChecksum(
  data: Buffer,
  expectedChecksum: string,
  packageName: string
): void {
  const actual = calculateChecksum(data);

  if (actual !== expectedChecksum) {
    throw new Error(
      `Checksum verification failed for ${packageName}.\n` +
        `  Expected: ${expectedChecksum}\n` +
        `  Got:      ${actual}\n` +
        `This package may have been tampered with.`
    );
  }
}