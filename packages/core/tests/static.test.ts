import { describe, it, expect, afterEach, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { serveStatic } from '../src/middleware/static';
import { createApp, start, stopAll } from './helpers';

let root: string;
const CONTENT = '0123456789abcdefghij'; // 20 bytes

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'axil-static-'));
  writeFileSync(join(root, 'file.txt'), CONTENT);
  writeFileSync(join(root, '.env'), 'SECRET=1');
  writeFileSync(join(root, 'empty.bin'), '');
  mkdirSync(join(root, 'docs'));
  writeFileSync(join(root, 'docs', 'index.html'), '<h1>docs</h1>');
});

afterAll(() => rmSync(root, { recursive: true, force: true }));
afterEach(stopAll);

async function serve(prefix = '') {
  const app = createApp();
  app.use(serveStatic({ root, prefix, maxAge: 60 }));
  return start(app);
}

describe('serveStatic basics', () => {
  it('serves files with type, length and cache headers', async () => {
    const base = await serve();
    const res = await fetch(`${base}/file.txt`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(CONTENT);
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(res.headers.get('content-length')).toBe('20');
    expect(res.headers.get('cache-control')).toBe('public, max-age=60');
    expect(res.headers.get('accept-ranges')).toBe('bytes');
    expect(res.headers.get('last-modified')).toBeTruthy();
  });

  it('serves directory index files', async () => {
    const base = await serve();
    const res = await fetch(`${base}/docs`);
    expect(await res.text()).toBe('<h1>docs</h1>');
  });

  it('blocks dotfiles and traversal, falls through to 404', async () => {
    const base = await serve();
    expect((await fetch(`${base}/.env`)).status).toBe(404);
    expect((await fetch(`${base}/..%2f..%2fetc%2fpasswd`)).status).toBe(404);
    expect((await fetch(`${base}/missing.txt`)).status).toBe(404);
  });

  it('honours the prefix on segment boundaries', async () => {
    const base = await serve('/static');
    expect(await (await fetch(`${base}/static/file.txt`)).text()).toBe(CONTENT);
    expect((await fetch(`${base}/staticfile.txt`)).status).toBe(404);
    expect((await fetch(`${base}/file.txt`)).status).toBe(404);
  });

  it('HEAD sends headers only, with the real length', async () => {
    const base = await serve();
    const res = await fetch(`${base}/file.txt`, { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-length')).toBe('20');
    expect(await res.text()).toBe('');
  });

  it('ignores non-GET/HEAD methods', async () => {
    const base = await serve();
    expect((await fetch(`${base}/file.txt`, { method: 'POST' })).status).toBe(404);
  });
});

describe('serveStatic ETag / conditional GET', () => {
  it('sends a weak ETag derived from size and mtime', async () => {
    const base = await serve();
    const res = await fetch(`${base}/file.txt`);
    const st = statSync(join(root, 'file.txt'));
    expect(res.headers.get('etag')).toBe(
      `W/"${st.size.toString(16)}-${Math.floor(st.mtimeMs).toString(16)}"`
    );
  });

  it('If-None-Match (exact, list, strong form, *) → 304 with no body', async () => {
    const base = await serve();
    const etag = (await fetch(`${base}/file.txt`)).headers.get('etag')!;

    for (const value of [etag, `"nope", ${etag}`, etag.slice(2), '*']) {
      const res = await fetch(`${base}/file.txt`, { headers: { 'If-None-Match': value } });
      expect(res.status).toBe(304);
      expect(res.headers.get('etag')).toBe(etag);
      expect(await res.text()).toBe('');
    }
  });

  it('a stale If-None-Match gets the full file', async () => {
    const base = await serve();
    const res = await fetch(`${base}/file.txt`, { headers: { 'If-None-Match': 'W/"old"' } });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(CONTENT);
  });

  it('If-Modified-Since at/after mtime → 304; before → 200', async () => {
    const base = await serve();
    const lastModified = (await fetch(`${base}/file.txt`)).headers.get('last-modified')!;
    const fresh = await fetch(`${base}/file.txt`, { headers: { 'If-Modified-Since': lastModified } });
    expect(fresh.status).toBe(304);

    const old = await fetch(`${base}/file.txt`, {
      headers: { 'If-Modified-Since': new Date(0).toUTCString() }
    });
    expect(old.status).toBe(200);
  });
});

describe('serveStatic Range requests', () => {
  it('serves a single range with 206 + Content-Range', async () => {
    const base = await serve();
    const res = await fetch(`${base}/file.txt`, { headers: { Range: 'bytes=2-5' } });
    expect(res.status).toBe(206);
    expect(res.headers.get('content-range')).toBe('bytes 2-5/20');
    expect(res.headers.get('content-length')).toBe('4');
    expect(await res.text()).toBe('2345');
  });

  it('supports open-ended and suffix ranges, clamping the end', async () => {
    const base = await serve();
    const open = await fetch(`${base}/file.txt`, { headers: { Range: 'bytes=15-' } });
    expect(await open.text()).toBe('fghij');
    expect(open.headers.get('content-range')).toBe('bytes 15-19/20');

    const suffix = await fetch(`${base}/file.txt`, { headers: { Range: 'bytes=-3' } });
    expect(await suffix.text()).toBe('hij');

    const clamped = await fetch(`${base}/file.txt`, { headers: { Range: 'bytes=18-999' } });
    expect(clamped.headers.get('content-range')).toBe('bytes 18-19/20');
    expect(await clamped.text()).toBe('ij');
  });

  it('416 with Content-Range */size when unsatisfiable', async () => {
    const base = await serve();
    const res = await fetch(`${base}/file.txt`, { headers: { Range: 'bytes=50-60' } });
    expect(res.status).toBe(416);
    expect(res.headers.get('content-range')).toBe('bytes */20');
    expect(await res.text()).toBe('');

    const empty = await fetch(`${base}/empty.bin`, { headers: { Range: 'bytes=0-' } });
    expect(empty.status).toBe(416);
  });

  it('ignores malformed, multi-range and non-byte ranges (200 full body)', async () => {
    const base = await serve();
    for (const range of ['bytes=5-2', 'bytes=0-1,4-5', 'items=0-1', 'bytes=abc']) {
      const res = await fetch(`${base}/file.txt`, { headers: { Range: range } });
      expect(res.status).toBe(200);
      expect(await res.text()).toBe(CONTENT);
    }
  });

  it('If-Range: matching date honours the range, ETag/other date does not', async () => {
    const base = await serve();
    const first = await fetch(`${base}/file.txt`);
    const lastModified = first.headers.get('last-modified')!;
    const etag = first.headers.get('etag')!;

    const ok = await fetch(`${base}/file.txt`, {
      headers: { Range: 'bytes=0-1', 'If-Range': lastModified }
    });
    expect(ok.status).toBe(206);

    for (const ifRange of [etag, new Date(0).toUTCString()]) {
      const res = await fetch(`${base}/file.txt`, {
        headers: { Range: 'bytes=0-1', 'If-Range': ifRange }
      });
      expect(res.status).toBe(200);
      expect(await res.text()).toBe(CONTENT);
    }
  });
});
