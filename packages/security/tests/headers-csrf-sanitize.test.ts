import { describe, it, expect } from 'vitest';
import { ForbiddenError } from '@axiljs/common';
import { helmet, csrf, sanitize, escapeHtml, sanitizeObject } from '../src/index';
import { mockReq, mockRes, run } from './mocks';

describe('helmet', () => {
  it('sets the default security headers and removes X-Powered-By', async () => {
    const res = mockRes();
    const out = await run(helmet(), mockReq(), res);
    expect(out.called).toBe(true);
    expect(res.headers['Content-Security-Policy']).toContain("default-src 'self'");
    expect(res.headers['X-Frame-Options']).toBe('DENY');
    expect(res.headers['Strict-Transport-Security']).toBe('max-age=15552000; includeSubDomains');
    expect(res.headers['X-Content-Type-Options']).toBe('nosniff');
    expect(res.headers['X-XSS-Protection']).toBe('1; mode=block');
    expect(res.headers['Referrer-Policy']).toBe('no-referrer');
    expect(res.headers['Permissions-Policy']).toContain('camera=()');
    expect(res.removed).toContain('X-Powered-By');
  });

  it('honours overrides and disabling', async () => {
    const res = mockRes();
    await run(
      helmet({
        contentSecurityPolicy: "default-src 'none'",
        frameOptions: 'SAMEORIGIN',
        hsts: { maxAge: 10, includeSubDomains: false },
        referrerPolicy: false,
        noSniff: false,
        xssFilter: false,
        permissionsPolicy: false,
        hidePoweredBy: false
      }),
      mockReq(),
      res
    );
    expect(res.headers['Content-Security-Policy']).toBe("default-src 'none'");
    expect(res.headers['X-Frame-Options']).toBe('SAMEORIGIN');
    expect(res.headers['Strict-Transport-Security']).toBe('max-age=10');
    expect(res.headers['Referrer-Policy']).toBeUndefined();
    expect(res.headers['X-Content-Type-Options']).toBeUndefined();
    expect(res.headers['X-XSS-Protection']).toBeUndefined();
    expect(res.headers['Permissions-Policy']).toBeUndefined();
    expect(res.removed).toEqual([]);

    const noCsp = mockRes();
    await run(helmet({ contentSecurityPolicy: false, frameOptions: false, hsts: false }), mockReq(), noCsp);
    expect(noCsp.headers['Content-Security-Policy']).toBeUndefined();
    expect(noCsp.headers['X-Frame-Options']).toBeUndefined();
    expect(noCsp.headers['Strict-Transport-Security']).toBeUndefined();
  });
});

describe('csrf (double submit cookie)', () => {
  it('issues a readable (non-HttpOnly) token cookie on first visit', async () => {
    const res = mockRes();
    const req = mockReq();
    const out = await run(csrf(), req, res);
    expect(out.error).toBeUndefined();
    const cookie = res.headers['Set-Cookie'];
    expect(cookie).toMatch(/^_csrf=[0-9a-f]{64}; Path=\/; SameSite=strict$/);
    expect(cookie).not.toMatch(/HttpOnly/i);
    expect(req.locals.csrfToken).toBe(cookie.split(';')[0].split('=')[1]);
  });

  it('lets safe methods through without a header', async () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS'] as const) {
      const out = await run(csrf(), mockReq({ method, headers: { cookie: '_csrf=abc' } }), mockRes());
      expect(out.error).toBeUndefined();
    }
  });

  it('rejects unsafe requests with a missing or mismatched header', async () => {
    const missing = await run(csrf(), mockReq({ method: 'POST', headers: { cookie: '_csrf=abc' } }), mockRes());
    expect(missing.error).toBeInstanceOf(ForbiddenError);

    const wrong = await run(
      csrf(),
      mockReq({ method: 'POST', headers: { cookie: '_csrf=abc', 'x-csrf-token': 'abd' } }),
      mockRes()
    );
    expect(wrong.error).toBeInstanceOf(ForbiddenError);
  });

  it('accepts a matching header, with custom cookie/header names and options', async () => {
    const ok = await run(
      csrf(),
      mockReq({ method: 'DELETE', headers: { cookie: 'a=1; _csrf=tok', 'x-csrf-token': 'tok' } }),
      mockRes()
    );
    expect(ok.error).toBeUndefined();

    const res = mockRes();
    const custom = await run(
      csrf({ cookieName: 'xsrf', headerName: 'X-XSRF', cookie: { secure: true, sameSite: 'lax', path: '/app' } }),
      mockReq({ method: 'POST', headers: { 'x-xsrf': 'nope' } }),
      res
    );
    expect(res.headers['Set-Cookie']).toMatch(/^xsrf=\w+; Path=\/app; SameSite=lax; Secure$/);
    expect(custom.error).toBeInstanceOf(ForbiddenError);
  });
});

describe('sanitize', () => {
  it('escapes HTML special characters', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#x27;y&#x27;&gt;&amp;&lt;&#x2F;a&gt;'
    );
  });

  it('sanitizes nested objects and arrays, leaving other types alone', () => {
    expect(sanitizeObject({ a: '<b>', n: 1, list: ['<i>', true, null], deep: { x: '"' } })).toEqual({
      a: '&lt;b&gt;',
      n: 1,
      list: ['&lt;i&gt;', true, null],
      deep: { x: '&quot;' }
    });
  });

  it('does not let a __proto__ key replace the prototype', () => {
    const input = JSON.parse('{"__proto__": {"polluted": "<x>"}}');
    const out = sanitizeObject(input) as Record<string, any>;
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(({} as any).polluted).toBeUndefined();
    expect(Object.getOwnPropertyDescriptor(out, '__proto__')?.value).toEqual({ polluted: '&lt;x&gt;' });
  });

  it('middleware sanitizes body and query, but not params by default', async () => {
    const req = mockReq({
      body: { name: '<script>' },
      query: { q: '<q>', list: ['<1>', '<2>'] },
      params: { id: '<id>' }
    });
    await run(sanitize(), req, mockRes());
    expect(req.body).toEqual({ name: '&lt;script&gt;' });
    expect(req.query).toEqual({ q: '&lt;q&gt;', list: ['&lt;1&gt;', '&lt;2&gt;'] });
    expect(req.params.id).toBe('<id>');

    const req2 = mockReq({ body: { a: '<' }, query: { q: '<' }, params: { id: '<' } });
    await run(sanitize({ body: false, query: false, params: true }), req2, mockRes());
    expect(req2.body).toEqual({ a: '<' });
    expect(req2.query).toEqual({ q: '<' });
    expect(req2.params.id).toBe('&lt;');
  });
});
