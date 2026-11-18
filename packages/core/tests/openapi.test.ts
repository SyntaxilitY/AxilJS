import { describe, it, expect, afterEach } from 'vitest';
import type { MiddlewareFn } from '@axiljs/common';
import { createTestClient } from '@axiljs/testing';
import { Router } from '../src/router/router';
import {
  generateOpenAPI,
  excludeFromOpenAPI,
  isAuthMiddleware,
  AUTH_MIDDLEWARE,
  OpenAPIDocument
} from '../src/openapi';
import * as Core from '../src/index';
// dist/ of validation is not rebuilt - use its source
import { v, validate } from '../../validation/src';
import { createApp, start, stopAll } from './helpers';

afterEach(stopAll);

const ok = (_req: any, res: any) => res.success({ ok: true });

/** Resolve a local JSON pointer ('#/components/schemas/X'). */
function resolvePointer(doc: unknown, pointer: string): unknown {
  if (!pointer.startsWith('#/')) return undefined;
  return pointer
    .slice(2)
    .split('/')
    .map(p => p.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce<any>((node, key) => (node == null ? undefined : node[key]), doc);
}

function collectRefs(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) node.forEach(n => collectRefs(n, out));
  else if (node && typeof node === 'object') {
    for (const [k, val] of Object.entries(node)) {
      if (k === '$ref' && typeof val === 'string') out.push(val);
      else collectRefs(val, out);
    }
  }
  return out;
}

/** Structural OpenAPI 3.1 checks a client generator relies on. */
function expectValidOpenAPI31(doc: OpenAPIDocument): void {
  expect(doc.openapi).toMatch(/^3\.1\.\d+$/);
  expect(typeof doc.info.title).toBe('string');
  expect(typeof doc.info.version).toBe('string');
  expect(doc.paths).toBeTypeOf('object');

  const methods = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];
  const ids = new Set<string>();
  for (const [path, item] of Object.entries(doc.paths)) {
    expect(path.startsWith('/')).toBe(true);
    const templated = [...path.matchAll(/\{([^}]+)\}/g)].map(m => m[1]);
    for (const [method, op] of Object.entries(item)) {
      expect(methods).toContain(method);
      expect(ids.has(op.operationId)).toBe(false);
      ids.add(op.operationId);
      expect(Object.keys(op.responses).length).toBeGreaterThan(0);
      // every template variable has exactly one required path parameter
      const pathParams = (op.parameters || []).filter(p => p.in === 'path');
      expect(pathParams.map(p => p.name).sort()).toEqual([...templated].sort());
      pathParams.forEach(p => expect(p.required).toBe(true));
    }
  }

  for (const r of collectRefs(doc)) {
    expect(resolvePointer(doc, r), `unresolved $ref ${r}`).toBeDefined();
  }
}

// A tiny app: global + mounted routers, params, body/query schemas, auth
function buildApp() {
  const app = createApp();

  const authenticate: MiddlewareFn = (req, _res, next) => {
    req.locals.user = { id: 1 };
    next();
  };

  const createUser = v.object({
    name: v.string().min(2),
    email: v.string().email(),
    role: v.enum(['admin', 'user']).optional()
  });
  const listQuery = v.object({
    page: v.number().integer().min(1).default(1),
    search: v.string().optional(),
    active: v.boolean()
  });

  app.get('/', ok);
  app.get('/health', ok);

  const users = new Router();
  users.get('/', validate({ query: listQuery }), ok);
  users.post('/', authenticate, validate({ body: createUser }), (_req, res) => res.created({}));
  users.get('/:id', validate({ params: v.object({ id: v.number().integer() }) }), ok);
  users.delete('/:id', authenticate, ok);
  app.mount('/api/users', users);

  // Prefix baked into the router, mounted at the same prefix
  const posts = new Router('/api/posts');
  posts.use(authenticate);
  posts.get('/', ok);
  posts.patch('/:postId', validate({ body: v.object({ title: v.string() }).optional() }), ok);
  app.mount('/api/posts', posts);

  return app;
}

