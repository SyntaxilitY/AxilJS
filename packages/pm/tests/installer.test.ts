import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createServer, Server } from 'http';
import { AddressInfo } from 'net';
import { createHash } from 'crypto';
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
  mkdirSync
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { gzipSync } from 'zlib';
import { createTar } from '../src/tar';
import { Installer, verifyIntegrity, defaultCacheDir, legacyCacheDir } from '../src/installer';
import { RegistryClient, maxSatisfying, satisfiesRange } from '../src/registry';
import { calculateChecksum, verifyChecksum, LockFileManager } from '../src/lockfile';

// ─── Fake registry ────────────────────────────────────────────────────────────

interface FakeVersion {
  deps?: Record<string, string>;
  files?: Record<string, string>;
}

// name → version → spec
const PACKAGES: Record<string, Record<string, FakeVersion>> = {
  app: {},
  a: {
    '1.0.0': { deps: { b: '^1.0.0', c: '^1.0.0' } },
    '1.1.0': { deps: { b: '^1.0.0', c: '^1.0.0' } }
  },
  b: {
    '1.0.0': {},
    '1.2.0': {},
    '2.0.0': {}
  },
  c: {
    // conflicts with the root's b@^2 → must be nested under c
    '1.0.0': { deps: { b: '^1.2.0' } }
  },
  d: {
    // cycle d → e → d
    '1.0.0': { deps: { e: '1.0.0' } }
  },
  e: {
    '1.0.0': { deps: { d: '^1.0.0' } }
  },
  '@scope/pkg': {
    '0.1.0': { files: { 'index.js': 'module.exports = "scoped"' } }
  }
};

const tarballs = new Map<string, Buffer>();
let requests: string[] = [];
let tamper = false;

function tarballFor(name: string, version: string): Buffer {
  const key = `${name}@${version}`;
  let data = tarballs.get(key);
  if (!data) {
    const spec = PACKAGES[name][version];
    const files = spec.files || { 'index.js': `module.exports = ${JSON.stringify(key)}` };
    data = gzipSync(createTar([
      { path: 'package/' },
      {
        path: 'package/package.json',
        content: JSON.stringify({ name, version, dependencies: spec.deps || {} })
      },
      ...Object.entries(files).map(([p, c]) => ({ path: `package/${p}`, content: c }))
    ]));
    tarballs.set(key, data);
  }
  return data;
}

let server: Server;
let baseUrl = '';

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = decodeURIComponent(req.url || '/');
    requests.push(url);

    const tgz = /^\/-\/(.+)\/-\/(.+)-(\d+\.\d+\.\d+)\.tgz$/.exec(url);
    if (tgz) {
      const [, name, , version] = tgz;
      if (!PACKAGES[name]?.[version]) { res.writeHead(404); res.end(); return; }
      let body = tarballFor(name, version);
      if (tamper) body = Buffer.concat([body, Buffer.from('x')]);
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end(body);
      return;
    }

    const name = url.slice(1).split('/')[0].startsWith('@')
      ? url.slice(1).split('/').slice(0, 2).join('/')
      : url.slice(1).split('/')[0];
    const versions = PACKAGES[name];
    if (!versions) { res.writeHead(404); res.end('{}'); return; }

    const doc = (v: string) => {
      const data = tarballFor(name, v);
      return {
        name,
        version: v,
        dependencies: versions[v].deps || {},
        dist: {
          tarball: `${baseUrl}/-/${name}/-/${name.split('/').pop()}-${v}.tgz`,
          shasum: createHash('sha1').update(data).digest('hex'),
          integrity: 'sha512-' + createHash('sha512').update(data).digest('base64')
        }
      };
    };

    const rest = url.slice(1 + name.length + 1);
    res.writeHead(200, { 'content-type': 'application/json' });
    if (rest) {
      res.end(JSON.stringify(doc(rest === 'latest' ? Object.keys(versions).pop()! : rest)));
    } else {
      res.end(JSON.stringify({
        name,
        versions: Object.fromEntries(Object.keys(versions).map(v => [v, doc(v)]))
      }));
    }
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

