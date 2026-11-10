/**
 * Minimal tar (ustar) reader + npm tarball extractor.
 * Zero dependencies — node:zlib for gunzip, everything else by hand.
 *
 * Supported:
 *   - 512-byte ustar headers (name + prefix), header checksum validation
 *   - regular files ('0' / '\0' / '7') and directories ('5')
 *   - pax extended headers ('x', per-entry path/size) and global ones ('g', ignored)
 *   - GNU long names ('L')
 *   - base-256 encoded sizes
 * Skipped (never written): symlinks, hard links, devices, FIFOs.
 *
 * extractTarball() strips the first path component (npm packs everything
 * under "package/") and refuses any entry that would land outside the
 * target directory (absolute paths, "..", drive letters).
 */

import { gunzipSync } from 'zlib';
import { mkdirSync, writeFileSync, chmodSync } from 'fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'path';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TarEntryType = 'file' | 'directory' | 'symlink' | 'link' | 'other';

export interface TarEntry {
  // Full path inside the archive (prefix/name, pax/longname applied)
  path: string;
  type: TarEntryType;
  // Unix permission bits
  mode: number;
  size: number;
  // File contents (empty for non-files)
  data: Buffer;
  linkname?: string;
}

export interface ExtractOptions {
  // Number of leading path components to drop (default: 1 — npm's "package/")
  strip?: number;
}

export interface ExtractResult {
  // Paths (relative to the target dir, "/"-separated) of written files
  files: string[];
  // Paths of created directories
  directories: string[];
  // Archive paths of entries that were not written (links, devices…)
  skipped: string[];
}

const BLOCK = 512;

// ─── Header parsing ───────────────────────────────────────────────────────────

function readString(buf: Buffer, offset: number, length: number): string {
  const slice = buf.subarray(offset, offset + length);
  const nul = slice.indexOf(0);
  return slice.subarray(0, nul === -1 ? slice.length : nul).toString('utf8');
}

function readNumber(buf: Buffer, offset: number, length: number): number {
  // Base-256 (GNU) encoding: high bit of the first byte set
  if (buf[offset] & 0x80) {
    let value = buf[offset] & 0x7f;
    for (let i = 1; i < length; i++) value = value * 256 + buf[offset + i];
    return value;
  }
  const text = readString(buf, offset, length).trim();
  if (!text) return 0;
  const value = parseInt(text, 8);
  if (Number.isNaN(value)) throw new Error(`Invalid tar header number: "${text}"`);
  return value;
}

function isZeroBlock(buf: Buffer, offset: number): boolean {
  for (let i = offset; i < offset + BLOCK; i++) {
    if (buf[i] !== 0) return false;
  }
  return true;
}

function verifyHeaderChecksum(buf: Buffer, offset: number): void {
  const expected = readNumber(buf, offset + 148, 8);
  let sum = 0;
  for (let i = 0; i < BLOCK; i++) {
    // The checksum field itself counts as 8 spaces
    sum += i >= 148 && i < 156 ? 0x20 : buf[offset + i];
  }
  if (sum !== expected) {
    throw new Error(`Corrupt tar archive: header checksum mismatch at offset ${offset}`);
  }
}

/** Parse pax "<len> key=value\n" records. */
function parsePax(data: Buffer): Record<string, string> {
  const out: Record<string, string> = {};
  let pos = 0;
  while (pos < data.length) {
    const space = data.indexOf(0x20, pos);
    if (space === -1) break;
    const len = parseInt(data.subarray(pos, space).toString('utf8'), 10);
    if (!Number.isFinite(len) || len <= 0) break;
    const record = data.subarray(space + 1, pos + len - 1).toString('utf8');
    const eq = record.indexOf('=');
    if (eq !== -1) out[record.slice(0, eq)] = record.slice(eq + 1);
    pos += len;
  }
  return out;
}

function typeOf(flag: string): TarEntryType {
  switch (flag) {
    case '0':
    case '\0':
    case '':
    case '7':
      return 'file';
    case '5':
      return 'directory';
    case '2':
      return 'symlink';
    case '1':
      return 'link';
    default:
      return 'other';
  }
}