describe('router.routes()', () => {
  it('lists routes in registration order with prefix and middleware', () => {
    const mw: MiddlewareFn = (_q, _s, n) => n();
    const routeMw: MiddlewareFn = (_q, _s, n) => n();
    const r = new Router('/v1');
    r.use(mw);
    r.get('/a', routeMw, ok);
    r.post('/a', ok);
    r.all('/any', ok);

    const routes = r.routes();
    expect(routes.map(x => `${x.method} ${x.path}`)).toEqual(['GET /v1/a', 'POST /v1/a', '* /v1/any']);
    expect(routes[0].middleware).toEqual([mw, routeMw]);
    expect(routes[0].handler).toBe(ok);
  });

  it('re-registering the same route shape replaces it (like the trie)', () => {
    const r = new Router();
    const h2 = () => {};
    r.get('/u/:id', ok);
    r.get('/u/:userId', h2);
    expect(r.routes()).toHaveLength(1);
    expect(r.routes()[0].path).toBe('/u/:userId');
    expect(r.routes()[0].handler).toBe(h2);
  });
});

describe('app.routes()', () => {
  it('applies the app prefix, mount prefixes and baked router prefixes', () => {
    const app = createApp({ prefix: '/root' });
    app.get('/ping', ok);

    const a = new Router();
    a.get('/', ok);
    a.get('/:id', ok);
    app.mount('/api', a);

    // nested mount prefix + router prefix
    const b = new Router('/items');
    b.get('/:itemId', ok);
    app.mount('/api/v2/', b);

    // baked prefix equal to the mount prefix is not doubled
    const c = new Router('/orders');
    c.get('/', ok);
    app.mount('/orders', c);

    expect(app.routes().map(r => `${r.method} ${r.path}`)).toEqual([
      'GET /root/ping',
      'GET /api',
      'GET /api/:id',
      'GET /api/v2/items/:itemId',
      'GET /orders'
    ]);
  });

  it('includes global middleware first and reports shadowed routes once', () => {
    const app = createApp();
    const g: MiddlewareFn = (_q, _s, n) => n();
    app.use(g);
    app.get('/x', ok);
    const r = new Router();
    r.get('/x', ok);
    app.mount('/', r);

    const routes = app.routes();
    expect(routes).toHaveLength(1);
    // logger + body parser built-ins, then g
    expect(routes[0].middleware.at(-1)).toBe(g);
    expect(routes[0].middleware.length).toBe(3);
  });

  it('every reported path is served at runtime', async () => {
    const app = buildApp();
    const base = await start(app);
    for (const route of app.routes()) {
      const url = base + route.path.replace(/:[^/]+/g, '7');
      const res = await fetch(url, {
        method: route.method,
        headers: { 'content-type': 'application/json' },
        body: ['POST', 'PATCH', 'PUT'].includes(route.method) ? '{}' : undefined
      });
      expect(res.status, `${route.method} ${route.path}`).not.toBe(404);
    }
  });
});

