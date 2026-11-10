import { describe, it, expect, vi, afterEach } from 'vitest';
import { memoryMiddleware } from '../src/middleware';

function fakeReqRes(headersSent = false) {
  const headers: Record<string, string> = {};
  const raw: any = {
    headersSent,
    setHeader: (k: string, v: string) => { headers[k] = v; },
    end: vi.fn(() => 'ended')
  };
  const req: any = { method: 'GET', path: '/x' };
  const res: any = { raw };
  return { req, res, raw, headers };
}

afterEach(() => { vi.restoreAllMocks(); });

describe('memoryMiddleware', () => {
  it('calls next and does not add headers by default', () => {
    const { req, res, raw, headers } = fakeReqRes();
    const next = vi.fn();
    const originalEnd = raw.end;

    memoryMiddleware()(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);

    expect(raw.end('body')).toBe('ended');
    expect(originalEnd).toHaveBeenCalledWith('body');
    expect(headers).toEqual({});
  });

  it('adds X-Memory-Usage (and X-Memory-Delta when the heap grew) when exposeHeader is on', () => {
    const { req, res, raw, headers } = fakeReqRes();
    memoryMiddleware({ exposeHeader: true })(req, res, () => {});

    // Allocate between "before" and "after" so the delta is usually positive
    const junk = Array.from({ length: 200000 }, (_, i) => ({ i }));
    raw.end();
    expect(junk.length).toBe(200000);

    expect(headers['X-Memory-Usage']).toMatch(/^\d+(\.\d+)?MB$/);
    if (headers['X-Memory-Delta'] !== undefined) {
      expect(headers['X-Memory-Delta']).toMatch(/^\+\d+(\.\d+)?MB$/);
    }
  });

  it('does not set headers once they were sent', () => {
    const { req, res, raw, headers } = fakeReqRes(true);
    memoryMiddleware({ exposeHeader: true })(req, res, () => {});
    raw.end();
    expect(headers).toEqual({});
  });

  it('warns about requests above the leak threshold', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { req, res, raw } = fakeReqRes();
    // Negative threshold: any request is flagged
    memoryMiddleware({ leakThresholdMb: -1e9 })(req, res, () => {});
    raw.end();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('GET /x');

    warn.mockClear();
    const second = fakeReqRes();
    memoryMiddleware({ leakThresholdMb: -1e9, logFlagged: false })(second.req, second.res, () => {});
    second.raw.end();
    expect(warn).not.toHaveBeenCalled();
  });
});
