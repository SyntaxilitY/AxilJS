import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createRequire } from 'node:module';
import { request as httpRequest } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StudioServer } from '../src/server';
import { generatePostmanCollection } from '../src/generators/postman';
import { generateHTML } from '../src/ui/template';

const require = createRequire(import.meta.url);

interface Res {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
  json: () => any;
}

function send(
  port: number,
  path: string,
  opts: { method?: string; headers?: Record<string, string>; body?: string; chunked?: boolean } = {}
): Promise<Res> {
  return new Promise((resolve, reject) => {
    const headers: Record<string, string> = { host: `localhost:${port}`, ...opts.headers };
    if (opts.body !== undefined && !opts.chunked && !('content-length' in headers)) {
      headers['content-length'] = String(Buffer.byteLength(opts.body));
    }
    const req = httpRequest({ host: '127.0.0.1', port, path, method: opts.method ?? 'GET', headers }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', c => { body += c; });
      res.on('end', () => resolve({
        status: res.statusCode ?? 0,
        headers: res.headers,
        body,
        json: () => JSON.parse(body)
      }));
    });
    req.on('error', reject);
    if (opts.body !== undefined) req.write(opts.body);
    req.end();
  });
}

const query = (port: number, sql: string) =>
  send(port, '/api/studio/query', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sql })
  });

let dir: string;
let studio: StudioServer;
let port: number;

beforeAll(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  dir = mkdtempSync(join(tmpdir(), 'axil-studio-'));
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'routes.ts'), `
    router.get('/users', listUsers)
    router.post('/users', createUser)
    router.get('/users/:id', getUser)
  `);

  const Database = require('better-sqlite3');
  const db = new Database(join(dir, 'dev.db'));
  db.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)`);
  db.exec(`INSERT INTO users (name) VALUES ('ann'), ('bob')`);
  db.close();

  studio = new StudioServer({
    port: 0,
    host: '127.0.0.1',
    appPort: 3000,
    appName: '<script>alert(1)</script>',
    dbDriver: 'sqlite',
    dbFile: join(dir, 'dev.db'),
    enableQR: false,
    openBrowser: false,
    allowedHosts: ['studio.test'],
    maxBodyBytes: 512,
    cwd: dir
  });
  await studio.start();
  port = studio.getPort();
});

afterAll(async () => {
  await studio?.stop();
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows file locks */ }
});

describe('Host header check (DNS rebinding)', () => {
  it('rejects foreign Host headers', async () => {
    const res = await send(port, '/api/studio/data', { headers: { host: `evil.example:${port}` } });
    expect(res.status).toBe(403);
    expect((await send(port, '/', { headers: { host: 'localhost.evil.example' } })).status).toBe(403);
  });

  it('accepts local and configured hosts', async () => {
    for (const host of [`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`, 'studio.test', 'LOCALHOST']) {
      const res = await send(port, '/api/studio/data', { headers: { host } });
      expect(res.status, host).toBe(200);
    }
  });
});

describe('CORS', () => {
  it('echoes local origins only', async () => {
    const local = await send(port, '/api/studio/data', { headers: { origin: 'http://localhost:3000' } });
    expect(local.headers['access-control-allow-origin']).toBe('http://localhost:3000');

    const evil = await send(port, '/api/studio/data', { headers: { origin: 'https://evil.example' } });
    expect(evil.status).toBe(200);
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('answers preflight requests', async () => {
    const res = await send(port, '/api/studio/query', {
      method: 'OPTIONS',
      headers: { origin: 'http://127.0.0.1:3000' }
    });
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-methods']).toContain('POST');
  });
});

describe('studio UI', () => {
  it('HTML-escapes the app name', async () => {
    const res = await send(port, '/');
    expect(res.status).toBe(200);
    expect(res.body).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(res.body).not.toContain('<script>alert(1)</script>');
  });

  it('generateHTML escapes quotes and ampersands', () => {
    const html = generateHTML({ appName: `a"b'&c`, appUrl: 'http://localhost:1', studioPort: 2, qrDataUrl: '' });
    expect(html).toContain('a&quot;b&#39;&amp;c');
  });
});

describe('table browser', () => {
  it('returns rows', async () => {
    const res = await send(port, '/api/studio/table/users?limit=1');
    expect(res.json()).toEqual({ rows: [{ id: 1, name: 'ann' }], total: 2 });
  });

  it('treats an injection attempt as an (unknown) table name', async () => {
    const attack = encodeURIComponent('users"; DROP TABLE users; --');
    const res = await send(port, `/api/studio/table/${attack}`);
    expect(res.json()).toEqual({ rows: [], total: 0 });

    const union = encodeURIComponent('users" UNION SELECT 1, sqlite_version() --');
    expect((await send(port, `/api/studio/table/${union}`)).json()).toEqual({ rows: [], total: 0 });

    expect((await send(port, '/api/studio/table/users')).json().total).toBe(2);
  });

  it('sanitises limit / offset', async () => {
    const res = await send(port, '/api/studio/table/users?limit=1;DROP&offset=-5');
    expect(res.json().rows).toHaveLength(2); // invalid limit falls back to 50
  });
});

