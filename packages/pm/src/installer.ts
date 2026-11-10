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

import {
  readFileSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  rmSync
} from 'fs';
import { createHash } from 'crypto';
import { homedir } from 'os';
import { join } from 'path';
import { LockFileManager, verifyChecksum, calculateChecksum } from './lockfile';
import { RegistryClient, satisfiesRange } from './registry';
import { extractTarball } from './tar';

// ─── Package JSON ─────────────────────────────────────────────────────────────

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

// ─── Installer ────────────────────────────────────────────────────────────────

export interface InstallOptions {
  // Current working directory (default: process.cwd())
  cwd?: string;

  // Include devDependencies (default: true in dev, false in production)
  includeDev?: boolean;

  // Force re-download even if package is cached (default: false)
  force?: boolean;

  // Show verbose output (default: false)
  verbose?: boolean;

  // Registry base URL or client (default: https://registry.npmjs.org)
  registry?: string | RegistryClient;

  // Tarball cache directory (default: $AXILJS_CACHE_DIR or ~/.axiljs/cache)
  cacheDir?: string;

  // Install transitive dependencies (default: true)
  transitive?: boolean;

  // Suppress console output (default: false)
  silent?: boolean;
}

/** One resolved package version. */
interface ResolvedPackage {
  name: string;
  version: string;
  tarball: string;
  integrity: string;
  shasum: string;
  dependencies: Record<string, string>;
  // Locked SHA-256 checksum (when resolved from the lock file)
  lockedChecksum?: string;
}

/** Where a package version is placed on disk. */
export interface InstallPlacement {
  name: string;
  version: string;
  // Directory relative to the project root, "/"-separated
  // ("node_modules/a" or "node_modules/b/node_modules/a")
  path: string;
}

export interface InstallResult {
  installed: number;
  cached: number;
  failed: number;
  placements: InstallPlacement[];
  errors: Array<{ name: string; range: string; error: Error }>;
}

const MAX_DEPTH = 64;

/** Default cache directory: $AXILJS_CACHE_DIR or ~/.axiljs/cache. */
export function defaultCacheDir(): string {
  if (process.env.AXILJS_CACHE_DIR) return process.env.AXILJS_CACHE_DIR;
  return join(homeDir(), '.axiljs', 'cache');
}

/** Pre-0.3.x cache path, kept readable for back-compat. */
export function legacyCacheDir(): string {
  return join(homeDir(), '.@axiljsjs', 'cache');
}

function homeDir(): string {
  return process.env.HOME || process.env.USERPROFILE || homedir() || process.cwd();
}

/**
 * Verify a registry SRI string ("sha512-<base64>") or a hex sha1 shasum.
 * Unknown/empty values are accepted (nothing to check against).
 */
export function verifyIntegrity(
  data: Buffer,
  integrity: string | undefined,
  shasum: string | undefined,
  packageName: string
): void {
  if (integrity) {
    for (const part of integrity.trim().split(/\s+/)) {
      const dash = part.indexOf('-');
      if (dash === -1) continue;
      const algo = part.slice(0, dash);
      if (!['sha512', 'sha384', 'sha256', 'sha1'].includes(algo)) continue;
      const expected = part.slice(dash + 1);
      const actual = createHash(algo).update(data).digest('base64');
      if (actual === expected) return;
      throw new Error(
        `Integrity check failed for ${packageName} (${algo}).\n` +
          `  Expected: ${expected}\n  Got:      ${actual}`
      );
    }
  }
  if (shasum) {
    const actual = createHash('sha1').update(data).digest('hex');
    if (actual !== shasum.toLowerCase()) {
      throw new Error(
        `Shasum check failed for ${packageName}.\n  Expected: ${shasum}\n  Got:      ${actual}`
      );
    }
  }
}

export class Installer {
  private cwd: string;
  private lockManager: LockFileManager;
  private registry: RegistryClient;
  private cacheDir: string;
  private legacyCacheDir: string;
  private transitive: boolean;
  private silent: boolean;

