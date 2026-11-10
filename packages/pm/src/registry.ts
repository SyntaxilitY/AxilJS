/**
 * Package registry client.
 * Fetches package metadata and downloads from the npm registry.
 * (Phase 2 uses npm registry; Phase 6 will have the official AxilJS registry)
 *
 * All network operations use Node's built-in https module.
 * Zero external dependencies.
 */

import { get as httpsGet } from 'https';
import { get as httpGet } from 'http';
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

    let data: any;

    if (isExactOrTag(version)) {
      const url = `${this.registryUrl}/${encodedName}/${version}`;
      data = await this.fetchJson(url);
    } else {
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
  async download(url: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      getFor(url)(url, (response: IncomingMessage) => {
        // Handle redirects (npm registry uses them)
        if (
          response.statusCode === 301 ||
          response.statusCode === 302 ||
          response.statusCode === 303 ||
          response.statusCode === 307 ||
          response.statusCode === 308
        ) {
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
      getFor(url)(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'AxilJS-PM/0.1.0'
        }
      }, (response: IncomingMessage) => {
        if (response.statusCode === 404) {
          response.resume();
          reject(new Error(`Package not found: ${url}`));
          return;
        }

        if (response.statusCode !== 200) {
          response.resume();
          reject(
            new Error(
              `Registry request failed with status ${response.statusCode}`
            )
          );
          return;
        }

        let body = '';
        // Decode as a stream so multi-byte UTF-8 chars split across chunks survive
        response.setEncoding('utf8');
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

// ─── Minimal semver range resolution (zero dependencies) ─────────────────────

type SemVer = [number, number, number];

const VERSION_RE = /^v?(\d+)\.(\d+)\.(\d+)$/;

function isExactOrTag(spec: string): boolean {
  // Exact versions (incl. prerelease/build) or dist-tags such as "latest"/"next"
  return /^v?\d+\.\d+\.\d+([-+].*)?$/.test(spec) || (/^[a-zA-Z][\w.-]*$/.test(spec) && !/^[xX]$/.test(spec));
}

function parseVersion(v: string): SemVer | null {
  const m = VERSION_RE.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function cmp(a: SemVer, b: SemVer): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/** Parse a partial version ("1", "1.2", "1.x", "*") into parts; null = wildcard. */
function parsePartial(v: string): Array<number | null> {
  return v.replace(/^v/, '').split('.').slice(0, 3).map(p =>
    p === '' || p === 'x' || p === 'X' || p === '*' ? null : Number(p)
  );
}

function satisfiesComparator(ver: SemVer, comp: string): boolean {
  const m = /^(\^|~|>=|<=|>|<|=)?\s*(.*)$/.exec(comp.trim());
  if (!m) return false;
  const op = m[1] || '';
  const parts = parsePartial(m[2] || '*');
  const [ma, mi, pa] = [parts[0] ?? null, parts[1] ?? null, parts[2] ?? null];
  const base: SemVer = [ma ?? 0, mi ?? 0, pa ?? 0];

  if (op === '^') {
    if (ver[0] !== base[0]) return false;
    if (base[0] === 0 && mi !== null) {
      if (ver[1] !== base[1]) return false;
      if (base[1] === 0 && pa !== null && ver[2] !== base[2]) return false;
    }
    return cmp(ver, base) >= 0;
  }
  if (op === '~') {
    if (ver[0] !== base[0]) return false;
    if (mi !== null && ver[1] !== base[1]) return false;
    return cmp(ver, base) >= 0;
  }
  if (op === '>=') return cmp(ver, base) >= 0;
  if (op === '>')  return cmp(ver, base) > 0;
  if (op === '<=') return cmp(ver, base) <= 0;
  if (op === '<')  return cmp(ver, base) < 0;

  // "=", bare or partial version ("1.2" / "1.x" / "*")
  if (ma !== null && ver[0] !== ma) return false;
  if (mi !== null && ver[1] !== mi) return false;
  if (pa !== null && ver[2] !== pa) return false;
  return true;
}

function satisfies(ver: SemVer, range: string): boolean {
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
export function maxSatisfying(versions: string[], range: string): string | null {
  let best: { raw: string; v: SemVer } | null = null;
  for (const raw of versions) {
    const v = parseVersion(raw);
    if (!v || !satisfies(v, range)) continue;
    if (!best || cmp(v, best.v) > 0) best = { raw, v };
  }
  return best ? best.raw : null;
}
/** Does `version` (exact "x.y.z") satisfy the semver `range`? */
export function satisfiesRange(version: string, range: string): boolean {
  const v = parseVersion(version);
  if (!v) return false;
  const r = range.trim();
  if (r === '' || r === '*' || r === 'latest') return true;
  return satisfies(v, r);
}

// http:// registries (local mirrors, tests) use node:http, everything else https
function getFor(url: string): typeof httpsGet {
  return (url.startsWith('http://') ? httpGet : httpsGet) as typeof httpsGet;
}
