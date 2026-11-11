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
