import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { createServer, request as httpRequest, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StudioServer } from '../src/server';
import { generateHTML } from '../src/ui/template';
import {
  intentEndpoint, readIntentReport, INTENT_ENDPOINT_PATH, INTENT_REPORT_KEY
} from '../src/intent';

const KEY = Symbol.for('axiljs.runtime.report');

const REPORT = {
  mode: 'enforce',
  enforced: [{ decorator: 'tAudit', order: 100 }, { decorator: 'tRetry', order: 200 }],
  violations: [
    { decorator: 'tIdempotent', target: 'Orders.create', detail: 'second call changed state', requestId: 'req-1', timestamp: '2026-11-17T10:00:00.000Z' },
    { decorator: 'tTenantScoped', target: 'Orders.list', detail: 'read another tenant', tenantId: 't-9', timestamp: '2026-11-17T10:00:05.000Z' }
  ],
  slo: [{ target: 'Orders.list', samples: 40, percentile: 99, observedMs: 180, targetMs: 150, errorRate: 0.05, errorBudget: 0.01, meetsLatency: false, meetsErrorBudget: false }],
  circuits: { 'Payments.charge': 'OPEN', 'Mail.send': 'CLOSED' },
  generatedAt: '2026-11-17T10:00:06.000Z'
};

function get(port: number, path: string, headers: Record<string, string> = {}) {
  return new Promise<{ status: number; headers: IncomingMessage['headers']; body: string; json: () => any }>((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path, headers: { host: `localhost:${port}`, ...headers } }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', c => { body += c; });
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body, json: () => JSON.parse(body) }));
    });
    req.on('error', reject);
    req.end();
  });
}

function listen(server: Server): Promise<number> {
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)));
}

function closed(): Promise<number> {
  // A port that was free a moment ago: nothing answers there
  const s = createServer();
  return listen(s).then(port => new Promise(resolve => s.close(() => resolve(port))));
}

let dir: string;
const servers: Server[] = [];
const studios: StudioServer[] = [];

async function studioFor(appPort: number, extra: Record<string, unknown> = {}): Promise<number> {
  const studio = new StudioServer({
    port: 0, host: '127.0.0.1', appPort, appName: 'intent-app', enableQR: false, openBrowser: false, cwd: dir, ...extra
  });
  await studio.start();
  studios.push(studio);
  return studio.getPort();
}

async function fakeApp(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<number> {
  const app = createServer(handler);
  servers.push(app);
  return listen(app);
}

beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  dir = mkdtempSync(join(tmpdir(), 'axil-studio-intent-'));
  mkdirSync(join(dir, 'src'));
});

afterEach(() => {
  delete (globalThis as any)[KEY];
});

afterAll(async () => {
  await Promise.all(studios.map(s => s.stop()));
  await Promise.all(servers.map(s => new Promise<void>(r => s.close(() => r()))));
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* Windows file locks */ }
});

describe('readIntentReport', () => {
  it('uses the global the runtime publishes', () => {
    expect(INTENT_REPORT_KEY).toBe(KEY);
    (globalThis as any)[KEY] = () => REPORT;
    const r = readIntentReport();
    expect(r.available).toBe(true);
    if (r.available) {
      expect(r.source).toBe('in-process');
      expect(r.mode).toBe('enforce');
      expect(r.violations).toHaveLength(2);
      expect(r.circuits['Payments.charge']).toBe('OPEN');
    }
  });

  it('is unavailable when the runtime is not loaded or the report throws', () => {
    const r = readIntentReport();
    expect(r.available).toBe(false);
    if (!r.available) expect(r.reason).toContain('@axiljs/runtime');

    (globalThis as any)[KEY] = () => { throw new Error('boom'); };
    const t = readIntentReport();
    expect(t.available).toBe(false);
    if (!t.available) expect(t.reason).toContain('boom');
  });

  it('fills in missing fields from a partial report', () => {
    (globalThis as any)[KEY] = () => ({ mode: 'bogus' });
    const r = readIntentReport();
    expect(r).toMatchObject({ available: true, mode: 'off', enforced: [], violations: [], slo: [], circuits: {} });
  });
});

describe('GET /api/studio/intent', () => {
  it('returns the in-process report when Studio shares the process with the runtime', async () => {
    (globalThis as any)[KEY] = () => REPORT;
    const port = await studioFor(await closed());
    const res = await get(port, '/api/studio/intent');
    expect(res.status).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ available: true, source: 'in-process', mode: 'enforce' });
    expect(body.violations.map((v: any) => v.target)).toEqual(['Orders.create', 'Orders.list']);
    expect(body.slo[0]).toMatchObject({ target: 'Orders.list', meetsLatency: false });
    expect(body.enforced).toEqual(REPORT.enforced);
  });

  it('fetches the report from the app process via intentEndpoint()', async () => {
    const seen: string[] = [];
    const appPort = await fakeApp((req, res) => {
      seen.push(req.url ?? '');
      if (req.url === INTENT_ENDPOINT_PATH) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ...REPORT, mode: 'warn' }));
        return;
      }
      res.writeHead(404); res.end();
    });
    const port = await studioFor(appPort);
    const body = (await get(port, '/api/studio/intent')).json();
    expect(seen).toEqual([INTENT_ENDPOINT_PATH]);
    expect(body).toMatchObject({ available: true, source: 'app', mode: 'warn' });
    expect(body.circuits).toEqual(REPORT.circuits);
  });

  it('honours a custom intentPath', async () => {
    const appPort = await fakeApp((req, res) => {
      if (req.url === '/dev/intent') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(REPORT)); return; }
      res.writeHead(404); res.end();
    });
    const port = await studioFor(appPort, { intentPath: '/dev/intent' });
    expect((await get(port, '/api/studio/intent')).json()).toMatchObject({ available: true, source: 'app' });
  });

  it('passes through the app saying the runtime is not loaded', async () => {
    const appPort = await fakeApp((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ available: false, reason: 'runtime missing in app' }));
    });
    const port = await studioFor(appPort);
    expect((await get(port, '/api/studio/intent')).json()).toEqual({ available: false, reason: 'runtime missing in app' });
  });

  it('is unavailable with a reason when the app has no endpoint, is down, or answers garbage', async () => {
    const notFound = await fakeApp((_req, res) => { res.writeHead(404); res.end('Not found'); });
    const nf = (await get(await studioFor(notFound), '/api/studio/intent')).json();
    expect(nf.available).toBe(false);
    expect(nf.reason).toContain('intentEndpoint()');

    const down = (await get(await studioFor(await closed()), '/api/studio/intent')).json();
    expect(down.available).toBe(false);
    expect(down.reason).toMatch(/Could not reach the app/);

    const garbage = await fakeApp((_req, res) => { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<html>'); });
    const g = (await get(await studioFor(garbage), '/api/studio/intent')).json();
    expect(g.available).toBe(false);
    expect(g.reason).toMatch(/JSON/);
  });

  it('keeps the Host header check', async () => {
    const port = await studioFor(await closed());
    expect((await get(port, '/api/studio/intent', { host: 'evil.example' })).status).toBe(403);
  });
});