  constructor(options: InstallOptions = {}) {
    this.cwd = options.cwd || process.cwd();
    this.lockManager = new LockFileManager(this.cwd);
    this.registry =
      options.registry instanceof RegistryClient
        ? options.registry
        : new RegistryClient(options.registry);
    this.transitive = options.transitive !== false;
    this.silent = options.silent === true;

    // Local cache directory: ~/.axiljs/cache (old ~/.@axiljsjs/cache is read-only)
    this.cacheDir = options.cacheDir || defaultCacheDir();
    this.legacyCacheDir = legacyCacheDir();

    // Ensure cache directory exists
    mkdirSync(this.cacheDir, { recursive: true });
  }

  private log(message: string): void {
    if (!this.silent) console.log(message);
  }

  /**
   * Install all dependencies from package.json (plus their dependencies).
   */
  async install(options: InstallOptions = {}): Promise<InstallResult> {
    const { includeDev = true, force = false, verbose = false } = options;

    const pkgPath = join(this.cwd, 'package.json');

    if (!existsSync(pkgPath)) {
      throw new Error(
        `No package.json found in ${this.cwd}.\n` +
          `Run '@axiljs create <name>' to create a new project.`
      );
    }

    // Parse package.json
    const pkgJson: PackageJson = JSON.parse(
      readFileSync(pkgPath, 'utf-8')
    );

    // Collect all packages to install
    const toInstall: Record<string, string> = {
      ...(pkgJson.dependencies || {}),
      ...(includeDev ? pkgJson.devDependencies || {} : {})
    };

    const result: InstallResult = {
      installed: 0,
      cached: 0,
      failed: 0,
      placements: [],
      errors: []
    };

    if (Object.keys(toInstall).length === 0) {
      this.log('[AxilJS PM] No dependencies to install.');
      return result;
    }

    this.log(
      `\n\x1b[36m[AxilJS PM]\x1b[0m Installing ${Object.keys(toInstall).length} packages...\n`
    );

    const nodeModulesDir = join(this.cwd, 'node_modules');
    mkdirSync(nodeModulesDir, { recursive: true });

    // ── 1. Resolve + plan ────────────────────────────────────────────────
    const placements = await this.resolveTree(toInstall, force, verbose, result);
    result.placements = placements.map(p => ({
      name: p.pkg.name,
      version: p.pkg.version,
      path: p.path
    }));

    // ── 2. Fetch + extract (parents before children) ─────────────────────
    const tarballs = new Map<string, { data: Buffer; fromCache: boolean }>();
    const ordered = [...placements].sort(
      (a, b) => a.path.split('/').length - b.path.split('/').length || a.path.localeCompare(b.path)
    );

    for (const placement of ordered) {
      const { pkg } = placement;
      const id = `${pkg.name}@${pkg.version}`;
      try {
        let entry = tarballs.get(id);
        if (!entry) {
          entry = await this.fetchTarball(pkg, force, verbose);
          tarballs.set(id, entry);
        }

        // Update lock file with exact version and checksum
        for (const range of placement.ranges) {
          this.lockManager.set(pkg.name, range, {
            version: pkg.version,
            resolved: pkg.tarball,
            checksum: calculateChecksum(entry.data),
            dependencies: pkg.dependencies
          });
        }

        await this.extractTo(entry.data, join(this.cwd, ...placement.path.split('/')));

        if (entry.fromCache) result.cached++;
        else result.installed++;

        const status = entry.fromCache ? '\x1b[90m(cached)\x1b[0m' : '\x1b[32m✓\x1b[0m';
        const nested = placement.path.split('/node_modules/').length > 1
          ? ` \x1b[90m(${placement.path})\x1b[0m`
          : '';
        this.log(`  ${status} ${id}${nested}`);
      } catch (error) {
        result.failed++;
        result.errors.push({ name: pkg.name, range: placement.ranges[0] || pkg.version, error: error as Error });
        this.log(`  \x1b[31m✗\x1b[0m ${id}: ${(error as Error).message}`);
      }
    }

    // Save updated lock file
    this.lockManager.save();

    // Print summary
    this.log('');
    this.log(
      `\x1b[36m[AxilJS PM]\x1b[0m Done. ` +
        `${result.installed} installed, ${result.cached} from cache` +
        (result.failed > 0 ? `, \x1b[31m${result.failed} failed\x1b[0m` : '') +
        '.'
    );
    this.log('');

    return result;
  }