let project: string;
let cache: string;
let home: string;
const savedEnv = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };

beforeEach(() => {
  project = mkdtempSync(join(tmpdir(), 'axil-pm-proj-'));
  cache = mkdtempSync(join(tmpdir(), 'axil-pm-cache-'));
  // Isolate the legacy ~/.@axiljsjs/cache lookup from the real home dir
  home = mkdtempSync(join(tmpdir(), 'axil-pm-home-'));
  process.env.HOME = home;
  process.env.USERPROFILE = home;
  requests = [];
  tamper = false;
});

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  rmSync(project, { recursive: true, force: true });
  rmSync(cache, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

function writePkg(deps: Record<string, string>, devDeps: Record<string, string> = {}): void {
  writeFileSync(
    join(project, 'package.json'),
    JSON.stringify({ name: 'app', dependencies: deps, devDependencies: devDeps })
  );
}

function installer(): Installer {
  return new Installer({ cwd: project, registry: baseUrl, cacheDir: cache, silent: true });
}

function readJson(...parts: string[]): any {
  return JSON.parse(readFileSync(join(project, ...parts), 'utf8'));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('semver helpers', () => {
  it('maxSatisfying picks the highest matching version', () => {
    const versions = ['1.0.0', '1.2.0', '1.10.1', '2.0.0', '2.1.0-beta.1'];
    expect(maxSatisfying(versions, '^1.0.0')).toBe('1.10.1');
    expect(maxSatisfying(versions, '~1.2.0')).toBe('1.2.0');
    expect(maxSatisfying(versions, '>=1.2.0 <2.0.0')).toBe('1.10.1');
    expect(maxSatisfying(versions, '1.x || >=2')).toBe('2.0.0');
    expect(maxSatisfying(versions, '1.0.0 - 1.5.0')).toBe('1.2.0');
    expect(maxSatisfying(versions, '^3.0.0')).toBeNull();
  });

  it('satisfiesRange handles caret on 0.x, wildcards and exact versions', () => {
    expect(satisfiesRange('0.2.5', '^0.2.0')).toBe(true);
    expect(satisfiesRange('0.3.7', '^0.2.0')).toBe(false);
    expect(satisfiesRange('0.0.3', '^0.0.3')).toBe(true);
    expect(satisfiesRange('0.0.4', '^0.0.3')).toBe(false);
    expect(satisfiesRange('5.4.3', '*')).toBe(true);
    expect(satisfiesRange('1.2.3', '1.2.3')).toBe(true);
    expect(satisfiesRange('1.2.4', '1.2.3')).toBe(false);
    expect(satisfiesRange('not-a-version', '*')).toBe(false);
  });
});

describe('checksums', () => {
  it('calculateChecksum / verifyChecksum detect tampering', () => {
    const data = Buffer.from('hello');
    const sum = calculateChecksum(data);
    expect(sum).toBe(createHash('sha256').update(data).digest('hex'));
    expect(() => verifyChecksum(data, sum, 'x')).not.toThrow();
    expect(() => verifyChecksum(Buffer.from('hellO'), sum, 'x')).toThrow(/tampered/);
  });

  it('verifyIntegrity checks sha512 SRI and sha1 shasum', () => {
    const data = Buffer.from('payload');
    const sri = 'sha512-' + createHash('sha512').update(data).digest('base64');
    const sha1 = createHash('sha1').update(data).digest('hex');
    expect(() => verifyIntegrity(data, sri, undefined, 'p')).not.toThrow();
    expect(() => verifyIntegrity(data, undefined, sha1, 'p')).not.toThrow();
    expect(() => verifyIntegrity(Buffer.from('x'), sri, undefined, 'p')).toThrow(/Integrity/);
    expect(() => verifyIntegrity(Buffer.from('x'), undefined, sha1, 'p')).toThrow(/Shasum/);
    expect(() => verifyIntegrity(data, '', '', 'p')).not.toThrow();
  });
});

describe('cache directory', () => {
  it('defaults to ~/.axiljs/cache and keeps the legacy path for reads', () => {
    const prev = process.env.AXILJS_CACHE_DIR;
    delete process.env.AXILJS_CACHE_DIR;
    try {
      expect(defaultCacheDir().replace(/\\/g, '/')).toMatch(/\/\.axiljs\/cache$/);
      expect(legacyCacheDir().replace(/\\/g, '/')).toMatch(/\/\.@axiljsjs\/cache$/);
      process.env.AXILJS_CACHE_DIR = join(cache, 'custom');
      expect(defaultCacheDir()).toBe(join(cache, 'custom'));
    } finally {
      if (prev === undefined) delete process.env.AXILJS_CACHE_DIR;
      else process.env.AXILJS_CACHE_DIR = prev;
    }
  });
});

describe('RegistryClient over http', () => {
  it('resolves ranges against the packument and downloads tarballs', async () => {
    const client = new RegistryClient(baseUrl);
    const meta = await client.getMetadata('b', '^1.0.0');
    expect(meta.version).toBe('1.2.0');
    const exact = await client.getMetadata('b', '2.0.0');
    expect(exact.version).toBe('2.0.0');
    const data = await client.download(meta.dist.tarball);
    expect(data.equals(tarballFor('b', '1.2.0'))).toBe(true);
    await expect(client.getMetadata('nope', '^1.0.0')).rejects.toThrow(/not found/);
    await expect(client.getMetadata('b', '^9.0.0')).rejects.toThrow(/satisfies/);
  });
});

describe('Installer', () => {
  it('extracts real files and installs transitive dependencies flat', async () => {
    writePkg({ a: '^1.0.0', '@scope/pkg': '0.1.0' });
    const result = await installer().install();

    expect(result.failed).toBe(0);
    expect(readJson('node_modules', 'a', 'package.json').version).toBe('1.1.0');
    // transitive deps hoisted
    expect(readJson('node_modules', 'b', 'package.json').version).toBe('1.2.0');
    expect(readJson('node_modules', 'c', 'package.json').version).toBe('1.0.0');
    // scoped package, real content (no placeholder marker)
    const scoped = readJson('node_modules', '@scope', 'pkg', 'package.json');
    expect(scoped._axiljs_installed).toBeUndefined();
    expect(readFileSync(join(project, 'node_modules', '@scope', 'pkg', 'index.js'), 'utf8'))
      .toBe('module.exports = "scoped"');

    // b requested twice (^1.0.0 by a, ^1.2.0 by c) → one copy, downloaded once
    expect(result.placements.filter(p => p.name === 'b')).toHaveLength(1);
    expect(requests.filter(r => r.endsWith('b-1.2.0.tgz'))).toHaveLength(1);

    // lock file records transitive entries
    const lock = JSON.parse(readFileSync(join(project, '@axiljs.lock'), 'utf8'));
    expect(Object.keys(lock.packages).sort()).toEqual(
      ['@scope/pkg@0.1.0', 'a@^1.0.0', 'b@^1.0.0', 'b@^1.2.0', 'c@^1.0.0']
    );
    expect(lock.packages['a@^1.0.0'].dependencies).toEqual({ b: '^1.0.0', c: '^1.0.0' });
  });

  it('nests a conflicting version under the package that needs it', async () => {
    writePkg({ b: '^2.0.0', c: '^1.0.0' });
    const result = await installer().install();

    expect(result.failed).toBe(0);
    expect(readJson('node_modules', 'b', 'package.json').version).toBe('2.0.0');
    expect(readJson('node_modules', 'c', 'node_modules', 'b', 'package.json').version).toBe('1.2.0');
    expect(result.placements.map(p => p.path).sort()).toEqual([
      'node_modules/b',
      'node_modules/c',
      'node_modules/c/node_modules/b'
    ]);
  });

  it('terminates on dependency cycles', async () => {
    writePkg({ d: '^1.0.0' });
    const result = await installer().install();
    expect(result.failed).toBe(0);
    expect(result.placements.map(p => p.name).sort()).toEqual(['d', 'e']);
  });

  it('skips devDependencies when includeDev is false', async () => {
    writePkg({ b: '^1.0.0' }, { '@scope/pkg': '0.1.0' });
    await installer().install({ includeDev: false });
    expect(existsSync(join(project, 'node_modules', 'b'))).toBe(true);
    expect(existsSync(join(project, 'node_modules', '@scope'))).toBe(false);
  });

  it('reuses the lock file and the cache on a second install', async () => {
    writePkg({ a: '^1.0.0' });
    await installer().install();
    requests = [];

    rmSync(join(project, 'node_modules'), { recursive: true, force: true });
    const second = await installer().install();

    expect(second.failed).toBe(0);
    expect(second.cached).toBe(3);
    expect(second.installed).toBe(0);
    // resolved from @axiljs.lock + cache: no registry traffic at all
    expect(requests).toEqual([]);
    expect(readJson('node_modules', 'c', 'package.json').name).toBe('c');
  });

  it('fails a package whose cached tarball no longer matches the lock checksum', async () => {
    writePkg({ b: '1.0.0' });
    await installer().install();

    const cached = join(cache, 'b_1.0.0.tgz');
    expect(existsSync(cached)).toBe(true);
    writeFileSync(cached, gzipSync(createTar([{ path: 'package/evil.js', content: 'x' }])));

    const result = await installer().install();
    expect(result.failed).toBe(1);
    expect(result.errors[0].error.message).toMatch(/Checksum verification failed/);
  });

  it('rejects a download that does not match the registry integrity', async () => {
    writePkg({ b: '1.0.0' });
    tamper = true;
    const result = await installer().install();
    expect(result.failed).toBe(1);
    expect(result.errors[0].error.message).toMatch(/Integrity check failed/);
    expect(existsSync(join(project, 'node_modules', 'b'))).toBe(false);
  });

  it('reads tarballs from the legacy ~/.@axiljsjs/cache', async () => {
    // HOME points at a temp dir (see beforeEach)
    const legacy = join(home, '.@axiljsjs', 'cache');
    mkdirSync(legacy, { recursive: true });
    writeFileSync(join(legacy, 'b_1.0.0.tgz'), tarballFor('b', '1.0.0'));

    writePkg({ b: '1.0.0' });
    const result = await installer().install();

    expect(result.cached).toBe(1);
    expect(requests.some(r => r.endsWith('.tgz'))).toBe(false);
    // re-cached under the new directory
    expect(existsSync(join(cache, 'b_1.0.0.tgz'))).toBe(true);
  });

  it('reports unresolvable packages without aborting the rest', async () => {
    writePkg({ b: '^1.0.0', missing: '^1.0.0' });
    const result = await installer().install();
    expect(result.failed).toBe(1);
    expect(result.errors[0].name).toBe('missing');
    expect(existsSync(join(project, 'node_modules', 'b', 'package.json'))).toBe(true);
  });

  it('throws without package.json', async () => {
    await expect(installer().install()).rejects.toThrow(/No package.json/);
  });

  it('LockFileManager round-trips entries', () => {
    const lm = new LockFileManager(project);
    lm.set('x', '^1.0.0', { version: '1.0.1', resolved: 'u', checksum: 'c', dependencies: {} });
    lm.save();
    const again = new LockFileManager(project);
    expect(again.has('x', '^1.0.0')).toBe(true);
    expect(again.get('x', '^1.0.0')!.version).toBe('1.0.1');
  });
});
