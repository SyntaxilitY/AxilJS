import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createRequire } from 'node:module';
import { createServer, request as httpRequest, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StudioServer } from '../src/server';

const require = createRequire(import.meta.url);

function send(port: number, path: string, opts: { method?: string; headers?: Record<string, string>; body?: string } = {}) {
  return new Promise<{ status: number; json: () => any }>((resolve, reject) => {
    const headers: Record<string, string> = { host: `localhost:${port}`, ...opts.headers };
    if (opts.body !== undefined) headers['content-length'] = String(Buffer.byteLength(opts.body));
    const req = httpRequest({ host: '127.0.0.1', port, path, method: opts.method ?? 'GET', headers }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', c => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, json: () => JSON.parse(body) }));
    });
    req.on('error', reject);
    if (opts.body !== undefined) req.write(opts.body);
    req.end();
  });
}

const rows = (port: number, table: string, params: Record<string, string>) =>
  send(port, `/api/studio/table/${table}?${new URLSearchParams(params)}`);

const proxy = (port: number, input: unknown, contentType = 'application/json') =>
  send(port, '/api/studio/proxy', { method: 'POST', headers: { 'content-type': contentType }, body: JSON.stringify(input) });

let dir: string;
let studio: StudioServer;
let port: number;
let app: Server;
let seen: Array<{ method?: string; url?: string; headers: Record<string, unknown>; body: string }>;

beforeAll(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  dir = mkdtempSync(join(tmpdir(), 'axil-studio-api-'));
  mkdirSync(join(dir, 'src'));
  writeFileSync(join(dir, 'src', 'main.ts'), `app.get('/users', list)`);

  const Database = require('better-sqlite3');
  const db = new Database(join(dir, 'dev.db'));
  db.exec(`
    CREATE TABLE users  (id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT, age INTEGER);
    CREATE TABLE orders (id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id), status TEXT, total REAL);
    CREATE INDEX idx_orders_status ON orders (status, total);
    INSERT INTO users (email, name, age) VALUES
      ('ann@x.io', 'Ann', 31), ('bob@x.io', 'Bob', 25), ('cy@x.io', 'Cy 100%_off', NULL), ('dee@x.io', 'Dee', 42);
    INSERT INTO orders (user_id, status, total) VALUES (1, 'paid', 10), (1, 'paid', 99.5), (2, 'open', 5), (4, 'paid', 250);
  `);
  db.close();

  // A fake app for the proxy
  seen = [];
  app = createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, headers: req.headers, body });
      res.setHeader('x-request-id', 'abc');
      res.writeHead(req.url?.startsWith('/missing') ? 404 : 200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, url: req.url }));
    });
  });
  await new Promise<void>(r => app.listen(0, '127.0.0.1', () => r()));

  studio = new StudioServer({
    port: 0, host: '127.0.0.1',
    appPort: (app.address() as AddressInfo).port,
    appName: 'api', dbDriver: 'sqlite', dbFile: join(dir, 'dev.db'),
    enableQR: false, openBrowser: false, cwd: dir
  });
  await studio.start();
  port = studio.getPort();
});

afterAll(async () => {
  await studio?.stop();
  await new Promise(r => app?.close(r));
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows file locks */ }
});

describe('GET /api/studio/table/:name (sort, search, filters)', () => {
  it('sorts by a column in either direction', async () => {
    const desc = (await rows(port, 'users', { sort: 'age', dir: 'desc' })).json();
    expect(desc.rows.map((r: any) => r.name)).toEqual(['Dee', 'Ann', 'Bob', 'Cy 100%_off']);
    const asc = (await rows(port, 'orders', { sort: 'total', limit: '2' })).json();
    expect(asc.rows.map((r: any) => r.total)).toEqual([5, 10]);
    expect(asc.total).toBe(4);
  });

  it('searches every column case-insensitively, with % and _ taken literally', async () => {
    expect((await rows(port, 'users', { q: 'BOB' })).json().total).toBe(1);
    expect((await rows(port, 'users', { q: '42' })).json().rows[0].name).toBe('Dee');
    expect((await rows(port, 'users', { q: '%_' })).json().rows.map((r: any) => r.name)).toEqual(['Cy 100%_off']);
    expect((await rows(port, 'users', { q: 'zzz' })).json()).toEqual({ rows: [], total: 0 });
  });

  it('combines filters and counts the filtered total', async () => {
    const filter = JSON.stringify([
      { column: 'status', op: 'eq', value: 'paid' },
      { column: 'total', op: 'gte', value: 50 }
    ]);
    const res = (await rows(port, 'orders', { filter, sort: 'total' })).json();
    expect(res.total).toBe(2);
    expect(res.rows.map((r: any) => r.total)).toEqual([99.5, 250]);

    const nulls = (await rows(port, 'users', { filter: JSON.stringify([{ column: 'age', op: 'null' }]) })).json();
    expect(nulls.rows.map((r: any) => r.name)).toEqual(['Cy 100%_off']);
    const starts = (await rows(port, 'users', { filter: JSON.stringify([{ column: 'email', op: 'starts', value: 'B' }]) })).json();
    expect(starts.total).toBe(1);
  });

  it('binds values, so injected SQL is just a value', async () => {
    const filter = JSON.stringify([{ column: 'name', op: 'eq', value: "x' OR '1'='1" }]);
    expect((await rows(port, 'users', { filter })).json()).toEqual({ rows: [], total: 0 });
  });

  it('rejects unknown columns, operators, directions and malformed filters with 400', async () => {
    const bad = [
      { sort: 'id; DROP TABLE users' },
      { sort: 'id', dir: 'sideways' },
      { filter: JSON.stringify([{ column: 'nope', op: 'eq', value: 1 }]) },
      { filter: JSON.stringify([{ column: 'id', op: 'like', value: 1 }]) },
      { filter: '{"column":"id"}' },
      { filter: 'not json' }
    ];
    for (const params of bad) {
      const res = await rows(port, 'users', params);
      expect(res.status, JSON.stringify(params)).toBe(400);
      expect(res.json().error).toBeTruthy();
    }
    expect((await rows(port, 'users', {})).json().total).toBe(4);
  });
});

