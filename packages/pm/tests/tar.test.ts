import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { gzipSync } from 'zlib';
import {
  createTar,
  parseTar,
  extractTarball,
  safeEntryPath,
  maybeGunzip
} from '../src/tar';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'axil-pm-tar-'));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function tgz(entries: Parameters<typeof createTar>[0]): Buffer {
  return gzipSync(createTar(entries));
}

describe('parseTar', () => {
  it('reads files, directories, sizes and modes', () => {
    const tar = createTar([
      { path: 'package/' },
      { path: 'package/package.json', content: '{"name":"x"}' },
      { path: 'package/bin/cli.js', content: '#!/usr/bin/env node', mode: 0o755 }
    ]);
    const entries = parseTar(tar);
    expect(entries.map(e => [e.path, e.type])).toEqual([
      ['package/', 'directory'],
      ['package/package.json', 'file'],
      ['package/bin/cli.js', 'file']
    ]);
    expect(entries[1].data.toString()).toBe('{"name":"x"}');
    expect(entries[1].size).toBe(12);
    expect(entries[2].mode).toBe(0o755);
  });

  it('handles data that is an exact multiple of 512 bytes and empty files', () => {
    const big = 'a'.repeat(1024);
    const entries = parseTar(createTar([
      { path: 'package/big.txt', content: big },
      { path: 'package/empty.txt', content: '' },
      { path: 'package/after.txt', content: 'after' }
    ]));
    expect(entries.map(e => e.size)).toEqual([1024, 0, 5]);
    expect(entries[2].data.toString()).toBe('after');
  });

  it('applies pax "path" headers for long names', () => {
    const longPath = 'package/' + 'deep/'.repeat(30) + 'file.js';
    expect(longPath.length).toBeGreaterThan(100);
    const entries = parseTar(createTar([{ path: longPath, content: 'x' }]));
    expect(entries).toHaveLength(1);
    expect(entries[0].path).toBe(longPath);
  });

  it('applies GNU longname (L) headers', () => {
    const longPath = 'package/' + 'n'.repeat(150) + '.js';
    // Hand-build: an "L" entry whose data is the long name, then the file
    const nameEntry = createTar([{ path: '././@LongLink', content: longPath + '\0' }]);
    // Patch the typeflag of the first header to 'L' and fix its checksum
    const header = nameEntry.subarray(0, 512);
    header.write('L', 156, 'ascii');
    header.write('        ', 148, 'ascii');
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += header[i];
    header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 'ascii');
    const lData = nameEntry.subarray(0, 512 + Math.ceil((longPath.length + 1) / 512) * 512);
    const file = createTar([{ path: 'package/short.js', content: 'ok' }]);
    const entries = parseTar(Buffer.concat([lData, file]));
    expect(entries).toHaveLength(1);
    expect(entries[0].path).toBe(longPath);
    expect(entries[0].data.toString()).toBe('ok');
  });

  it('uses the ustar prefix field', () => {
    const tar = createTar([{ path: 'file.txt', content: 'p' }]);
    tar.write('package/sub', 345, 'utf8');
    // fix checksum
    tar.write('        ', 148, 'ascii');
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += tar[i];
    tar.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 'ascii');
    expect(parseTar(tar)[0].path).toBe('package/sub/file.txt');
  });

  it('rejects a corrupted header checksum', () => {
    const tar = createTar([{ path: 'package/a.txt', content: 'a' }]);
    tar[0] = 'b'.charCodeAt(0);
    expect(() => parseTar(tar)).toThrow(/checksum/);
  });

  it('rejects truncated archives', () => {
    const tar = createTar([{ path: 'package/a.txt', content: 'a'.repeat(2000) }]);
    expect(() => parseTar(tar.subarray(0, 1024))).toThrow(/past end/);
  });
});

describe('maybeGunzip', () => {
  it('gunzips gzip data and passes plain tar through', () => {
    const tar = createTar([{ path: 'package/a', content: 'a' }]);
    expect(maybeGunzip(gzipSync(tar)).equals(tar)).toBe(true);
    expect(maybeGunzip(tar)).toBe(tar);
  });
});

describe('safeEntryPath', () => {
  it('strips the leading component', () => {
    expect(safeEntryPath('package/lib/index.js')).toBe('lib/index.js');
    expect(safeEntryPath('package/')).toBeNull();
    expect(safeEntryPath('./package/./a.js')).toBe('a.js');
    expect(safeEntryPath('a/b/c', 0)).toBe('a/b/c');
  });

  it('rejects traversal and absolute paths', () => {
    expect(() => safeEntryPath('package/../../etc/passwd')).toThrow(/unsafe/);
    expect(() => safeEntryPath('/etc/passwd', 0)).toThrow(/unsafe/);
    expect(() => safeEntryPath('C:/Windows/x', 0)).toThrow(/unsafe/);
    expect(() => safeEntryPath('package\\..\\..\\evil')).toThrow(/unsafe/);
  });
});

describe('extractTarball', () => {
  it('extracts an npm-style .tgz, stripping package/', () => {
    const target = join(dir, 'node_modules', '@scope', 'pkg');
    const result = extractTarball(
      tgz([
        { path: 'package/package.json', content: '{"name":"@scope/pkg","version":"1.0.0"}' },
        { path: 'package/lib/' },
        { path: 'package/lib/index.js', content: 'module.exports = 42' }
      ]),
      target
    );

    expect(result.files.sort()).toEqual(['lib/index.js', 'package.json']);
    expect(result.directories).toEqual(['lib']);
    expect(JSON.parse(readFileSync(join(target, 'package.json'), 'utf8')).name).toBe('@scope/pkg');
    expect(readFileSync(join(target, 'lib', 'index.js'), 'utf8')).toBe('module.exports = 42');
  });

  it('creates parent directories for files without directory entries', () => {
    const target = join(dir, 'out');
    extractTarball(tgz([{ path: 'package/a/b/c.txt', content: 'deep' }]), target);
    expect(readFileSync(join(target, 'a', 'b', 'c.txt'), 'utf8')).toBe('deep');
  });

  it('extracts long (pax) paths', () => {
    const rel = 'x/'.repeat(60) + 'leaf.txt';
    const target = join(dir, 'out');
    extractTarball(tgz([{ path: 'package/' + rel, content: 'leaf' }]), target);
    expect(readFileSync(join(target, ...rel.split('/')), 'utf8')).toBe('leaf');
  });

  it('rejects entries escaping the target and writes nothing', () => {
    const target = join(dir, 'out');
    const evil = tgz([
      { path: 'package/ok.txt', content: 'fine' },
      { path: 'package/../../escaped.txt', content: 'pwned' }
    ]);
    expect(() => extractTarball(evil, target)).toThrow(/unsafe|outside/);
    expect(existsSync(join(dir, 'escaped.txt'))).toBe(false);
    expect(existsSync(join(target, 'ok.txt'))).toBe(false);
  });

  it('rejects absolute entry paths', () => {
    const evil = tgz([{ path: '/tmp/evil.txt', content: 'x' }]);
    expect(() => extractTarball(evil, join(dir, 'out'))).toThrow(/unsafe/);
  });

  it('skips symlinks instead of writing them', () => {
    const target = join(dir, 'out');
    const result = extractTarball(
      tgz([
        { path: 'package/real.txt', content: 'r' },
        { path: 'package/link', type: 'symlink', linkname: '/etc/passwd' }
      ]),
      target
    );
    expect(result.skipped).toEqual(['package/link']);
    expect(readdirSync(target)).toEqual(['real.txt']);
  });
});
