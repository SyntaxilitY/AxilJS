"use strict";
/**
 * Package registry client.
 * Fetches package metadata and downloads from the npm registry.
 * (Phase 2 uses npm registry; Phase 6 will have the official AxilJS registry)
 *
 * All network operations use Node's built-in https module.
 * Zero external dependencies.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RegistryClient = void 0;
exports.maxSatisfying = maxSatisfying;
exports.satisfiesRange = satisfiesRange;
const https_1 = require("https");
const http_1 = require("http");
// ─── Registry Client ──────────────────────────────────────────────────────────
const REGISTRY_URL = 'https://registry.npmjs.org';
class RegistryClient {
    registryUrl;
    constructor(registryUrl = REGISTRY_URL) {
        this.registryUrl = registryUrl;
    }
    /**
     * Fetch package metadata from the registry.
     * Resolves version ranges like "^1.0.0" to exact versions.
     *
     * @param name     Package name
     * @param version  Version or range (default: 'latest')
     */
    async getMetadata(name, version = 'latest') {
        // Encode scoped packages correctly: @scope/name → @scope%2Fname
        const encodedName = name.startsWith('@')
            ? name.replace('/', '%2F')
            : name;
        let data;
        if (isExactOrTag(version)) {
            const url = `${this.registryUrl}/${encodedName}/${version}`;
            data = await this.fetchJson(url);
        }
        else {
            // The registry's /<name>/<spec> endpoint only accepts exact versions
            // and dist-tags ("^1.0.0" → 404), so resolve ranges locally against
            // the full packument.
            const doc = await this.fetchJson(`${this.registryUrl}/${encodedName}`);
            const resolved = maxSatisfying(Object.keys(doc.versions || {}), version);
            if (!resolved) {
                throw new Error(`No version of ${name} satisfies ${version}`);
            }
            data = doc.versions[resolved];
        }
        return {
            name: data.name,
            version: data.version,
            description: data.description || '',
            dist: {
                tarball: data.dist.tarball,
                shasum: data.dist.shasum,
                integrity: data.dist.integrity || ''
            },
            dependencies: data.dependencies || {},
            devDependencies: data.devDependencies || {}
        };
    }
    /**
     * Download a package tarball.
     *
     * @param url  Tarball download URL from package metadata
     * @returns    Downloaded tarball as a Buffer
     */
    async download(url) {
        return new Promise((resolve, reject) => {
            getFor(url)(url, (response) => {
                // Handle redirects (npm registry uses them)
                if (response.statusCode === 301 ||
                    response.statusCode === 302 ||
                    response.statusCode === 303 ||
                    response.statusCode === 307 ||
                    response.statusCode === 308) {
                    response.resume();
                    const redirectUrl = response.headers.location;
                    if (!redirectUrl) {
                        reject(new Error('Redirect with no location header'));
                        return;
                    }
                    // Location may be relative to the current URL
                    this.download(new URL(redirectUrl, url).toString()).then(resolve).catch(reject);
                    return;
                }
                if (response.statusCode !== 200) {
                    response.resume();
                    reject(new Error(`Download failed with status ${response.statusCode}: ${url}`));
                    return;
                }
                // Collect chunks
                const chunks = [];
                response.on('data', (chunk) => chunks.push(chunk));
                response.on('end', () => resolve(Buffer.concat(chunks)));
                response.on('error', reject);
            }).on('error', reject);
        });
    }
    /**
     * Fetch and parse JSON from a URL.
     */
    fetchJson(url) {
        return new Promise((resolve, reject) => {
            getFor(url)(url, {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'AxilJS-PM/0.1.0'
                }
            }, (response) => {
                if (response.statusCode === 404) {
                    response.resume();
                    reject(new Error(`Package not found: ${url}`));
                    return;
                }
                if (response.statusCode !== 200) {
                    response.resume();
                    reject(new Error(`Registry request failed with status ${response.statusCode}`));
                    return;
                }
                let body = '';
                // Decode as a stream so multi-byte UTF-8 chars split across chunks survive
                response.setEncoding('utf8');
                response.on('data', (chunk) => (body += chunk));
                response.on('end', () => {
                    try {
                        resolve(JSON.parse(body));
                    }
                    catch {
                        reject(new Error(`Invalid JSON from registry: ${url}`));
                    }
                });
                response.on('error', reject);
            }).on('error', reject);
        });
    }
}
exports.RegistryClient = RegistryClient;
const VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)$/;
function isExactOrTag(spec) {
    // Exact versions (incl. prerelease/build) or dist-tags such as "latest"/"next"
    return /^v?\d+\.\d+\.\d+([-+].*)?$/.test(spec) || (/^[a-zA-Z][\w.-]*$/.test(spec) && !/^[xX]$/.test(spec));
}
function parseVersion(v) {
    const m = VERSION_RE.exec(v.trim());
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}
function cmp(a, b) {
    return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}
