import { describe, it, expect, vi } from 'vitest';
import { correlationId } from '../src/correlation';
import type { axilRequest, axilResponse } from '@axiljs/common';

function createMockReq(overrides: Partial<axilRequest> = {}): axilRequest {
  return {
    raw: {} as any,
    method: 'GET',
    url: '/',
    path: '/',
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
  const headers: Record<string, string> = {};
  return {
    raw: {
      setHeader: (k: string, v: string) => {
        headers[k.toLowerCase()] = v;
      },
    } as any,
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    html: vi.fn().mockReturnThis(),
    ...overrides,
    _headers: headers, // internal helper for assertions
  } as unknown as axilResponse & { _headers: Record<string, string> };
}

describe('Correlation ID Middleware', () => {
  it('generates request and correlation IDs when missing', () => {
    const mw = correlationId();
    const req = createMockReq();
    const res = createMockRes();
    const next = vi.fn();

    mw(req, res, next);

    expect(next).toHaveBeenCalledWith();
    
    const locals = req.locals as any;
    expect(locals.requestId).toMatch(/^req_/);
    expect(locals.correlationId).toMatch(/^corr_/);
    
    const assertedRes = res as any;
    expect(assertedRes._headers['x-request-id']).toBeDefined();
    expect(assertedRes._headers['x-correlation-id']).toBeDefined();
  });

  it('preserves incoming correlation ID', () => {
    const mw = correlationId();
    const req = createMockReq({
      headers: { 'x-correlation-id': 'incoming-corr-123' },
    });
    const res = createMockRes();
    const next = vi.fn();

    mw(req, res, next);

    const locals = req.locals as any;
    expect(locals.correlationId).toBe('incoming-corr-123');
  });
});