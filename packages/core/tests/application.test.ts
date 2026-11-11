import { describe, it, expect, afterEach, vi } from 'vitest';
import { connect } from 'node:net';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Router } from '../src/router/router';
import { coreVersion } from '../src/application';
import { axilError, BadRequestError, MiddlewareFn } from '@axiljs/common';
import { createApp, start, stopAll } from './helpers';

afterEach(stopAll);

describe('Application routing', () => {
  it('routes by method and path, with params and query', async () => {
    const app = createApp();
    app.get('/users/:id', (req, res) => res.json({ id: req.params.id, q: req.query }));
    app.post('/users', (_req, res) => res.status(201).json({ ok: true }));
    const base = await start(app);

    const r1 = await fetch(`${base}/users/42?sort=asc`);
    expect(r1.status).toBe(200);
    expect(await r1.json()).toEqual({ id: '42', q: { sort: 'asc' } });

    const r2 = await fetch(`${base}/users`, { method: 'POST' });
    expect(r2.status).toBe(201);
  });

  it('applies the global prefix', async () => {
    const app = createApp({ prefix: '/api' });
    app.get('/ping', (_req, res) => res.text('pong'));
    const base = await start(app);
    expect(await (await fetch(`${base}/api/ping`)).text()).toBe('pong');
    expect((await fetch(`${base}/ping`)).status).toBe(404);
  });

  it('returns a JSON 404 for unknown routes', async () => {
    const app = createApp();
    const base = await start(app);
    const res = await fetch(`${base}/nope`);
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe('NOT_FOUND');
    expect(body.error.message).toBe('Cannot GET /nope');
  });

  it('mounts routers relative to the prefix on segment boundaries', async () => {
    const app = createApp();
    const users = new Router();
    users.get('/', (_req, res) => res.text('list'));
    users.get('/:id', (req, res) => res.text(`user ${req.params.id}`));
    app.mount('/users', users);
    const base = await start(app);

    expect(await (await fetch(`${base}/users`)).text()).toBe('list');
    expect(await (await fetch(`${base}/users/5`)).text()).toBe('user 5');
    expect((await fetch(`${base}/usersettings`)).status).toBe(404);
  });

  it('supports routers created with the prefix baked in', async () => {
    const app = createApp();
    const r = new Router('/v1');
    r.get('/items', (_req, res) => res.text('items'));
    app.mount('/v1', r);
    const base = await start(app);
    expect(await (await fetch(`${base}/v1/items`)).text()).toBe('items');
  });

  it('runs global → router → route middleware → handler in order', async () => {
    const app = createApp();
    const order: string[] = [];
    const mark = (name: string): MiddlewareFn => (_req, _res, next) => {
      order.push(name);
      next();
    };
    app.use(mark('global'));
    const r = new Router();
    r.use(mark('router'));
    r.get('/x', mark('route'), (_req, res) => {
      order.push('handler');
      res.text('ok');
    });
    app.mount('/r', r);
    const base = await start(app);

    await (await fetch(`${base}/r/x`)).text();
    expect(order).toEqual(['global', 'router', 'route', 'handler']);
  });

  it('lets middleware short-circuit and share locals', async () => {
    const app = createApp();
    app.use((req, _res, next) => {
      req.locals.user = 'ann';
      next();
    });
    app.get('/me', (req, res) => res.text(String(req.locals.user)));
    app.get('/blocked', (_req, res) => res.status(403).text('no'), () => {
      throw new Error('should not run');
    });
    const base = await start(app);
    expect(await (await fetch(`${base}/me`)).text()).toBe('ann');
    expect((await fetch(`${base}/blocked`)).status).toBe(403);
  });
});