describe('GET /api/studio/schema', () => {
  it('returns tables with foreign keys, indexes and unique columns', async () => {
    const schema = (await send(port, '/api/studio/schema')).json();
    expect(schema.driver).toBe('sqlite');
    const orders = schema.tables.find((t: any) => t.name === 'orders');
    const users = schema.tables.find((t: any) => t.name === 'users');
    expect(orders.foreignKeys).toEqual([{ column: 'user_id', refTable: 'users', refColumn: 'id' }]);
    expect(orders.indexes).toEqual([{ name: 'idx_orders_status', unique: false, columns: ['status', 'total'] }]);
    expect(orders.rowCount).toBe(4);
    expect(users.columns.find((c: any) => c.name === 'email').unique).toBe(true);
    expect(users.columns.find((c: any) => c.name === 'id').primary).toBe(true);
  });
});

describe('POST /api/studio/proxy', () => {
  it('forwards method, path, query, headers and body to the app', async () => {
    seen.length = 0;
    const res = await proxy(port, {
      method: 'post',
      path: '/users/7',
      query: { expand: 'orders', page: 2 },
      headers: { Authorization: 'Bearer t0k', 'Content-Type': 'application/json', Host: 'evil.com' },
      body: '{"name":"Ann"}'
    });
    expect(res.status).toBe(200);
    const out = res.json();
    expect(out.status).toBe(200);
    expect(out.headers['x-request-id']).toBe('abc');
    expect(JSON.parse(out.body)).toEqual({ ok: true, url: '/users/7?expand=orders&page=2' });
    expect(out.size).toBeGreaterThan(0);
    expect(typeof out.timeMs).toBe('number');

    expect(seen[0].method).toBe('POST');
    expect(seen[0].headers.authorization).toBe('Bearer t0k');
    expect(String(seen[0].headers.host)).not.toBe('evil.com');
    expect(seen[0].body).toBe('{"name":"Ann"}');
  });

  it('passes error statuses through instead of failing', async () => {
    const out = (await proxy(port, { method: 'GET', path: '/missing' })).json();
    expect(out.status).toBe(404);
  });

  it('only ever targets the app', async () => {
    for (const path of ['//evil.com/x', 'http://evil.com/', 'users', '']) {
      const res = await proxy(port, { method: 'GET', path });
      expect(res.status, path).toBe(400);
    }
    seen.length = 0;
    const res = await proxy(port, { method: 'GET', path: '/@evil.com' });
    expect(res.json().status).toBe(200);
    expect(seen[0].url).toBe('/@evil.com');
  });

  it('rejects other methods and non-JSON requests', async () => {
    expect((await proxy(port, { method: 'CONNECT', path: '/' })).status).toBe(400);
    expect((await proxy(port, { method: 'GET', path: '/' }, 'text/plain')).status).toBe(415);
  });

  it('reports an unreachable app as 502', async () => {
    const down = new StudioServer({
      port: 0, host: '127.0.0.1', appPort: 1, appName: 'x',
      enableQR: false, openBrowser: false, cwd: dir
    });
    await down.start();
    try {
      const res = await proxy(down.getPort(), { method: 'GET', path: '/' });
      expect(res.status).toBe(502);
      expect(res.json().error).toMatch(/Could not reach the app/);
    } finally {
      await down.stop();
    }
  });
});
