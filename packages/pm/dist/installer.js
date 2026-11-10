"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.Installer = void 0;
exports.defaultCacheDir = defaultCacheDir;
exports.legacyCacheDir = legacyCacheDir;
exports.verifyIntegrity = verifyIntegrity;
const fs_1 = require("fs");
const crypto_1 = require("crypto");
const os_1 = require("os");
const path_1 = require("path");
const lockfile_1 = require("./lockfile");
const registry_1 = require("./registry");
const tar_1 = require("./tar");
const MAX_DEPTH = 64;
/** Default cache directory: $AXILJS_CACHE_DIR or ~/.axiljs/cache. */
function defaultCacheDir() {
    if (process.env.AXILJS_CACHE_DIR)
        return process.env.AXILJS_CACHE_DIR;
    return (0, path_1.join)(homeDir(), '.axiljs', 'cache');
}
/** Pre-0.3.x cache path, kept readable for back-compat. */
function legacyCacheDir() {
    return (0, path_1.join)(homeDir(), '.@axiljsjs', 'cache');
}
function homeDir() {
    return process.env.HOME || process.env.USERPROFILE || (0, os_1.homedir)() || process.cwd();
}
/**
 * Verify a registry SRI string ("sha512-<base64>") or a hex sha1 shasum.
 * Unknown/empty values are accepted (nothing to check against).
 */
