/**
 * Package registry client.
 * Fetches package metadata and downloads from the npm registry.
 * (Phase 2 uses npm registry; Phase 6 will have the official @axilJS registry)
 *
 * All network operations use Node's built-in https module.
 * Zero external dependencies.
 */

import { get } from 'https';
import { IncomingMessage } from 'http';

// ─── Registry Types ───────────────────────────────────────────────────────────

export interface PackageMetadata {
  name: string;
  version: string;
  description: string;
  dist: {
    tarball: string;   // Download URL
    shasum: string;    // SHA1 checksum (npm standard)
    integrity: string; // SRI hash (sha512)
  };
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

// ─── Registry Client ──────────────────────────────────────────────────────────

const REGISTRY_URL = 'https://registry.npmjs.org';

export class RegistryClient {
  private registryUrl: string;

  constructor(registryUrl: string = REGISTRY_URL) {
    this.registryUrl = registryUrl;
  }

  /**
   * Fetch package metadata from the registry.
   * Resolves version ranges like "^1.0.0" to exact versions.
   *
   * @param name     Package name
   * @param version  Version or range (default: 'latest')
   */
  async getMetadata(
    name: string,
    version: string = 'latest'
  ): Promise<PackageMetadata> {
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
  async download(url: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      get(url, (response: IncomingMessage) => {
        // Handle redirects (npm registry uses them)
        if (
          response.statusCode === 301 ||
          response.statusCode === 302
        ) {
          const redirectUrl = response.headers.location;
          if (!redirectUrl) {
            reject(new Error('Redirect with no location header'));
            return;
          }
          this.download(redirectUrl).then(resolve).catch(reject);
          return;
        }

        if (response.statusCode !== 200) {
          reject(
            new Error(
              `Download failed with status ${response.statusCode}: ${url}`
            )
          );
          return;
        }

        // Collect chunks
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('end', () => resolve(Buffer.concat(chunks)));
        response.on('error', reject);
      }).on('error', reject);
    });
  }

  /**
   * Fetch and parse JSON from a URL.
   */
  private fetchJson(url: string): Promise<any> {
    return new Promise((resolve, reject) => {
      get(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': '@axilJS-PM/0.1.0'
        }
      }, (response: IncomingMessage) => {
        if (response.statusCode === 404) {
          reject(new Error(`Package not found: ${url}`));
          return;
        }

        if (response.statusCode !== 200) {
          reject(
            new Error(
              `Registry request failed with status ${response.statusCode}`
            )
          );
          return;
        }

        let body = '';
        response.on('data', (chunk: string) => (body += chunk));
        response.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error(`Invalid JSON from registry: ${url}`));
          }
        });
        response.on('error', reject);
      }).on('error', reject);
    });
  }
}