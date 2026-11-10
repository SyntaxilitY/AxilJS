import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>();
  return { ...actual, writeFileSync: vi.fn(), mkdirSync: vi.fn() };
});

import { writeFileSync, mkdirSync } from 'fs';
import { generateDeployment } from '../src/deployment';
import { tenantRateLimiter } from '../src/rate-limiter';
import { multiTenancy, getTenantId } from '../src/multi-tenancy';
import { QuotaManager } from '../src/quota';
import { UnauthorizedError } from '@axiljs/common';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function req(overrides: Record<string, unknown> = {}): any {
  return {
    raw: {}, method: 'GET', url: '/api', path: '/api', params: {}, query: {},
    headers: {}, body: {}, locals: {}, ip: '127.0.0.1', ...overrides
  };
}

function envelopeRes(): any {
  const headers: Record<string, unknown> = {};
  return {
    raw: { setHeader: (k: string, v: unknown) => { headers[k] = v; } },
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    _headers: headers
  };
}

function rawNodeRes(): any {
  return {
    statusCode: 200,
    headersSent: false,
    setHeader: vi.fn(),
    writeHead: vi.fn(),
    end: vi.fn()
  };
}

describe('deployment manifests', () => {
  const config = { appName: 'svc', version: '1.0', port: 3000 };

  it('quotes the version label so YAML keeps it a string', () => {
    const [, , k8s] = generateDeployment(config, true);
    const labels = k8s.content.match(/version: .*/g)!;
    expect(labels).toHaveLength(2);
    for (const l of labels) expect(l).toBe('version: "1.0"');
    // Unquoted, YAML would read 1.0 as the float 1
    expect(k8s.content).not.toMatch(/version: 1\.0$/m);
  });

  it('escapes odd version strings', () => {
    const [, , k8s] = generateDeployment({ ...config, version: 'v2: "beta"' }, true);
    expect(k8s.content).toContain('version: "v2: \\"beta\\""');
  });

  it('logs ./deploy/ (not ././deploy/) when writing files', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    generateDeployment(config, false);
    expect(mkdirSync).toHaveBeenCalledWith('./deploy', { recursive: true });
    expect(writeFileSync).toHaveBeenCalledTimes(3);
    const msg = String(log.mock.calls[0][0]);
    expect(msg).toContain('in ./deploy/');
    expect(msg).not.toContain('././');
  });
});

