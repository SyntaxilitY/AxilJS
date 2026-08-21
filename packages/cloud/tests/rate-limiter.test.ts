import { describe, it, expect, vi } from 'vitest';
import { tenantRateLimiter } from '../src/rate-limiter';
import type { axilRequest, axilResponse } from '@axiljs/common';

function createMockReq(overrides: Partial<axilRequest> = {}): axilRequest {
  return {
    raw: {} as any,
    method: 'GET',
    url: '/api/data',
    path: '/api/data',
    params: {},
    query: {},
    headers: {},
    body: {},
    locals: {},
    ip: '127.0.0.1',
    ...overrides,
  } as unknown as axilRequest;
}

function createMockRes(overrides: Partial<axilResponse> = {}): axilResponse {
  const headers: Record<string, any> = {};
  return {
    raw: {
      setHeader: (k: string, v: any) => {
        headers[k.toLowerCase()] = v;
      },
    } as any,
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    html: vi.fn().mockReturnThis(),
    ...overrides,
    _headers: headers, // internal helper for assertions
  } as unknown as axilResponse & { _headers: Record<string, any> };
}

describe('Tenant Rate Limiter', () => {
  it('allows requests within the limit', () => {
    const mw = tenantRateLimiter({
      defaultRule: { max: 5, windowMs: 60_000 },
    });

    const req = createMockReq({
      locals: { tenant: { id: 'acme-corp', name: 'Acme Corp', status: 'active' } },
    });
    const res = createMockRes();
    const next = vi.fn();

    mw(req, res, next);
    
    expect(next).toHaveBeenCalledWith();
    const assertedRes = res as any;
    expect(assertedRes._headers['x-ratelimit-remaining']).toBe(4);
  });

  it('blocks requests exceeding the limit', () => {
    const mw = tenantRateLimiter({
      defaultRule: { max: 2, windowMs: 60_000 },
    });

    const tenantLocals = { tenant: { id: 'test-tenant', name: 'Test Tenant', status: 'active' } };

    for (let i = 0; i < 2; i++) {
      const next = vi.fn();
      mw(
        createMockReq({ locals: tenantLocals }),
        createMockRes(),
        next
      );
      expect(next).toHaveBeenCalledWith();
    }

    // Third request should be blocked
    const res = createMockRes();
    const next = vi.fn();
    mw(
      createMockReq({ locals: tenantLocals }),
      res,
      next
    );
    
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(429);
  });

  it('applies tenant-specific rules', () => {
    const mw = tenantRateLimiter({
      defaultRule: { max: 1, windowMs: 60_000 },
      tenantRules: { 'vip-corp': { max: 1000, windowMs: 60_000 } },
    });

    const req = createMockReq({
      locals: { tenant: { id: 'vip-corp', name: 'VIP Corp', status: 'active' } },
    });
    const res = createMockRes();
    const next = vi.fn();

    mw(req, res, next);

    expect(next).toHaveBeenCalledWith();
    const assertedRes = res as any;
    expect(assertedRes._headers['x-ratelimit-limit']).toBe(1000);
  });
});