  // ── Resolution ──────────────────────────────────────────────────────────

  private resolveCache = new Map<string, Promise<ResolvedPackage>>();

  /** Resolve name@range via the lock file (unless forced) or the registry. */
  private resolve(name: string, range: string, force: boolean, verbose: boolean): Promise<ResolvedPackage> {
    const key = `${name}@${range}`;
    let pending = this.resolveCache.get(key);
    if (pending) return pending;

    pending = (async (): Promise<ResolvedPackage> => {
      const locked = this.lockManager.get(name, range);
      if (locked && !force) {
        return {
          name,
          version: locked.version,
          tarball: locked.resolved,
          integrity: '',
          shasum: '',
          dependencies: locked.dependencies || {},
          lockedChecksum: locked.checksum
        };
      }

      if (verbose) this.log(`  Resolving ${name}@${range} from registry...`);
      const metadata = await this.registry.getMetadata(name, range);
      return {
        name,
        version: metadata.version,
        tarball: metadata.dist.tarball,
        integrity: metadata.dist.integrity || '',
        shasum: metadata.dist.shasum || '',
        dependencies: metadata.dependencies || {}
      };
    })();

    this.resolveCache.set(key, pending);
    return pending;
  }

  /**
   * Breadth-first resolution of the whole tree. Root dependencies claim the
   * top-level slots first; a transitive dependency reuses the copy visible
   * from its parent (walking up like Node's resolver) when the version
   * matches its range, is hoisted when the top-level slot is free, and is
   * nested under its parent otherwise.
   */
  private async resolveTree(
    rootDeps: Record<string, string>,
    force: boolean,
    verbose: boolean,
    result: InstallResult
  ): Promise<Array<{ pkg: ResolvedPackage; path: string; ranges: string[] }>> {
    // path → placement
    const placed = new Map<string, { pkg: ResolvedPackage; path: string; ranges: string[] }>();

    type Job = { name: string; range: string; parentPath: string | null; depth: number };
    let queue: Job[] = Object.entries(rootDeps).map(([name, range]) => ({
      name, range, parentPath: null, depth: 0
    }));

    const slot = (base: string | null, name: string): string =>
      base ? `${base}/node_modules/${name}` : `node_modules/${name}`;

    /** Directories Node would search from `parentPath`, nearest first. */
    const lookupChain = (parentPath: string | null, name: string): string[] => {
      const chain: string[] = [];
      let base = parentPath;
      while (base) {
        chain.push(slot(base, name));
        const idx = base.lastIndexOf('/node_modules/');
        base = idx === -1 ? null : base.slice(0, idx);
      }
      chain.push(slot(null, name));
      return chain;
    };

    while (queue.length > 0) {
      const next: Job[] = [];

      // Resolve one BFS level concurrently, place it in declaration order
      const resolved = await Promise.all(
        queue.map(job =>
          this.resolve(job.name, job.range, force, verbose).then(
            pkg => ({ job, pkg, error: null as Error | null }),
            error => ({ job, pkg: null as ResolvedPackage | null, error: error as Error })
          )
        )
      );

      for (const { job, pkg, error } of resolved) {
        if (error || !pkg) {
          result.failed++;
          result.errors.push({ name: job.name, range: job.range, error: error as Error });
          this.log(`  \x1b[31m✗\x1b[0m ${job.name}@${job.range}: ${(error as Error).message}`);
          continue;
        }

        // The nearest copy visible from the parent shadows any further up
        const nearest = lookupChain(job.parentPath, job.name)
          .map(candidate => placed.get(candidate))
          .find(Boolean);

        if (nearest && (nearest.pkg.version === pkg.version || satisfiesRange(nearest.pkg.version, job.range))) {
          if (!nearest.ranges.includes(job.range)) nearest.ranges.push(job.range);
          continue;
        }

        if (job.depth > MAX_DEPTH) {
          result.failed++;
          result.errors.push({
            name: job.name,
            range: job.range,
            error: new Error('Dependency tree too deep (possible cycle)')
          });
          continue;
        }

        // Hoist when nothing is visible yet (the top-level slot is free),
        // otherwise nest under the parent to avoid the conflicting copy
        const path = nearest ? slot(job.parentPath, job.name) : slot(null, job.name);
        if (placed.has(path)) continue;

        placed.set(path, { pkg, path, ranges: [job.range] });

        if (this.transitive) {
          for (const [depName, depRange] of Object.entries(pkg.dependencies || {})) {
            next.push({ name: depName, range: depRange, parentPath: path, depth: job.depth + 1 });
          }
        }
      }

      queue = next;
    }

    return [...placed.values()];
  }

