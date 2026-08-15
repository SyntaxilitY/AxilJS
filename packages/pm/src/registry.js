"use strict";
/**
 * Package registry client.
 * Fetches package metadata and downloads from the npm registry.
 * (Phase 2 uses npm registry; Phase 6 will have the official @axiljsJS registry)
 *
 * All network operations use Node's built-in https module.
 * Zero external dependencies.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RegistryClient = void 0;
const https_1 = require("https");
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
        const url = `${this.registryUrl}/${encodedName}/${version}`;
        const data = await this.fetchJson(url);
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
            (0, https_1.get)(url, (response) => {
                // Handle redirects (npm registry uses them)
                if (response.statusCode === 301 ||
                    response.statusCode === 302) {
                    const redirectUrl = response.headers.location;
                    if (!redirectUrl) {
                        reject(new Error('Redirect with no location header'));
                        return;
                    }
                    this.download(redirectUrl).then(resolve).catch(reject);
                    return;
                }
                if (response.statusCode !== 200) {
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
            (0, https_1.get)(url, {
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': '@axiljsJS-PM/0.1.0'
                }
            }, (response) => {
                if (response.statusCode === 404) {
                    reject(new Error(`Package not found: ${url}`));
                    return;
                }
                if (response.statusCode !== 200) {
                    reject(new Error(`Registry request failed with status ${response.statusCode}`));
                    return;
                }
                let body = '';
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
//# sourceMappingURL=registry.js.map