/**
 * Parse an uncompressed tar archive into entries.
 */
export function parseTar(tar: Buffer): TarEntry[] {
  const entries: TarEntry[] = [];
  let offset = 0;
  let pax: Record<string, string> = {};
  let longName: string | null = null;

  while (offset + BLOCK <= tar.length) {
    if (isZeroBlock(tar, offset)) break;

    verifyHeaderChecksum(tar, offset);

    const name     = readString(tar, offset, 100);
    const mode     = readNumber(tar, offset + 100, 8);
    let size       = readNumber(tar, offset + 124, 12);
    const flag     = String.fromCharCode(tar[offset + 156] || 0);
    const linkname = readString(tar, offset + 157, 100);
    const magic    = readString(tar, offset + 257, 6);
    const prefix   = magic.startsWith('ustar') ? readString(tar, offset + 345, 155) : '';

    if (pax.size !== undefined) {
      const paxSize = Number(pax.size);
      if (Number.isFinite(paxSize)) size = paxSize;
    }

    const dataStart = offset + BLOCK;
    const dataEnd   = dataStart + size;
    if (dataEnd > tar.length) {
      throw new Error('Corrupt tar archive: entry data extends past end of archive');
    }
    const data = tar.subarray(dataStart, dataEnd);
    offset = dataStart + Math.ceil(size / BLOCK) * BLOCK;

    // Meta entries that describe the next header
    if (flag === 'x') { pax = { ...pax, ...parsePax(data) }; continue; }
    if (flag === 'g') { continue; }
    if (flag === 'L') { longName = readString(data, 0, data.length); continue; }
    if (flag === 'K') { continue; }

    let path = prefix ? `${prefix}/${name}` : name;
    if (longName !== null) path = longName;
    if (pax.path !== undefined) path = pax.path;

    entries.push({
      path,
      type: typeOf(flag),
      mode,
      size,
      data: Buffer.from(data),
      linkname: pax.linkpath ?? (linkname || undefined)
    });

    pax = {};
    longName = null;
  }

  return entries;
}

// ─── Extraction ───────────────────────────────────────────────────────────────

/** gunzip when the buffer has the gzip magic bytes, else return it as-is. */
export function maybeGunzip(data: Buffer): Buffer {
  if (data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b) {
    return gunzipSync(data);
  }
  return data;
}

/**
 * Validate and normalise an archive path after stripping `strip` leading
 * components. Returns null for entries that vanish after stripping (the
 * top-level "package/" directory itself). Throws on traversal attempts.
 */
export function safeEntryPath(archivePath: string, strip: number = 1): string | null {
  const unified = archivePath.replace(/\\/g, '/');

  if (
    unified.startsWith('/') ||
    /^[a-zA-Z]:/.test(unified) ||
    unified.split('/').some(seg => seg === '..')
  ) {
    throw new Error(`Refusing to extract unsafe path: ${archivePath}`);
  }

  const parts = unified.split('/').filter(seg => seg !== '' && seg !== '.');
  const rest  = parts.slice(strip);
  if (rest.length === 0) return null;

  if (rest.some(seg => seg.includes('\0') || /^[a-zA-Z]:$/.test(seg))) {
    throw new Error(`Refusing to extract unsafe path: ${archivePath}`);
  }
  return rest.join('/');
}

function assertInside(root: string, target: string, archivePath: string): void {
  const rel = relative(root, target);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel) || rel.split(sep)[0] === '..') {
    throw new Error(`Refusing to extract outside target directory: ${archivePath}`);
  }
}

/**
 * Extract a .tgz (or plain .tar) buffer into `destDir`.
 * Every entry is validated before anything is written, so a malicious
 * archive leaves the target untouched.
 */