function verifyIntegrity(data, integrity, shasum, packageName) {
    if (integrity) {
        for (const part of integrity.trim().split(/\s+/)) {
            const dash = part.indexOf('-');
            if (dash === -1)
                continue;
            const algo = part.slice(0, dash);
            if (!['sha512', 'sha384', 'sha256', 'sha1'].includes(algo))
                continue;
            const expected = part.slice(dash + 1);
            const actual = (0, crypto_1.createHash)(algo).update(data).digest('base64');
            if (actual === expected)
                return;
            throw new Error(`Integrity check failed for ${packageName} (${algo}).\n` +
                `  Expected: ${expected}\n  Got:      ${actual}`);
        }
    }
    if (shasum) {
        const actual = (0, crypto_1.createHash)('sha1').update(data).digest('hex');
        if (actual !== shasum.toLowerCase()) {
            throw new Error(`Shasum check failed for ${packageName}.\n  Expected: ${shasum}\n  Got:      ${actual}`);
        }
    }
}
class Installer {
    cwd;
    lockManager;
    registry;
    cacheDir;
    legacyCacheDir;
    transitive;
    silent;
    constructor(options = {}) {
        this.cwd = options.cwd || process.cwd();
        this.lockManager = new lockfile_1.LockFileManager(this.cwd);
        this.registry =
            options.registry instanceof registry_1.RegistryClient
                ? options.registry
                : new registry_1.RegistryClient(options.registry);
        this.transitive = options.transitive !== false;
        this.silent = options.silent === true;
        // Local cache directory: ~/.axiljs/cache (old ~/.@axiljsjs/cache is read-only)
        this.cacheDir = options.cacheDir || defaultCacheDir();
        this.legacyCacheDir = legacyCacheDir();
        // Ensure cache directory exists
        (0, fs_1.mkdirSync)(this.cacheDir, { recursive: true });
    }
    log(message) {
        if (!this.silent)
            console.log(message);
    }
    /**
     * Install all dependencies from package.json (plus their dependencies).
     */
    async install(options = {}) {
        const { includeDev = true, force = false, verbose = false } = options;
        const pkgPath = (0, path_1.join)(this.cwd, 'package.json');
        if (!(0, fs_1.existsSync)(pkgPath)) {
            throw new Error(`No package.json found in ${this.cwd}.\n` +
                `Run '@axiljs create <name>' to create a new project.`);
        }
        // Parse package.json
        const pkgJson = JSON.parse((0, fs_1.readFileSync)(pkgPath, 'utf-8'));
        // Collect all packages to install
        const toInstall = {
            ...(pkgJson.dependencies || {}),
            ...(includeDev ? pkgJson.devDependencies || {} : {})
        };
        const result = {
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
        this.log(`\n\x1b[36m[AxilJS PM]\x1b[0m Installing ${Object.keys(toInstall).length} packages...\n`);
        const nodeModulesDir = (0, path_1.join)(this.cwd, 'node_modules');
        (0, fs_1.mkdirSync)(nodeModulesDir, { recursive: true });
        // ── 1. Resolve + plan ────────────────────────────────────────────────
        const placements = await this.resolveTree(toInstall, force, verbose, result);
        result.placements = placements.map(p => ({
            name: p.pkg.name,
            version: p.pkg.version,
            path: p.path
        }));
        // ── 2. Fetch + extract (parents before children) ─────────────────────
        const tarballs = new Map();
        const ordered = [...placements].sort((a, b) => a.path.split('/').length - b.path.split('/').length || a.path.localeCompare(b.path));
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
                        checksum: (0, lockfile_1.calculateChecksum)(entry.data),
                        dependencies: pkg.dependencies
                    });
                }
                await this.extractTo(entry.data, (0, path_1.join)(this.cwd, ...placement.path.split('/')));
                if (entry.fromCache)
                    result.cached++;
                else
                    result.installed++;
                const status = entry.fromCache ? '\x1b[90m(cached)\x1b[0m' : '\x1b[32m✓\x1b[0m';
                const nested = placement.path.split('/node_modules/').length > 1
                    ? ` \x1b[90m(${placement.path})\x1b[0m`
                    : '';
                this.log(`  ${status} ${id}${nested}`);
            }
            catch (error) {
                result.failed++;
                result.errors.push({ name: pkg.name, range: placement.ranges[0] || pkg.version, error: error });
                this.log(`  \x1b[31m✗\x1b[0m ${id}: ${error.message}`);
            }
        }
        // Save updated lock file
        this.lockManager.save();
        // Print summary
        this.log('');
        this.log(`\x1b[36m[AxilJS PM]\x1b[0m Done. ` +
            `${result.installed} installed, ${result.cached} from cache` +
            (result.failed > 0 ? `, \x1b[31m${result.failed} failed\x1b[0m` : '') +
            '.');
        this.log('');
        return result;
    }
    // ── Resolution ──────────────────────────────────────────────────────────
    resolveCache = new Map();
    /** Resolve name@range via the lock file (unless forced) or the registry. */
    resolve(name, range, force, verbose) {
        const key = `${name}@${range}`;
        let pending = this.resolveCache.get(key);
        if (pending)
            return pending;
        pending = (async () => {
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
            if (verbose)
                this.log(`  Resolving ${name}@${range} from registry...`);
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
    async resolveTree(rootDeps, force, verbose, result) {
        // path → placement
        const placed = new Map();
        let queue = Object.entries(rootDeps).map(([name, range]) => ({
            name, range, parentPath: null, depth: 0
        }));
        const slot = (base, name) => base ? `${base}/node_modules/${name}` : `node_modules/${name}`;
        /** Directories Node would search from `parentPath`, nearest first. */
        const lookupChain = (parentPath, name) => {
            const chain = [];
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
            const next = [];
            // Resolve one BFS level concurrently, place it in declaration order
            const resolved = await Promise.all(queue.map(job => this.resolve(job.name, job.range, force, verbose).then(pkg => ({ job, pkg, error: null }), error => ({ job, pkg: null, error: error }))));
            for (const { job, pkg, error } of resolved) {
                if (error || !pkg) {
                    result.failed++;
                    result.errors.push({ name: job.name, range: job.range, error: error });
                    this.log(`  \x1b[31m✗\x1b[0m ${job.name}@${job.range}: ${error.message}`);
                    continue;
                }
                // The nearest copy visible from the parent shadows any further up
                const nearest = lookupChain(job.parentPath, job.name)
                    .map(candidate => placed.get(candidate))
                    .find(Boolean);
                if (nearest && (nearest.pkg.version === pkg.version || (0, registry_1.satisfiesRange)(nearest.pkg.version, job.range))) {
                    if (!nearest.ranges.includes(job.range))
                        nearest.ranges.push(job.range);
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
                if (placed.has(path))
                    continue;
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
    cachePaths(pkg) {
        // Build cache key from package name and exact version
        const cacheKey = `${pkg.name.replace('/', '_').replace('@', '')}_${pkg.version}`;
        return {
            primary: (0, path_1.join)(this.cacheDir, `${cacheKey}.tgz`),
            legacy: (0, path_1.join)(this.legacyCacheDir, `${cacheKey}.tgz`)
        };
    }
    async fetchTarball(pkg, force, verbose) {
        const { primary, legacy } = this.cachePaths(pkg);
        let data = null;
        let fromCache = false;
        if (!force) {
            if ((0, fs_1.existsSync)(primary))
                data = (0, fs_1.readFileSync)(primary);
            else if ((0, fs_1.existsSync)(legacy))
                data = (0, fs_1.readFileSync)(legacy);
            fromCache = data !== null;
        }
        if (!data) {
            if (!pkg.tarball)
                throw new Error(`No tarball URL for ${pkg.name}@${pkg.version}`);
            if (verbose)
                this.log(`  Downloading ${pkg.name}@${pkg.version}...`);
            data = await this.registry.download(pkg.tarball);
        }
        // Registry-provided integrity (sha512 SRI / sha1 shasum) — checked for
        // cached tarballs too, whenever the version came from the registry
        verifyIntegrity(data, pkg.integrity, pkg.shasum, pkg.name);
        // Verify integrity against the locked checksum before trusting the
        // tarball (and before overwriting the lock entry with a new checksum)
        if (pkg.lockedChecksum && !force) {
            (0, lockfile_1.verifyChecksum)(data, pkg.lockedChecksum, pkg.name);
        }
        // Save to cache for future installs
        if (!fromCache || !(0, fs_1.existsSync)(primary)) {
            (0, fs_1.writeFileSync)(primary, data);
        }
        return { data, fromCache };
    }
    // ── Extraction ──────────────────────────────────────────────────────────
    async extractTo(tarball, packageDir) {
        // Replace the previous copy so stale files from an older version don't linger
        if ((0, fs_1.existsSync)(packageDir))
            (0, fs_1.rmSync)(packageDir, { recursive: true, force: true });
        (0, tar_1.extractTarball)(tarball, packageDir, { strip: 1 });
    }
    /**
     * Extract a tarball into node_modules.
     * npm tarballs contain a 'package/' directory - it is stripped, so the
     * files land in node_modules/<packageName>/ (scoped names included).
     * Entries that would escape that directory are rejected.
     */
    async extract(tarball, packageName, nodeModulesDir) {
        await this.extractTo(tarball, (0, path_1.join)(nodeModulesDir, packageName));
    }
}
exports.Installer = Installer;
//# sourceMappingURL=installer.js.map