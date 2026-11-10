import { describe, it, expect, vi } from 'vitest';
import { observabilityMiddleware, metricsHandler } from '../src/middleware';
import { MetricsRegistry } from '../src/metrics';
import { Tracer, SpanData } from '../src/tracing';

const TRACE = '4bf92f3577b34da6a3ce929d0e0e4736';
const PARENT = '00f067aa0ba902b7';

function fakeReq(overrides: Record<string, unknown> = {}): any {
  return {
    method: 'GET',
    url: '/users/42?x=1',
    path: '/users/42',
    headers: {},
    params: {},
    query: {},
    locals: {},
    ...overrides
  };
}

function fakeRes(): any {
  const headers: Record<string, string> = {};
  const raw: any = { statusCode: 200, endCalls: 0 };
  raw.end = vi.fn(() => { raw.endCalls++; });
  const res: any = {
    raw,
    headers,
    header: vi.fn((k: string, v: string) => { headers[k] = v; return res; }),
    text: vi.fn((body: string) => { res.body = body; raw.end(body); })
  };
  return res;
}

function run(mw: any, req: any, res: any) {
  const next = vi.fn();
  mw(req, res, next);
  expect(next).toHaveBeenCalledTimes(1);
}

describe('observabilityMiddleware', () => {
  it('records counter, histogram and active gauge per request', () => {
    const metrics = new MetricsRegistry();
    const mw = observabilityMiddleware({ metrics });
    const req = fakeReq();
    const res = fakeRes();
    run(mw, req, res);
    expect(metrics.toPrometheus()).toContain('http_active_requests 1');
    res.raw.statusCode = 201;
    res.raw.end();
    res.raw.end(); // second end() must not double count
    const out = metrics.toPrometheus();
    expect(out).toContain('http_requests_total{method="GET",path="/users/42",status="201"} 1');
    expect(out).toContain('http_request_duration_ms_count{method="GET",path="/users/42"} 1');
    expect(out).toContain('http_active_requests 0');
    expect(res.raw.endCalls).toBe(2);
  });

  it('pathLabel lets callers avoid high-cardinality raw paths', () => {
    const metrics = new MetricsRegistry();
    const mw = observabilityMiddleware({
      metrics,
      pathLabel: (req) => req.path.replace(/\/\d+/g, '/:id')
    });
    for (const id of [1, 2, 3]) {
      const res = fakeRes();
      run(mw, fakeReq({ path: `/users/${id}` }), res);
      res.raw.end();
    }
    expect(metrics.toPrometheus()).toContain('http_requests_total{method="GET",path="/users/:id",status="200"} 3');
  });

  it('falls back to the raw path when pathLabel throws', () => {
    const metrics = new MetricsRegistry();
    const mw = observabilityMiddleware({ metrics, pathLabel: () => { throw new Error('x'); } });
    const res = fakeRes();
    run(mw, fakeReq(), res);
    res.raw.end();
    expect(metrics.toPrometheus()).toContain('path="/users/42"');
  });

  it('can be created twice on one registry (metrics are shared, not duplicated)', () => {
    const metrics = new MetricsRegistry();
    observabilityMiddleware({ metrics });
    observabilityMiddleware({ metrics });
    expect(metrics.toPrometheus().match(/# TYPE http_requests_total/g)).toHaveLength(1);
  });

  it('continues an incoming traceparent and returns the new span in traceparent', () => {
    const exported: SpanData[] = [];
    const tracer = new Tracer({ serviceName: 'api', exporter: s => exported.push(s) });
    const mw = observabilityMiddleware({ tracer });
    const res = fakeRes();
    run(mw, fakeReq({ headers: { traceparent: `00-${TRACE}-${PARENT}-01` } }), res);
    const tp = res.headers['traceparent'];
    expect(tp).toMatch(new RegExp(`^00-${TRACE}-[0-9a-f]{16}-01$`));
    expect(tp).not.toContain(PARENT);
    res.raw.statusCode = 503;
    res.raw.end();
    expect(exported).toHaveLength(1);
    expect(exported[0].traceId).toBe(TRACE);
    expect(exported[0].parentSpanId).toBe(PARENT);
    expect(exported[0].status).toBe('error');
    expect(exported[0].attributes['http.status_code']).toBe(503);
    expect(tp.split('-')[2]).toBe(exported[0].spanId);
  });

  it('continues B3 headers too', () => {
    const tracer = new Tracer({ serviceName: 'api' });
    const mw = observabilityMiddleware({ tracer });
    const res = fakeRes();
    run(mw, fakeReq({ headers: { 'x-b3-traceid': TRACE, 'x-b3-spanid': PARENT } }), res);
    expect(res.headers['x-b3-traceid']).toBe(TRACE);
  });

  it('starts a new trace without (or with invalid) incoming context, or when propagate is false', () => {
    const tracer = new Tracer({ serviceName: 'api' });
    for (const [headers, propagate] of [
      [{}, true],
      [{ traceparent: 'nonsense' }, true],
      [{ traceparent: `00-${TRACE}-${PARENT}-01` }, false]
    ] as const) {
      const res = fakeRes();
      run(observabilityMiddleware({ tracer, propagate }), fakeReq({ headers }), res);
      expect(res.headers['traceparent']).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
      expect(res.headers['traceparent']).not.toContain(TRACE);
      res.raw.end();
    }
    expect(tracer.getSpans().every(s => s.parentSpanId === undefined)).toBe(true);
  });

  it('a throwing exporter never breaks the response', () => {
    const tracer = new Tracer({ serviceName: 'api', exporter: () => { throw new Error('exporter down'); } });
    const res = fakeRes();
    run(observabilityMiddleware({ tracer }), fakeReq(), res);
    expect(() => res.raw.end()).not.toThrow();
    expect(res.raw.endCalls).toBe(1);
  });

  it('works with no options', () => {
    const res = fakeRes();
    run(observabilityMiddleware(), fakeReq(), res);
    res.raw.end();
    expect(res.header).not.toHaveBeenCalled();
  });
});

describe('metricsHandler', () => {
  it('serves Prometheus text with the right content type', async () => {
    const metrics = new MetricsRegistry();
    metrics.counter('c_total', 'C').inc();
    const res = fakeRes();
    await metricsHandler(metrics)(fakeReq(), res, () => {});
    expect(res.headers['Content-Type']).toBe('text/plain; version=0.0.4; charset=utf-8');
    expect(res.body).toBe('# HELP c_total C\n# TYPE c_total counter\nc_total 1\n');
  });
});