export function extractTarball(
  tarball: Buffer,
  destDir: string,
  options: ExtractOptions = {}
): ExtractResult {
  const strip   = options.strip ?? 1;
  const root    = resolve(destDir);
  const entries = parseTar(maybeGunzip(tarball));

  // Pass 1: validate every path
  const planned: Array<{ entry: TarEntry; rel: string; abs: string }> = [];
  const result: ExtractResult = { files: [], directories: [], skipped: [] };

  for (const entry of entries) {
    const rel = safeEntryPath(entry.path, strip);
    if (rel === null) continue;

    const abs = resolve(root, ...rel.split('/'));
    assertInside(root, abs, entry.path);

    if (entry.type === 'file' || entry.type === 'directory') {
      planned.push({ entry, rel, abs });
    } else {
      result.skipped.push(entry.path);
    }
  }

  // Pass 2: write
  mkdirSync(root, { recursive: true });

  for (const { entry, rel, abs } of planned) {
    if (entry.type === 'directory') {
      mkdirSync(abs, { recursive: true });
      result.directories.push(rel);
      continue;
    }

    mkdirSync(dirname(abs), { recursive: true });
    // Always owner-readable/writable; keep executable bits from the archive
    const mode = ((entry.mode || 0o644) & 0o777) | 0o600;
    writeFileSync(abs, entry.data, { mode });
    try { chmodSync(abs, mode); } catch {}
    result.files.push(rel);
  }

  return result;
}

// ─── Writing (used by tests and tooling) ──────────────────────────────────────

export interface TarInputEntry {
  path: string;
  // Omit for directories
  content?: string | Buffer;
  type?: 'file' | 'directory' | 'symlink';
  mode?: number;
  linkname?: string;
}

function writeHeader(
  path: string,
  size: number,
  flag: string,
  mode: number,
  linkname = ''
): Buffer {
  const header = Buffer.alloc(BLOCK, 0);
  header.write(path.slice(0, 100), 0, 'utf8');
  header.write(mode.toString(8).padStart(7, '0') + '\0', 100, 'ascii');
  header.write('0000000\0', 108, 'ascii');
  header.write('0000000\0', 116, 'ascii');
  header.write(size.toString(8).padStart(11, '0') + '\0', 124, 'ascii');
  header.write('00000000000\0', 136, 'ascii');
  header.write('        ', 148, 'ascii');
  header.write(flag, 156, 'ascii');
  header.write(linkname.slice(0, 100), 157, 'utf8');
  header.write('ustar\0', 257, 'ascii');
  header.write('00', 263, 'ascii');

  let sum = 0;
  for (let i = 0; i < BLOCK; i++) sum += header[i];
  header.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 'ascii');
  return header;
}

function pad(data: Buffer): Buffer {
  const rem = data.length % BLOCK;
  return rem === 0 ? data : Buffer.concat([data, Buffer.alloc(BLOCK - rem, 0)]);
}

/**
 * Build an uncompressed tar archive. Paths longer than 100 bytes get a pax
 * header. Mostly useful for tests and fixtures.
 */
export function createTar(entries: TarInputEntry[]): Buffer {
  const chunks: Buffer[] = [];

  for (const e of entries) {
    const type = e.type ?? (e.content === undefined ? 'directory' : 'file');
    const data = type === 'file'
      ? (Buffer.isBuffer(e.content) ? e.content : Buffer.from(e.content ?? '', 'utf8'))
      : Buffer.alloc(0);
    const flag = type === 'directory' ? '5' : type === 'symlink' ? '2' : '0';
    const mode = e.mode ?? (type === 'directory' ? 0o755 : 0o644);

    if (Buffer.byteLength(e.path) > 100) {
      const record = (body: string): string => {
        // "<len> path=<value>\n" where len counts itself
        const bodyLen = Buffer.byteLength(body);
        let len = bodyLen + 3;
        while (String(len).length + bodyLen + 2 !== len) {
          len = String(len).length + bodyLen + 2;
        }
        return `${len} ${body}\n`;
      };
      const paxData = Buffer.from(record(`path=${e.path}`), 'utf8');
      chunks.push(writeHeader('PaxHeader', paxData.length, 'x', 0o644), pad(paxData));
    }

    chunks.push(writeHeader(e.path, data.length, flag, mode, e.linkname ?? ''));
    if (data.length > 0) chunks.push(pad(data));
  }

  chunks.push(Buffer.alloc(BLOCK * 2, 0));
  return Buffer.concat(chunks);
}