describe('Error handling', () => {
  it('maps axilError subclasses to their status and code', async () => {
    const app = createApp();
    app.get('/bad', () => {
      throw new BadRequestError('nope');
    });
    app.get('/teapot', () => {
      throw new axilError('short and stout', 418, 'TEAPOT');
    });
    const base = await start(app);

    const r1 = await fetch(`${base}/bad`);
    expect(r1.status).toBe(400);
    expect((await r1.json()).error).toMatchObject({ code: 'BAD_REQUEST', message: 'nope' });

    const r2 = await fetch(`${base}/teapot`);
    expect(r2.status).toBe(418);
    expect((await r2.json()).error.code).toBe('TEAPOT');
  });

  it('maps unknown errors (thrown, async or via next) to 500', async () => {
    const app = createApp();
    app.get('/sync', () => {
      throw new Error('boom');
    });
    app.get('/async', async () => {
      await Promise.resolve();
      throw new Error('async boom');
    });
    app.get('/next', (_req, _res, next) => next(new Error('via next')), () => {});
    const base = await start(app);

    for (const p of ['/sync', '/async', '/next']) {
      const res = await fetch(base + p);
      expect(res.status).toBe(500);
      expect((await res.json()).error.code).toBe('INTERNAL_ERROR');
    }
  });

  it('hides 500 messages and stacks in production', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const app = createApp();
      app.get('/x', () => {
        throw new Error('secret detail');
      });
      const base = await start(app);
      const body = await (await fetch(`${base}/x`)).json();
      expect(body.error).toEqual({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('runs 4-arg error middleware, which can respond or pass on', async () => {
    const app = createApp();
    const seen: string[] = [];
    app.use((err: Error, _req: any, _res: any, next: any) => {
      seen.push(`first:${err.message}`);
      next(err);
    });
    app.use((err: Error, _req: any, res: any, _next: any) => {
      seen.push('second');
      res.status(503).json({ custom: err.message });
    });
    app.get('/x', () => {
      throw new Error('kaput');
    });
    const base = await start(app);
    const res = await fetch(`${base}/x`);
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ custom: 'kaput' });
    expect(seen).toEqual(['first:kaput', 'second']);
  });

  it('ignores a second next() call from the same middleware', async () => {
    const app = createApp();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let handlerRuns = 0;
    app.use((_req, _res, next) => {
      next();
      next();
    });
    app.get('/x', (_req, res) => {
      handlerRuns++;
      res.text('once');
    });
    const base = await start(app);
    expect(await (await fetch(`${base}/x`)).text()).toBe('once');
    expect(handlerRuns).toBe(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('next() called multiple times'));
  });

  it('ignores next() after next(err)', async () => {
    const app = createApp();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    let handlerRuns = 0;
    app.use((_req, _res, next) => {
      next(new BadRequestError('first'));
      next();
    });
    app.get('/x', (_req, res) => {
      handlerRuns++;
      res.text('should not run');
    });
    const base = await start(app);
    const res = await fetch(`${base}/x`);
    expect(res.status).toBe(400);
    expect(handlerRuns).toBe(0);
  });
});

describe('Envelope responses', () => {
  it('formats success/created/badRequest envelopes', async () => {
    const app = createApp();
    app.get('/ok', (_req, res) => res.success({ a: 1 }, 'Fetched'));
    app.post('/new', (_req, res) => res.created({ id: 1 }));
    app.get('/bad', (_req, res) => res.badRequest('Nope', { field: 'x' }));
    app.get('/legacy', (_req, res) => res.HTTP_404_NOT_FOUND('gone'));
    const base = await start(app);

    expect(await (await fetch(`${base}/ok`)).json()).toEqual({
      status: 200,
      code: 'HTTP_200_OK',
      message: 'Fetched',
      data: { a: 1 }
    });

    const created = await fetch(`${base}/new`, { method: 'POST' });
    expect(created.status).toBe(201);
    expect((await created.json()).code).toBe('HTTP_201_CREATED');

    const bad = await fetch(`${base}/bad`);
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ message: 'Nope', data: { field: 'x' } });

    const legacy = await fetch(`${base}/legacy`);
    expect(legacy.status).toBe(404);
  });

  it('noContent sends a bare 204', async () => {
    const app = createApp();
    app.delete('/x', (_req, res) => res.noContent());
    const base = await start(app);
    const res = await fetch(`${base}/x`, { method: 'DELETE' });
    expect(res.status).toBe(204);
    expect(await res.text()).toBe('');
  });

  it('paginated computes page metadata, and limit 0 gives 0 pages', async () => {
    const app = createApp();
    app.get('/p', (_req, res) => res.paginated([1, 2], 5, 1, 2));
    app.get('/zero', (_req, res) => res.paginated([], 5, 1, 0));
    const base = await start(app);

    const p = (await (await fetch(`${base}/p`)).json()).data;
    expect(p.metadata).toEqual([1, 2]);
    expect(p.pagination).toEqual({
      total: 5,
      page: 1,
      limit: 2,
      totalPages: 3,
      hasNextPage: true,
      hasPrevPage: false
    });

    const zero = (await (await fetch(`${base}/zero`)).json()).data.pagination;
    expect(zero.totalPages).toBe(0);
    expect(zero.hasNextPage).toBe(false);
  });

  it('redirects', async () => {
    const app = createApp();
    app.get('/old', (_req, res) => res.redirect('/new', 301));
    const base = await start(app);
    const res = await fetch(`${base}/old`, { redirect: 'manual' });
    expect(res.status).toBe(301);
    expect(res.headers.get('location')).toBe('/new');
  });
});

