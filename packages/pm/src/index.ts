/**
 * @axiljs/pm - Public API
 */

export { Installer, defaultCacheDir, legacyCacheDir, verifyIntegrity } from './installer';
export type { InstallOptions, InstallPlacement, InstallResult } from './installer';

export { LockFileManager, calculateChecksum, verifyChecksum } from './lockfile';
export type { LockEntry, LockFile } from './lockfile';

export { RegistryClient, maxSatisfying, satisfiesRange } from './registry';
export type { PackageMetadata } from './registry';

export { parseTar, extractTarball, createTar, maybeGunzip, safeEntryPath } from './tar';
export type { TarEntry, TarEntryType, TarInputEntry, ExtractOptions, ExtractResult } from './tar';
