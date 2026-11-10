import { describe, it, expect } from 'vitest';
import { MetricsRegistry, Counter, Gauge, Histogram } from '../src/metrics';

describe('Counter / Gauge', () => {
  it('counts per label set', () => {
    const c = new Counter('reqs_total', 'Requests');
    c.inc();
    c.inc({ method: 'GET' }, 2);
    c.inc({ method: 'GET' });
    expect(c.get()).toBe(1);
    expect(c.get({ method: 'GET' })).toBe(3);
    expect(c.get({ method: 'POST' })).toBe(0);
  });

  it('label order does not matter', () => {
    const c = new Counter('x', 'x');
    c.inc({ a: '1', b: '2' });
    c.inc({ b: '2', a: '1' });
    expect(c.get({ a: '1', b: '2' })).toBe(2);
  });

  it('gauge set/inc/dec', () => {
    const g = new Gauge('active', 'Active');
    g.set(5);
    g.inc();
    g.dec({}, 3);
    expect(g.get()).toBe(3);
  });

  it('renders Prometheus text with HELP/TYPE lines and escaped labels', () => {
    const c = new Counter('reqs_total', 'Requests');
    c.inc({ path: 'a"b\\c\nd' });
    expect(c.toPrometheus()).toBe(
      '# HELP reqs_total Requests\n' +
      '# TYPE reqs_total counter\n' +
      'reqs_total{path="a\\"b\\\\c\\nd"} 1'
    );
    const g = new Gauge('g', 'G');
    g.set(2);
    expect(g.toPrometheus()).toBe('# HELP g G\n# TYPE g gauge\ng 2');
  });

  it('escapes backslashes and newlines in HELP text', () => {
    const c = new Counter('c', 'line1\nline2 with \\ slash');
    expect(c.toPrometheus().split('\n')[0]).toBe('# HELP c line1\\nline2 with \\\\ slash');
    expect(c.toPrometheus().split('\n')).toHaveLength(2);
  });
});

describe('Histogram', () => {
  it('produces cumulative buckets, +Inf, sum and count', () => {
    const h = new Histogram('lat', 'Latency', [10, 50, 100]);
    for (const v of [5, 10, 20, 70, 500]) h.observe(v);
    expect(h.toPrometheus()).toBe([
      '# HELP lat Latency',
      '# TYPE lat histogram',
      'lat_bucket{le="10"} 2',
      'lat_bucket{le="50"} 3',
      'lat_bucket{le="100"} 4',
      'lat_bucket{le="+Inf"} 5',
      'lat_sum 605',
      'lat_count 5'
    ].join('\n'));
  });

  it('keeps label sets separate and appends labels after le', () => {
    const h = new Histogram('lat', 'Latency', [100]);
    h.observe(1, { method: 'GET' });
    h.observe(200, { method: 'POST' });
    const out = h.toPrometheus();
    expect(out).toContain('lat_bucket{le="100",method="GET"} 1');
    expect(out).toContain('lat_bucket{le="100",method="POST"} 0');
    expect(out).toContain('lat_bucket{le="+Inf",method="POST"} 1');
    expect(out).toContain('lat_sum{method="POST"} 200');
    expect(out).toContain('lat_count{method="GET"} 1');
  });

  it('uses default buckets', () => {
    const h = new Histogram('d', 'd');
    h.observe(3);
    expect(h.toPrometheus()).toContain('d_bucket{le="5000"} 1');
    expect(h.toPrometheus()).toContain('d_bucket{le="1"} 0');
  });
});

describe('MetricsRegistry', () => {
  it('joins metrics with blank lines and a trailing newline', () => {
    const r = new MetricsRegistry();
    r.counter('a_total', 'A').inc();
    r.gauge('b', 'B').set(1);
    expect(r.toPrometheus()).toBe(
      '# HELP a_total A\n# TYPE a_total counter\na_total 1\n\n' +
      '# HELP b B\n# TYPE b gauge\nb 1\n'
    );
  });

  it('returns the existing metric when re-registering the same name and type', () => {
    const r = new MetricsRegistry();
    const a = r.counter('x_total', 'X');
    const b = r.counter('x_total', 'other help');
    expect(b).toBe(a);
    const h1 = r.histogram('h', 'H', [1]);
    expect(r.histogram('h', 'H')).toBe(h1);
    const g1 = r.gauge('g', 'G');
    expect(r.gauge('g', 'G')).toBe(g1);
    expect(r.toPrometheus().match(/# TYPE x_total/g)).toHaveLength(1);
    expect(r.get('x_total')).toBe(a);
    expect(r.get('nope')).toBeUndefined();
  });

  it('throws when re-registering a name with a different type', () => {
    const r = new MetricsRegistry();
    r.counter('dup', 'D');
    expect(() => r.gauge('dup', 'D')).toThrow(/already registered as a counter/);
    expect(() => r.histogram('dup', 'D')).toThrow(/cannot re-register it as a histogram/);
  });
});
