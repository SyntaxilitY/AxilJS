import { describe, it, expect } from 'vitest';
import { callArguments, handlerName, middlewareName } from '../src/collectors/route-collector';

const argsOf = (src: string) => callArguments(src, src.indexOf('('));

describe('route argument parsing', () => {
  it('splits only top-level arguments of this call', () => {
    expect(argsOf(`app.get('/', (req, res) => res.json({ a: [1, 2], b: 'x,y' }))`))
      .toEqual([`'/'`, `(req, res) => res.json({ a: [1, 2], b: 'x,y' })`]);
    expect(argsOf(`router.post('/users', authenticate(), validate({ body: s }), users.create)`))
      .toEqual([`'/users'`, 'authenticate()', 'validate({ body: s })', 'users.create']);
  });

  it('ignores commas and brackets inside strings, templates and comments', () => {
    expect(argsOf("app.get('/a', /* x, ( */ h1 // y, )\n)")).toEqual([`'/a'`, 'h1']);
    expect(argsOf("app.get('/u', proxy('http://x.io/a,b'))")).toEqual([`'/u'`, "proxy('http://x.io/a,b')"]);
    expect(argsOf('app.get(`/t`, (q, r) => r.send(`a,(b`))')).toEqual(['`/t`', '(q, r) => r.send(`a,(b`)']);
  });

  it('does not look past the end of the call (no bleed into the next route)', () => {
    const src = `app.get('/', (req, res) => res.success({}))\napp.post('/auth/login', authenticate, login)`;
    expect(argsOf(src)).toEqual([`'/'`, '(req, res) => res.success({})']);
  });

  it('names handlers and middleware', () => {
    expect(handlerName('(req, res) => res.success({})')).toBe('anonymous');
    expect(handlerName('async (req, res) => {}')).toBe('anonymous');
    expect(handlerName('req => 1')).toBe('anonymous');
    expect(handlerName('async function getUser(req, res) {}')).toBe('getUser');
    expect(handlerName('users.list')).toBe('users.list');
    expect(handlerName('ctrl.get.bind(ctrl)')).toBe('ctrl.get');
    expect(middlewareName('authenticate()')).toBe('authenticate');
    expect(middlewareName("requireRole('admin')")).toBe('requireRole');
    expect(middlewareName('auth.required')).toBe('auth.required');
    expect(middlewareName('(req, res, next) => next()')).toBe('inline');
  });
});

// ─── Mount prefixes ───────────────────────────────────────────────────────────

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RouteCollector, joinPath, collectMounts } from '../src/collectors/route-collector';

function project(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'axil-routes-'));
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(join(dir, 'src', name, '..'), { recursive: true });
    writeFileSync(join(dir, 'src', name), body);
  }
  const paths = new RouteCollector(dir).collect().routes.map(r => `${r.method} ${r.path}`);
  rmSync(dir, { recursive: true, force: true });
  return paths;
}

describe('mount prefixes', () => {
  it('joins prefixes and paths', () => {
    expect(joinPath('/auth', '/register')).toBe('/auth/register');
    expect(joinPath('/products/', '/:id')).toBe('/products/:id');
    expect(joinPath('/products', '/')).toBe('/products');
    expect(joinPath('', '/health')).toBe('/health');
  });

  it('collects mounts of factories and router variables', () => {
    const m = collectMounts([`app.mount('/auth', authRoutes({ users }))\napp.mount('/users', usersRouter)`]);
    expect(m.get('authRoutes')).toEqual(['/auth']);
    expect(m.get('usersRouter')).toEqual(['/users']);
  });

  it('applies app.mount prefixes to routes defined in router factories (rest-api template layout)', () => {
    const paths = project({
      'app.ts': `
        app.get('/health', h)
        app.mount('/auth', authRoutes({ users, jwt }))
        app.mount('/products', productRoutes({ products }))`,
      'routes/auth.ts': `
        export function authRoutes(deps) {
          const router = new Router()
          router.post('/register', validate({ body: B }), async (req, res) => {})
          router.get('/me', authenticate(jwt), async (req, res) => {})
          return router
        }`,
      'routes/products.ts': `
        export function productRoutes({ products }) {
          const router = new Router()
          router.get('/', list)
          router.get('/:id', get)
          router.delete('/:id', requireAuth, remove)
          return router
        }`,
    });
    expect(paths).toEqual(expect.arrayContaining([
      'GET /health', 'POST /auth/register', 'GET /auth/me',
      'GET /products', 'GET /products/:id', 'DELETE /products/:id',
    ]));
    expect(paths).not.toContain('POST /register');
  });

  it('handles mounted router variables, baked prefixes and unmounted routers', () => {
    const paths = project({
      'app.ts': `app.mount('/users', usersRouter)\napp.mount('/v1', adminRouter)`,
      'users.ts': `export const usersRouter = new Router()\nusersRouter.get('/:id', show)`,
      'admin.ts': `export const adminRouter = new Router('/admin')\nadminRouter.get('/stats', stats)`,
      'loose.ts': `const router = new Router()\nrouter.get('/ping', ping)`,
    });
    expect(paths).toEqual(expect.arrayContaining(['GET /users/:id', 'GET /v1/admin/stats', 'GET /ping']));
  });

  it('lists a router mounted twice under both prefixes', () => {
    const paths = project({
      'app.ts': `app.mount('/v1', api())\napp.mount('/v2', api())`,
      'api.ts': `export function api() { const router = new Router(); router.get('/items', items); return router }`,
    });
    expect(paths).toEqual(expect.arrayContaining(['GET /v1/items', 'GET /v2/items']));
  });
});

describe('baked router prefixes', () => {
  it('does not double a prefix that matches the mount point', () => {
    const paths = project({
      'app.ts': `app.mount('/users', usersRouter)`,
      'users.ts': `export const usersRouter = new Router('/users')\nusersRouter.get('/:id', show)`,
    });
    expect(paths).toContain('GET /users/:id');
  });
});