/** Parse a partial version ("1", "1.2", "1.x", "*") into parts; null = wildcard. */
function parsePartial(v) {
    return v.replace(/^v/, '').split('.').slice(0, 3).map(p => p === '' || p === 'x' || p === 'X' || p === '*' ? null : Number(p));
}
function satisfiesComparator(ver, comp) {
    const m = /^(\^|~|>=|<=|>|<|=)?\s*(.*)$/.exec(comp.trim());
    if (!m)
        return false;
    const op = m[1] || '';
    const parts = parsePartial(m[2] || '*');
    const [ma, mi, pa] = [parts[0] ?? null, parts[1] ?? null, parts[2] ?? null];
    const base = [ma ?? 0, mi ?? 0, pa ?? 0];
    if (op === '^') {
        if (ver[0] !== base[0])
            return false;
        if (base[0] === 0 && mi !== null) {
            if (ver[1] !== base[1])
                return false;
            if (base[1] === 0 && pa !== null && ver[2] !== base[2])
                return false;
        }
        return cmp(ver, base) >= 0;
    }
    if (op === '~') {
        if (ver[0] !== base[0])
            return false;
        if (mi !== null && ver[1] !== base[1])
            return false;
        return cmp(ver, base) >= 0;
    }
    if (op === '>=')
        return cmp(ver, base) >= 0;
    if (op === '>')
        return cmp(ver, base) > 0;
    if (op === '<=')
        return cmp(ver, base) <= 0;
    if (op === '<')
        return cmp(ver, base) < 0;
    // "=", bare or partial version ("1.2" / "1.x" / "*")
    if (ma !== null && ver[0] !== ma)
        return false;
    if (mi !== null && ver[1] !== mi)
        return false;
    if (pa !== null && ver[2] !== pa)
        return false;
    return true;
}
function satisfies(ver, range) {
    return range.split('||').some(set => {
        const trimmed = set.trim();
        // Hyphen range: "1.2.3 - 2.3.4"
        const hyphen = /^(\S+)\s+-\s+(\S+)$/.exec(trimmed);
        if (hyphen) {
            return satisfiesComparator(ver, `>=${hyphen[1]}`) &&
                satisfiesComparator(ver, `<=${hyphen[2]}`);
        }
        const comps = trimmed.replace(/(>=|<=|>|<|=|\^|~)\s+/g, '$1').split(/\s+/).filter(Boolean);
        return comps.length === 0 || comps.every(c => satisfiesComparator(ver, c));
    });
}
/** Highest non-prerelease version in `versions` satisfying `range`. */
function maxSatisfying(versions, range) {
    let best = null;
    for (const raw of versions) {
        const v = parseVersion(raw);
        if (!v || !satisfies(v, range))
            continue;
        if (!best || cmp(v, best.v) > 0)
            best = { raw, v };
    }
    return best ? best.raw : null;
}
/** Does `version` (exact "x.y.z") satisfy the semver `range`? */
function satisfiesRange(version, range) {
    const v = parseVersion(version);
    if (!v)
        return false;
    const r = range.trim();
    if (r === '' || r === '*' || r === 'latest')
        return true;
    return satisfies(v, r);
}
// http:// registries (local mirrors, tests) use node:http, everything else https
function getFor(url) {
    return (url.startsWith('http://') ? http_1.get : https_1.get);
}
//# sourceMappingURL=registry.js.map