  // ── Fetching ────────────────────────────────────────────────────────────

  private cachePaths(pkg: ResolvedPackage): { primary: string; legacy: string } {
    // Build cache key from package name and exact version
    const cacheKey = `${pkg.name.replace('/', '_').replace('@', '')}_${pkg.version}`;
    return {
      primary: join(this.cacheDir, `${cacheKey}.tgz`),
      legacy: join(this.legacyCacheDir, `${cacheKey}.tgz`)
    };
  }

  private async fetchTarball(
    pkg: ResolvedPackage,
    force: boolean,
    verbose: boolean
  ): Promise<{ data: Buffer; fromCache: boolean }> {
    const { primary, legacy } = this.cachePaths(pkg);

    let data: Buffer | null = null;
    let fromCache = false;

    if (!force) {
      if (existsSync(primary)) data = readFileSync(primary);
      else if (existsSync(legacy)) data = readFileSync(legacy);
      fromCache = data !== null;
    }

    if (!data) {
      if (!pkg.tarball) throw new Error(`No tarball URL for ${pkg.name}@${pkg.version}`);
      if (verbose) this.log(`  Downloading ${pkg.name}@${pkg.version}...`);
      data = await this.registry.download(pkg.tarball);
    }

    // Registry-provided integrity (sha512 SRI / sha1 shasum) — checked for
    // cached tarballs too, whenever the version came from the registry
    verifyIntegrity(data, pkg.integrity, pkg.shasum, pkg.name);

    // Verify integrity against the locked checksum before trusting the
    // tarball (and before overwriting the lock entry with a new checksum)
    if (pkg.lockedChecksum && !force) {
      verifyChecksum(data, pkg.lockedChecksum, pkg.name);
    }

    // Save to cache for future installs
    if (!fromCache || !existsSync(primary)) {
      writeFileSync(primary, data);
    }

    return { data, fromCache };
  }

  // ── Extraction ──────────────────────────────────────────────────────────

  private async extractTo(tarball: Buffer, packageDir: string): Promise<void> {
    // Replace the previous copy so stale files from an older version don't linger
    if (existsSync(packageDir)) rmSync(packageDir, { recursive: true, force: true });
    extractTarball(tarball, packageDir, { strip: 1 });
  }

  /**
   * Extract a tarball into node_modules.
   * npm tarballs contain a 'package/' directory - it is stripped, so the
   * files land in node_modules/<packageName>/ (scoped names included).
   * Entries that would escape that directory are rejected.
   */
  private async extract(
    tarball: Buffer,
    packageName: string,
    nodeModulesDir: string
  ): Promise<void> {
    await this.extractTo(tarball, join(nodeModulesDir, packageName));
  }
}