describe('generateOpenAPI()', () => {
  const doc = generateOpenAPI(buildApp(), {
    title: 'Test API',
    version: '1.2.3',
    description: 'For tests',
    servers: [{ url: 'http://localhost:3000' }]
  });

  it('produces a structurally valid OpenAPI 3.1 document', () => {
    expectValidOpenAPI31(doc);
    expect(doc.openapi).toBe('3.1.0');
    expect(doc.jsonSchemaDialect).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(doc.info).toEqual({ title: 'Test API', version: '1.2.3', description: 'For tests' });
    expect(doc.servers).toEqual([{ url: 'http://localhost:3000' }]);
    expect(Object.keys(doc.paths)).toEqual([
      '/', '/health', '/api/users', '/api/users/{id}', '/api/posts', '/api/posts/{postId}'
    ]);
  });

  it('derives stable, unique camelCase operationIds', () => {
    const ids = Object.values(doc.paths).flatMap(item => Object.values(item).map(op => op.operationId));
    expect(ids).toEqual([
      'getRoot', 'getHealth', 'getApiUsers', 'postApiUsers', 'getApiUsersById',
      'deleteApiUsersById', 'getApiPosts', 'patchApiPostsByPostId'
    ]);

    const app = createApp();
    app.get('/a-b', ok);
    app.get('/a/b', ok);
    app.get('/aB', ok);
    const again = generateOpenAPI(app, { title: 't', version: '1' });
    expect(Object.values(again.paths).map(i => i.get.operationId)).toEqual(['getAB', 'getAB2', 'getAB3']);
  });

  it('documents path params from the params schema (string by default)', () => {
    expect(doc.paths['/api/users/{id}'].get.parameters).toEqual([
      { name: 'id', in: 'path', required: true, schema: { type: 'integer' } }
    ]);
    expect(doc.paths['/api/users/{id}'].delete.parameters).toEqual([
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
    ]);
  });

  it('documents query params from the query schema', () => {
    expect(doc.paths['/api/users'].get.parameters).toEqual([
      { name: 'page', in: 'query', required: false, schema: { type: 'integer', minimum: 1, default: 1 } },
      { name: 'search', in: 'query', required: false, schema: { type: 'string' } },
      { name: 'active', in: 'query', required: true, schema: { type: 'boolean' } }
    ]);
  });

  it('puts request bodies in components and references them', () => {
    const post = doc.paths['/api/users'].post;
    expect(post.requestBody).toEqual({
      required: true,
      content: { 'application/json': { schema: { $ref: '#/components/schemas/PostApiUsersBody' } } }
    });
    expect(doc.components.schemas.PostApiUsersBody).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 2 },
        email: { type: 'string', format: 'email' },
        role: { type: 'string', enum: ['admin', 'user'] }
      },
      required: ['name', 'email']
    });
    // optional() body schema -> requestBody not required
    expect(doc.paths['/api/posts/{postId}'].patch.requestBody!.required).toBe(false);
  });

  it('documents the envelope and error responses', () => {
    const post = doc.paths['/api/users'].post;
    expect(post.responses['201']).toEqual({
      description: 'Created',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/Envelope' } } }
    });
    expect(Object.keys(post.responses).sort()).toEqual(['201', '401', '403', '422', '4XX', '5XX']);
    expect(Object.keys(doc.paths['/health'].get.responses).sort()).toEqual(['200', '4XX', '5XX']);
    expect(doc.paths['/api/users/{id}'].get.responses['404']).toEqual({ $ref: '#/components/responses/Error' });

    expect(doc.components.schemas.Envelope.required).toEqual(['status', 'code', 'message', 'data']);
    expect((doc.components.schemas.ErrorResponse as any).properties.error.required).toEqual(['code', 'message']);
  });

  it('marks auth routes with bearer security (route and router middleware)', () => {
    expect(doc.components.securitySchemes).toEqual({
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
    });
    expect(doc.paths['/api/users'].post.security).toEqual([{ bearerAuth: [] }]);
    expect(doc.paths['/api/users'].get.security).toBeUndefined();
    expect(doc.paths['/api/posts'].get.security).toEqual([{ bearerAuth: [] }]);
  });

  it('auth detection: names, Symbol marker, custom predicate; no scheme without auth', () => {
    function requireRoleAdmin() {}
    const anon = () => {};
    const marked = Object.assign(() => {}, { [AUTH_MIDDLEWARE]: true });
    expect(isAuthMiddleware(requireRoleAdmin)).toBe(true);
    expect(isAuthMiddleware(function requireAuth() {})).toBe(true);
    expect(isAuthMiddleware(anon)).toBe(false);
    expect(isAuthMiddleware(marked)).toBe(true);

    const app = createApp();
    app.get('/a', marked as MiddlewareFn, ok);
    app.get('/b', anon as MiddlewareFn, ok);
    const d = generateOpenAPI(app, { title: 't', version: '1', isAuthMiddleware: fn => fn === anon });
    expect(d.paths['/a'].get.security).toBeUndefined();
    expect(d.paths['/b'].get.security).toEqual([{ bearerAuth: [] }]);

    const plain = createApp();
    plain.get('/x', ok);
    expect(generateOpenAPI(plain, { title: 't', version: '1' }).components.securitySchemes).toBeUndefined();
  });

  it('skips all(), wildcard and excluded routes; normalizes param names per shape', () => {
    const app = createApp();
    app.all('/any', ok);
    app.get('/files/*', ok);
    app.get('/hidden', excludeFromOpenAPI((_q, res) => res.success()));
    app.get('/u/:id', ok);
    app.put('/u/:userId', validate({ params: v.object({ userId: v.number() }) }), ok);
    app.head('/u/:id', ok);

    const d = generateOpenAPI(app, { title: 't', version: '1' });
    expectValidOpenAPI31(d);
    expect(Object.keys(d.paths)).toEqual(['/u/{id}']);
    expect(d.paths['/u/{id}'].put.parameters).toEqual([
      { name: 'id', in: 'path', required: true, schema: { type: 'number' } }
    ]);
    expect(d.paths['/u/{id}'].head.responses['200']).toEqual({ description: 'Successful response (headers only)' });
  });

  it('duck-types schemas: fn.schemas with plain JSON Schema, later middleware wins', () => {
    const app = createApp();
    const custom = Object.assign(((_q, _s, n) => n()) as MiddlewareFn, {
      schemas: { body: { type: 'object', properties: { a: { type: 'string' } } } }
    });
    const notSchemas = Object.assign(((_q, _s, n) => n()) as MiddlewareFn, { schemas: 'nope' });
    app.post('/a', notSchemas, validate({ body: v.object({ x: v.number() }) }), custom, ok);
    const d = generateOpenAPI(app, { title: 't', version: '1' });
    expect(d.components.schemas.PostABody).toEqual({ type: 'object', properties: { a: { type: 'string' } } });
    expectValidOpenAPI31(d);
  });

  it('is exported from the package index', () => {
    expect(Core.generateOpenAPI).toBe(generateOpenAPI);
    expect(typeof Core.excludeFromOpenAPI).toBe('function');
    expect(Core.OPENAPI_VERSION).toBe('3.1.0');
  });
});

