import { describe, it, expect } from 'vitest';
import { Router } from '../src/router/router';
import { Trie } from '../src/router/trie';

const h = () => {};

describe('Trie', () => {
  it('matches static, param and wildcard routes with static > param > wildcard', () => {
    const t = new Trie<string>();
    t.insert('GET', '/users/me', 'static');
    t.insert('GET', '/users/:id', 'param');
    t.insert('GET', '/users/*', 'wild');

    expect(t.find('GET', '/users/me')?.handler).toBe('static');
    expect(t.find('GET', '/users/42')).toEqual({ handler: 'param', params: { id: '42' } });
    expect(t.find('GET', '/users/a/b')).toEqual({ handler: 'wild', params: { '*': 'a/b' } });
  });

  it('keeps param names per route and backtracks', () => {
    const t = new Trie<string>();
    t.insert('GET', '/users/:id', 'user');
    t.insert('GET', '/users/:userId/posts', 'posts');
    expect(t.find('GET', '/users/7/posts')?.params).toEqual({ userId: '7' });
    expect(t.find('GET', '/users/7')?.params).toEqual({ id: '7' });
  });

  it('decodes params and tolerates malformed escapes', () => {
    const t = new Trie<string>();
    t.insert('GET', '/files/:name', 'f');
    expect(t.find('GET', '/files/my%20file')?.params.name).toBe('my file');
    expect(t.find('GET', '/files/%E0%A4%A')?.params.name).toBe('%E0%A4%A');
  });

  it('is method specific and case-insensitive on method', () => {
    const t = new Trie<string>();
    t.insert('post', '/x', 'p');
    expect(t.find('GET', '/x')).toBeNull();
    expect(t.find('POST', '/x')?.handler).toBe('p');
  });

  it('falls back to an all-methods ("*") route, exact method wins', () => {
    const t = new Trie<string>();
    t.insert('*', '/any/:id', 'all');
    t.insert('GET', '/any/:id', 'get');
    expect(t.find('GET', '/any/1')).toEqual({ handler: 'get', params: { id: '1' } });
    expect(t.find('PATCH', '/any/2')).toEqual({ handler: 'all', params: { id: '2' } });
  });
});

describe('Router', () => {
  it('registers every method helper', () => {
    const r = new Router();
    r.get('/a', h).post('/a', h).put('/a', h).patch('/a', h).delete('/a', h).options('/a', h).head('/a', h);
    for (const m of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']) {
      expect(r.match(m, '/a')?.entry.method).toBe(m);
    }
  });

  it('all() matches any method', () => {
    const r = new Router();
    r.all('/ping', h);
    expect(r.match('DELETE', '/ping')).not.toBeNull();
    expect(r.match('OPTIONS', '/ping')).not.toBeNull();
  });

  it('separates route middleware from the handler', () => {
    const r = new Router();
    const mw = (_req: any, _res: any, next: any) => next();
    r.get('/m', mw, mw, h);
    const m = r.match('GET', '/m')!;
    expect(m.entry.middleware).toHaveLength(2);
    expect(m.entry.handler).toBe(h);
  });

  it('applies a prefix and normalizes slashes', () => {
    const r = new Router('/api/');
    r.get('//users/', h);
    expect(r.match('GET', '/api/users')).not.toBeNull();
  });

  it('keeps router-level middleware', () => {
    const r = new Router();
    const mw = (_req: any, _res: any, next: any) => next();
    r.use(mw);
    expect(r.getRouterMiddleware()).toEqual([mw]);
  });
});