describe('intentEndpoint()', () => {
  it('serves the report as a plain node:http handler and ignores other paths', async () => {
    (globalThis as any)[KEY] = () => REPORT;
    const handle = intentEndpoint({ enabled: true });
    const appPort = await fakeApp((req, res) => {
      if (handle(req, res)) return;
      res.writeHead(418); res.end();
    });
    const res = await get(appPort, INTENT_ENDPOINT_PATH);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.json()).toMatchObject({ available: true, mode: 'enforce' });
    expect((await get(appPort, '/other')).status).toBe(418);
    expect((await get(appPort, `${INTENT_ENDPOINT_PATH}?x=1`)).status).toBe(200);
  });

  it('works as AxilJS middleware and marks the response as sent', () => {
    (globalThis as any)[KEY] = () => REPORT;
    const mw = intentEndpoint({ enabled: true });
    const raw = { writeHead: vi.fn(), end: vi.fn() };
    const res = { raw, sent: false };
    const next = vi.fn();
    const req = { raw: { socket: { remoteAddress: '::ffff:127.0.0.1' } }, method: 'GET', path: INTENT_ENDPOINT_PATH };
    expect(mw(req, res, next)).toBe(true);
    expect(next).not.toHaveBeenCalled();
    expect(raw.writeHead).toHaveBeenCalledWith(200, expect.objectContaining({ 'Cache-Control': 'no-store' }));
    expect(JSON.parse(raw.end.mock.calls[0][0])).toMatchObject({ available: true });
    expect(res.sent).toBe(true);
  });

  it('calls next() when disabled, for other methods or paths, and for non-loopback clients', () => {
    const run = (opts: Parameters<typeof intentEndpoint>[0], req: any) => {
      const raw = { writeHead: vi.fn(), end: vi.fn() };
      const next = vi.fn();
      const handled = intentEndpoint(opts)(req, { raw, sent: false }, next);
      return { handled, next: next.mock.calls.length, wrote: raw.end.mock.calls.length };
    };
    const local = { socket: { remoteAddress: '127.0.0.1' } };
    expect(run({ enabled: false }, { raw: local, method: 'GET', path: INTENT_ENDPOINT_PATH })).toEqual({ handled: false, next: 1, wrote: 0 });
    expect(run({ enabled: true }, { raw: local, method: 'POST', path: INTENT_ENDPOINT_PATH })).toEqual({ handled: false, next: 1, wrote: 0 });
    expect(run({ enabled: true }, { raw: local, method: 'GET', path: '/users' })).toEqual({ handled: false, next: 1, wrote: 0 });
    expect(run({ enabled: true }, { raw: { socket: { remoteAddress: '10.0.0.7' } }, method: 'GET', path: INTENT_ENDPOINT_PATH })).toEqual({ handled: false, next: 1, wrote: 0 });
  });

  it('is off by default in production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const next = vi.fn();
      const handled = intentEndpoint()({ raw: { socket: { remoteAddress: '127.0.0.1' } }, method: 'GET', path: INTENT_ENDPOINT_PATH }, { raw: { writeHead: vi.fn(), end: vi.fn() } }, next);
      expect(handled).toBe(false);
      expect(next).toHaveBeenCalledOnce();
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});

describe('Intent view', () => {
  const html = generateHTML({ appName: 'intent-app', appUrl: 'http://localhost:4799', studioPort: 4800, qrDataUrl: '' });

  it('is in the sidebar and registered with the client router', () => {
    expect(html).toContain('data-view="intent"');
    expect(html).toContain('href="#/intent"');
    expect(html).toContain('defineView("intent"');
  });

  it('polls the intent endpoint every 2 s and explains how to enable it', () => {
    expect(html).toContain('"/api/studio/intent"');
    expect(html).toContain('INTENT_POLL_MS = 2000');
    expect(html).toContain("import '@axiljs/runtime'");
    expect(html).toContain('intentEndpoint()');
    expect(html).toContain('wire(');
    for (const id of ['intent-violations', 'intent-slo', 'intent-circuits', 'intent-enforced', 'intent-empty']) {
      expect(html, id).toContain(id);
    }
  });
});