describe('app.openapi() / app.serveOpenAPI()', () => {
  it('app.openapi() equals generateOpenAPI(app)', () => {
    const app = buildApp();
    const opts = { title: 'T', version: '1' };
    expect(app.openapi(opts)).toEqual(generateOpenAPI(app, opts));
  });

  it('serves the document as JSON, lazily and cached, and leaves itself out', async () => {
    const app = buildApp();
    app.serveOpenAPI({ title: 'Served', version: '2.0.0' });
    const client = createTestClient(app as any);

    const res = await client.get('/openapi.json');
    expect(res.status).toBe(200);
    expect(String(res.headers['content-type'])).toContain('application/json');
    expect(res.body.openapi).toBe('3.1.0');
    expect(res.body.info).toEqual({ title: 'Served', version: '2.0.0' });
    expect(res.body.paths['/openapi.json']).toBeUndefined();
    expect(res.body.paths['/api/users/{id}']).toBeDefined();
    expectValidOpenAPI31(res.body);

    // generated once: routes added afterwards are not in the cached document
    app.get('/late', ok);
    const again = await client.get('/openapi.json');
    expect(again.body.paths['/late']).toBeUndefined();
  });

  it('accepts a custom path and honours the app prefix', async () => {
    const app = createApp({ prefix: '/v1' });
    app.get('/ping', ok);
    app.serveOpenAPI('/docs/openapi.json', { title: 'P', version: '1' });
    const client = createTestClient(app as any);

    const res = await client.get('/v1/docs/openapi.json');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.paths)).toEqual(['/v1/ping']);
    expect(() => (app as any).serveOpenAPI('/x')).toThrow(TypeError);
  });
});