describe('read-only SQL console', () => {
  it('runs SELECT', async () => {
    const res = await query(port, 'SELECT name FROM users ORDER BY id');
    expect(res.json().rows).toEqual([{ name: 'ann' }, { name: 'bob' }]);
  });

  it('rejects writes', async () => {
    expect((await query(port, 'DELETE FROM users')).json().error).toMatch(/Only SELECT/);
    expect((await query(port, 'SELECT 1; DROP TABLE users')).json().error).toBeTruthy();
    expect((await query(port, `WITH x AS (SELECT 1) INSERT INTO users (name) VALUES ('x')`)).json().error).toBeTruthy();
    expect((await query(port, 'SELECT COUNT(*) AS c FROM users')).json().rows).toEqual([{ c: 2 }]);
  });

  it('blocks INTO OUTFILE / DUMPFILE', async () => {
    for (const sql of [
      `SELECT * FROM users INTO OUTFILE '/tmp/x'`,
      `SELECT * FROM users INTO/**/DUMPFILE '/tmp/x'`,
      `SELECT * FROM users /*!50000 into outfile '/tmp/x' */`
    ]) {
      expect((await query(port, sql)).json().error, sql).toMatch(/OUTFILE/);
    }
  });

  it('reports a missing sql field', async () => {
    const res = await send(port, '/api/studio/query', { method: 'POST', body: '{}' });
    expect(res.json().error).toMatch(/Missing sql/);
  });

  it('returns 413 for oversized bodies (declared and streamed)', async () => {
    const declared = await send(port, '/api/studio/query', {
      method: 'POST',
      headers: { 'content-length': '100000' },
      body: '{}'
    });
    expect(declared.status).toBe(413);

    const streamed = await send(port, '/api/studio/query', {
      method: 'POST',
      headers: { 'transfer-encoding': 'chunked' },
      chunked: true,
      body: JSON.stringify({ sql: `SELECT '${'x'.repeat(2000)}'` })
    });
    expect(streamed.status).toBe(413);

    // Server still healthy
    expect((await query(port, 'SELECT 1 AS one')).json().rows).toEqual([{ one: 1 }]);
  });
});

describe('exports', () => {
  it('Postman url.host is an array of host parts', async () => {
    const res = await send(port, '/api/studio/export/postman');
    const collection = res.json();
    const items = collection.item.flatMap((g: any) => g.item);
    expect(items.map((i: any) => i.name).sort()).toEqual(['GET /users', 'GET /users/:id', 'POST /users']);
    const url = items.find((i: any) => i.name === 'GET /users/:id').request.url;
    expect(url).toMatchObject({
      raw: 'http://localhost:3000/users/:id',
      protocol: 'http',
      host: ['localhost'],
      port: '3000',
      path: ['users', ':id'],
      variable: [{ key: 'id', value: '{{id}}' }]
    });
  });

  it('splits dotted host names', () => {
    const c = generatePostmanCollection('x', 'https://api.example.com', [
      { method: 'GET', path: '/a', handler: 'h', middleware: [] }
    ]) as any;
    const url = c.item[0].item[0].request.url;
    expect(url.host).toEqual(['api', 'example', 'com']);
    expect(url.protocol).toBe('https');
    expect(url.port).toBeUndefined();
  });

  it('Insomnia and OpenAPI exports', async () => {
    const insomnia = (await send(port, '/api/studio/export/insomnia')).json();
    expect(insomnia).toBeTruthy();
    const openapi = (await send(port, '/api/studio/export/openapi')).json();
    expect(openapi.openapi).toBe('3.0.3');
    expect(Object.keys(openapi.paths).sort()).toEqual(['/users', '/users/{id}']);
    expect(openapi.paths['/users'].post.requestBody).toBeTruthy();
  });
});

describe('postgres connection handling', () => {
  it('ends the pool on a failed connect and does not open one per table request', async () => {
    const pg = require('pg');
    const Original = pg.Pool;
    let created = 0;
    let ended = 0;
    pg.Pool = class extends Original {
      constructor(options: unknown) {
        super(options);
        created++;
      }
      end(...args: unknown[]) {
        ended++;
        return super.end(...args);
      }
    };

    const pgStudio = new StudioServer({
      port: 0,
      host: '127.0.0.1',
      appPort: 3000,
      appName: 'pg',
      dbDriver: 'postgres',
      dbUrl: 'postgres://u:p@127.0.0.1:1/db',
      enableQR: false,
      openBrowser: false,
      cwd: dir
    });
    try {
      await pgStudio.start();
      expect(created).toBe(1);
      expect(ended).toBe(1);

      const p = pgStudio.getPort();
      const results = await Promise.all([1, 2, 3].map(() => send(p, '/api/studio/table/users')));
      for (const r of results) expect(r.json()).toEqual({ rows: [], total: 0 });
      expect(created).toBe(1); // throttled — no new pool per request

      // Concurrent explicit attempts share one in-flight connection
      await Promise.all([
        (pgStudio as any).connectToDatabase(),
        (pgStudio as any).connectToDatabase()
      ]);
      expect(created).toBe(2);
      expect(ended).toBe(2);
    } finally {
      await pgStudio.stop();
      pg.Pool = Original;
    }
  });
});