describe('HEAD / OPTIONS / all()', () => {
  it('answers HEAD with the GET route by default (headers, no body)', async () => {
    const app = createApp();
    let calls = 0;
    app.get('/doc', (_req, res) => {
      calls++;
      res.header('X-Doc', 'yes');
      res.json({ hello: 'world' });
    });
    const base = await start(app);
    const res = await fetch(`${base}/doc`, { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(res.headers.get('x-doc')).toBe('yes');
    expect(res.headers.get('content-length')).toBe(String('{"hello":"world"}'.length));
    expect(await res.text()).toBe('');
    expect(calls).toBe(1);
  });

  it('prefers an explicit HEAD route', async () => {
    const app = createApp();
    app.get('/doc', (_req, res) => res.text('get'));
    app.head('/doc', (_req, res) => res.header('X-Head', '1').status(200).send(''));
    const base = await start(app);
    const res = await fetch(`${base}/doc`, { method: 'HEAD' });
    expect(res.headers.get('x-head')).toBe('1');
  });

  it('HEAD fallback also works for mounted routers', async () => {
    const app = createApp();
    const r = new Router();
    r.get('/:id', (req, res) => res.text(req.params.id));
    app.mount('/items', r);
    const base = await start(app);
    const res = await fetch(`${base}/items/9`, { method: 'HEAD' });
    expect(res.status).toBe(200);
  });

  it('headFallback: false restores the old 404 for HEAD', async () => {
    const app = createApp({ server: { headFallback: false } });
    app.get('/doc', (_req, res) => res.text('get'));
    const base = await start(app);
    expect((await fetch(`${base}/doc`, { method: 'HEAD' })).status).toBe(404);
  });

  it('options() registers an OPTIONS route', async () => {
    const app = createApp();
    app.options('/x', (_req, res) => res.header('Allow', 'GET').status(204).send(''));
    const base = await start(app);
    const res = await fetch(`${base}/x`, { method: 'OPTIONS' });
    expect(res.status).toBe(204);
    expect(res.headers.get('allow')).toBe('GET');
  });

  it('all() handles any method; a specific route wins', async () => {
    const app = createApp();
    app.all('/any', (req, res) => res.text(`all:${req.method}`));
    app.get('/any', (_req, res) => res.text('get'));
    const base = await start(app);
    expect(await (await fetch(`${base}/any`)).text()).toBe('get');
    expect(await (await fetch(`${base}/any`, { method: 'PUT' })).text()).toBe('all:PUT');
    expect(await (await fetch(`${base}/any`, { method: 'DELETE' })).text()).toBe('all:DELETE');
  });
});

describe('405 Method Not Allowed', () => {
  it('is off by default (404)', async () => {
    const app = createApp();
    app.get('/x', (_req, res) => res.text('x'));
    const base = await start(app);
    const res = await fetch(`${base}/x`, { method: 'DELETE' });
    expect(res.status).toBe(404);
    expect(res.headers.get('allow')).toBeNull();
  });

  it('returns 405 with Allow when enabled', async () => {
    const app = createApp({ server: { methodNotAllowed: true } });
    app.get('/x/:id', (_req, res) => res.text('x'));
    app.post('/x/:id', (_req, res) => res.text('x'));
    const base = await start(app);

    const res = await fetch(`${base}/x/1`, { method: 'DELETE' });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET, HEAD, POST');
    expect((await res.json()).error.code).toBe('METHOD_NOT_ALLOWED');

    // Unknown paths are still 404
    expect((await fetch(`${base}/y`, { method: 'DELETE' })).status).toBe(404);
  });

  it('answers OPTIONS on a known path with 204 + Allow', async () => {
    const app = createApp({ server: { methodNotAllowed: true } });
    app.put('/x', (_req, res) => res.text('x'));
    const base = await start(app);
    const res = await fetch(`${base}/x`, { method: 'OPTIONS' });
    expect(res.status).toBe(204);
    expect(res.headers.get('allow')).toBe('PUT');
  });

  it('considers mounted routers', async () => {
    const app = createApp({ server: { methodNotAllowed: true } });
    const r = new Router();
    r.patch('/:id', (_req, res) => res.text('p'));
    app.mount('/things', r);
    const base = await start(app);
    const res = await fetch(`${base}/things/3`, { method: 'GET' });
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('PATCH');
  });
});

describe('trustProxy', () => {
  it('ignores X-Forwarded-For by default', async () => {
    const app = createApp();
    app.get('/ip', (req, res) => res.text(req.ip));
    const base = await start(app);
    const res = await fetch(`${base}/ip`, { headers: { 'X-Forwarded-For': '203.0.113.9' } });
    expect(await res.text()).toMatch(/127\.0\.0\.1$/);
  });

  it('trustProxy: true uses the left-most X-Forwarded-For entry', async () => {
    const app = createApp({ server: { trustProxy: true } });
    app.get('/ip', (req, res) => res.text(req.ip));
    const base = await start(app);
    const res = await fetch(`${base}/ip`, { headers: { 'X-Forwarded-For': '203.0.113.9' } });
    expect(await res.text()).toBe('203.0.113.9');
  });

  it('trustProxy: false uses the socket address', async () => {
    const app = createApp({ server: { trustProxy: false } });
    app.get('/ip', (req, res) => res.text(req.ip));
    const base = await start(app);
    const res = await fetch(`${base}/ip`, { headers: { 'X-Forwarded-For': '203.0.113.9' } });
    expect(await res.text()).toMatch(/127\.0\.0\.1$/);
  });

  it('trustProxy: 1 takes the right-most forwarded address', async () => {
    const app = createApp({ server: { trustProxy: 1 } });
    app.get('/ip', (req, res) => res.text(req.ip));
    const base = await start(app);
    const res = await fetch(`${base}/ip`, { headers: { 'X-Forwarded-For': '6.6.6.6, 198.51.100.4' } });
    expect(await res.text()).toBe('198.51.100.4');
  });
});

describe('Body parsing and server limits', () => {
  it('parses JSON, urlencoded and text bodies', async () => {
    const app = createApp();
    app.post('/echo', (req, res) => res.json({ body: req.body }));
    const base = await start(app);

    const json = await fetch(`${base}/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ a: 1 })
    });
    expect((await json.json()).body).toEqual({ a: 1 });

    const form = await fetch(`${base}/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'name=J+D&x=1%3D2'
    });
    expect((await form.json()).body).toEqual({ name: 'J D', x: '1=2' });

    const text = await fetch(`${base}/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'hi'
    });
    expect((await text.json()).body).toBe('hi');
  });

  it('rejects invalid JSON with 400', async () => {
    const app = createApp();
    app.post('/echo', (req, res) => res.json(req.body));
    const base = await start(app);
    const res = await fetch(`${base}/echo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{nope'
    });
    expect(res.status).toBe(400);
  });

  it('honours server.bodyLimit (413 when exceeded)', async () => {
    const app = createApp({ server: { bodyLimit: '10b' } });
    app.post('/echo', (req, res) => res.json(req.body));
    const base = await start(app);

    const small = await fetch(`${base}/echo`, { method: 'POST', body: 'tiny' });
    expect(small.status).toBe(200);

    const big = await fetch(`${base}/echo`, { method: 'POST', body: 'x'.repeat(100) });
    expect(big.status).toBe(413);
    expect((await big.json()).error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('rejects an invalid bodyLimit at construction', () => {
    expect(() => createApp({ server: { bodyLimit: 'huge' } })).toThrow(/Invalid size/);
  });

  it('honours server.timeout (408 for a request that never completes)', async () => {
    const app = createApp({ server: { timeout: 200 } });
    app.get('/x', (_req, res) => res.text('x'));
    const base = await start(app);
    expect(app.getServer()!.requestTimeout).toBe(200);

    const port = Number(new URL(base).port);
    const reply = await new Promise<string>((resolve, reject) => {
      const socket = connect(port, '127.0.0.1', () => {
        // Headers never finish
        socket.write('GET /x HTTP/1.1\r\nHost: localhost\r\n');
      });
      let data = '';
      socket.on('data', chunk => (data += chunk));
      socket.on('close', () => resolve(data));
      socket.on('error', reject);
      setTimeout(() => {
        socket.destroy();
        resolve(data);
      }, 3000);
    });
    expect(reply).toMatch(/^HTTP\/1\.1 408/);
  });

  it('leaves Node timeouts alone when server.timeout is unset', async () => {
    const app = createApp();
    await start(app);
    expect(app.getServer()!.requestTimeout).toBe(300000);
  });
});

describe('Raw body', () => {
  it('exposes the exact raw JSON text as req.rawBody and req.locals.rawBody', async () => {
    const app = createApp();
    let seen: { raw?: string; local?: unknown; body?: unknown } = {};
    app.post('/hook', (req, res) => {
      seen = { raw: (req as any).rawBody, local: req.locals.rawBody, body: req.body };
      res.json({ ok: true });
    });
    const base = await start(app);

    const payload = '{\n  "name": "Zoë ✓ 日本",\n  "n":   1\n}\n';
    const res = await fetch(`${base}/hook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    });
    expect(res.status).toBe(200);
    expect(seen.raw).toBe(payload);
    expect(seen.local).toBe(payload);
    expect(Buffer.from(seen.raw!, 'utf-8').equals(Buffer.from(payload, 'utf-8'))).toBe(true);
    expect(seen.body).toEqual({ name: 'Zoë ✓ 日本', n: 1 });
  });

  it('sets rawBody for urlencoded and text bodies, not for GET', async () => {
    const app = createApp();
    app.all('/raw', (req, res) => res.json({ raw: (req as any).rawBody ?? null }));
    const base = await start(app);

    const form = await fetch(`${base}/raw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'a=1&b=x+y'
    });
    expect((await form.json()).raw).toBe('a=1&b=x+y');

    const text = await fetch(`${base}/raw`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: 'hello'
    });
    expect((await text.json()).raw).toBe('hello');

    expect((await (await fetch(`${base}/raw`)).json()).raw).toBeNull();
  });
});

describe('Startup banner', () => {
  function bannerOutput(spy: ReturnType<typeof vi.spyOn>): string {
    return spy.mock.calls.map(c => c.join(' ')).join('\n');
  }

  it('is not printed when logging is false', async () => {
    const app = createApp({ logging: false, env: 'development' });
    const spy = vi.mocked(console.log);
    await start(app);
    expect(bannerOutput(spy as any)).not.toContain('Server running');
  });

  it('is not printed when env is test', async () => {
    const app = createApp({ logging: true, env: 'test' });
    const spy = vi.mocked(console.log);
    await start(app);
    expect(bannerOutput(spy as any)).not.toContain('Server running');
  });

  it('prints the real @axiljs/core version', async () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
    expect(coreVersion()).toBe(pkg.version);

    const app = createApp({ logging: true, env: 'development' });
    const spy = vi.mocked(console.log);
    await start(app);
    const out = bannerOutput(spy as any);
    expect(out).toContain('Server running');
    expect(out).toContain(`v${pkg.version}`);
    expect(out).not.toContain('v0.1.0');
  });
});
