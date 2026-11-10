/**
 * Package registry client.
 * Fetches package metadata and downloads from the npm registry.
 * (Phase 2 uses npm registry; Phase 6 will have the official AxilJS registry)
 *
 * All network operations use Node's built-in https module.
 * Zero external dependencies.
 */
export interface PackageMetadata {
    name: string;
    version: string;
    description: string;
    dist: {
        tarball: string;
        shasum: string;
        integrity: string;
    };
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
}
export declare class RegistryClient {
    private registryUrl;
    constructor(registryUrl?: string);
    /**
     * Fetch package metadata from the registry.
     * Resolves version ranges like "^1.0.0" to exact versions.
     *
     * @param name     Package name
     * @param version  Version or range (default: 'latest')
     */
    getMetadata(name: string, version?: string): Promise<PackageMetadata>;
    /**
     * Download a package tarball.
     *
     * @param url  Tarball download URL from package metadata
     * @returns    Downloaded tarball as a Buffer
     */
    download(url: string): Promise<Buffer>;
    /**
     * Fetch and parse JSON from a URL.
     */
    private fetchJson;
}
/** Highest non-prerelease version in `versions` satisfying `range`. */
export declare function maxSatisfying(versions: string[], range: string): string | null;
/** Does `version` (exact "x.y.z") satisfy the semver `range`? */
export declare function satisfiesRange(version: string, range: string): boolean;
//# sourceMappingURL=registry.d.ts.map