describe('rate limiter over-limit responses', () => {
  const tenantReq = () => req({ locals: { tenant: { id: 't1', name: 'T', status: 'active' } } });

  it('uses the envelope response when available', () => {
    const mw = tenantRateLimiter({ defaultRule: { max: 1, windowMs: 60_000 } });
    const next = vi.fn();
    mw(tenantReq(), envelopeRes(), next);
    const res = envelopeRes();
    mw(tenantReq(), res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(429);
  });

  it('ends a raw Node response with 429', () => {
    const mw = tenantRateLimiter({ defaultRule: { max: 1, windowMs: 60_000 } });
    const next = vi.fn();
    mw(tenantReq(), rawNodeRes(), next);
    const res = rawNodeRes();
    mw(tenantReq(), res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.writeHead).toHaveBeenCalledWith(429, expect.objectContaining({ 'Retry-After': expect.any(String) }));
    expect(res.end).toHaveBeenCalled();
  });

  it('ends res.raw for unknown wrapper shapes instead of calling next()', () => {
    const mw = tenantRateLimiter({ defaultRule: { max: 1, windowMs: 60_000 } });
    const next = vi.fn();
    const make = () => {
      const raw: any = { statusCode: 200, headersSent: false, setHeader: vi.fn(), end: vi.fn() };
      return { raw, send: vi.fn() }; // no status/json, no writeHead
    };
    mw(tenantReq(), make(), next);
    const res = make();
    mw(tenantReq(), res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.raw.statusCode).toBe(429);
    expect(res.raw.end).toHaveBeenCalled();
    expect(res.raw.setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
  });

  it('passes a 429 error to next(err) when there is nothing to respond with', () => {
    const mw = tenantRateLimiter({ defaultRule: { max: 1, windowMs: 60_000 } });
    const next = vi.fn();
    mw(tenantReq(), {}, next);
    mw(tenantReq(), {}, next);
    expect(next).toHaveBeenCalledTimes(2);
    expect(next.mock.calls[0]).toEqual([]);
    const err = next.mock.calls[1][0];
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(429);
  });
});

describe('rate limiter algorithms', () => {
  function hits(mw: any, n: number): number {
    let allowed = 0;
    for (let i = 0; i < n; i++) {
      const next = vi.fn();
      mw(req(), envelopeRes(), next);
      if (next.mock.calls.length === 1 && next.mock.calls[0].length === 0) allowed++;
    }
    return allowed;
  }

  it("'fixed' (default) allows a full burst again right after the window resets", () => {
    vi.useFakeTimers();
    const mw = tenantRateLimiter({ defaultRule: { max: 10, windowMs: 1000 } });
    expect(hits(mw, 15)).toBe(10);
    vi.advanceTimersByTime(1000);
    expect(hits(mw, 15)).toBe(10);
  });

  it("'sliding' weights the previous window", () => {
    vi.useFakeTimers();
    const mw = tenantRateLimiter({ defaultRule: { max: 10, windowMs: 1000 }, algorithm: 'sliding' });
    expect(hits(mw, 15)).toBe(10);
    // 25% into the next window, 75% of the previous 10 still counts → ~2 free
    vi.advanceTimersByTime(1250);
    expect(hits(mw, 10)).toBe(2);
    // Two full windows later everything has slid out
    vi.advanceTimersByTime(2000);
    expect(hits(mw, 15)).toBe(10);
  });

  it("'sliding' does not count rejected requests", () => {
    vi.useFakeTimers();
    const mw = tenantRateLimiter({ defaultRule: { max: 2, windowMs: 1000 }, algorithm: 'sliding' });
    expect(hits(mw, 100)).toBe(2);
    vi.advanceTimersByTime(1000); // previous=2, overlap=1 → still full
    expect(hits(mw, 1)).toBe(0);
    vi.advanceTimersByTime(500); // overlap 0.5 → estimate 1 → one more allowed
    expect(hits(mw, 5)).toBe(1);
  });

  it("'sliding' sets rate-limit headers", () => {
    const mw = tenantRateLimiter({ defaultRule: { max: 3, windowMs: 60_000 }, algorithm: 'sliding' });
    const res = envelopeRes();
    mw(req(), res, vi.fn());
    expect(res._headers['X-RateLimit-Limit']).toBe(3);
    expect(res._headers['X-RateLimit-Remaining']).toBe(2);
    expect(typeof res._headers['X-RateLimit-Reset']).toBe('number');
  });
});

describe('subdomain tenant strategy', () => {
  async function resolve(host: string, required = false) {
    const mw = multiTenancy({ strategy: 'subdomain', required });
    const r = req({ headers: { host } });
    const next = vi.fn();
    await mw(r, envelopeRes(), next);
    return { r, next };
  }

  it('still resolves normal subdomains, with or without a port', async () => {
    expect(getTenantId((await resolve('acme.api.example.com')).r)).toBe('acme');
    expect(getTenantId((await resolve('acme.api.example.com:8080')).r)).toBe('acme');
  });

  it('ignores IPv4 hosts', async () => {
    for (const host of ['10.0.0.5', '192.168.1.20:3000']) {
      const { next } = await resolve(host, true);
      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    }
    const { r, next } = await resolve('127.0.0.1');
    expect(next).toHaveBeenCalledWith();
    expect(r.locals.tenant).toBeUndefined();
  });

  it('ignores IPv6 hosts', async () => {
    for (const host of ['[::1]:3000', '[2001:db8::1]', '2001:db8::1']) {
      const { next } = await resolve(host, true);
      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    }
  });
});

describe('QuotaManager monthly period (calendar months)', () => {
  function setup() {
    const qm = new QuotaManager();
    qm.configure({ tenantId: 't', limits: [{ metric: 'api_calls', max: 2, period: 'monthly' }] });
    return qm;
  }

  it('resets at the start of the next calendar month (UTC)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 0, 31, 23, 0)));
    const qm = setup();
    expect(qm.increment('t', 'api_calls')).toBe(true);
    expect(qm.increment('t', 'api_calls')).toBe(true);
    expect(qm.increment('t', 'api_calls')).toBe(false);
    expect(qm.getUsage('t')[0].resetAt).toBe('2026-02-01T00:00:00.000Z');

    // One hour later it's February: fresh quota (30-day logic would wait ~30 days)
    vi.setSystemTime(new Date(Date.UTC(2026, 1, 1, 0, 0)));
    expect(qm.check('t', 'api_calls')).toBe(true);
    expect(qm.increment('t', 'api_calls')).toBe(true);
  });

  it('does not reset within the same calendar month even after 30 days', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 2, 1, 0, 0)));
    const qm = setup();
    qm.increment('t', 'api_calls');
    qm.increment('t', 'api_calls');
    vi.setSystemTime(new Date(Date.UTC(2026, 2, 31, 12, 0))); // 30.5 days later, still March
    expect(qm.check('t', 'api_calls')).toBe(false);
    vi.setSystemTime(new Date(Date.UTC(2026, 3, 1, 0, 0)));
    expect(qm.check('t', 'api_calls')).toBe(true);
  });

  it('rolls over December into January', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.UTC(2026, 11, 15)));
    const qm = setup();
    qm.increment('t', 'api_calls');
    expect(qm.getUsage('t')[0].resetAt).toBe('2027-01-01T00:00:00.000Z');
  });
});
