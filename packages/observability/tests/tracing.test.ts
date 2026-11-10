import { describe, it, expect, vi } from 'vitest';
import { Tracer, Span, SpanData } from '../src/tracing';

const TRACE = '4bf92f3577b34da6a3ce929d0e0e4736';
const PARENT = '00f067aa0ba902b7';

describe('Span', () => {
  it('has W3C-sized ids, attributes, events and status', () => {
    const s = new Span('op', 'svc');
    expect(s.traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(s.spanId).toMatch(/^[0-9a-f]{16}$/);
    s.setAttribute('a', 1).setAttributes({ b: 'x' }).addEvent('evt', { k: 1 }).setStatus('error', 'bad');
    const data = s.end();
    expect(data.attributes).toEqual({ a: 1, b: 'x' });
    expect(data.events[0].name).toBe('evt');
    expect(data.status).toBe('error');
    expect(data.statusMessage).toBe('bad');
    expect(data.endTime).toBeDefined();
    expect(s.isEnded()).toBe(true);
    const end1 = data.endTime;
    expect(s.end().endTime).toBe(end1);
  });

  it('children share the trace and point at the parent', () => {
    const s = new Span('root', 'svc');
    const c = s.startChild('child');
    expect(c.traceId).toBe(s.traceId);
    expect(c.end().parentSpanId).toBe(s.spanId);
  });
});

describe('Tracer.extractContext', () => {
  const t = new Tracer({ serviceName: 'svc' });

  it('parses a valid traceparent', () => {
    expect(t.extractContext({ traceparent: `00-${TRACE}-${PARENT}-01` })).toEqual({ traceId: TRACE, spanId: PARENT });
  });

  it('accepts future versions with extra fields but not version 00 with extras', () => {
    expect(t.extractContext({ traceparent: `01-${TRACE}-${PARENT}-01-extra` }).traceId).toBe(TRACE);
    expect(t.extractContext({ traceparent: `00-${TRACE}-${PARENT}-01-extra` }).traceId).toBeUndefined();
  });

  it('rejects invalid traceparents', () => {
    for (const tp of [
      `ff-${TRACE}-${PARENT}-01`,
      `00-${'0'.repeat(32)}-${PARENT}-01`,
      `00-${TRACE}-${'0'.repeat(16)}-01`,
      `00-${TRACE.toUpperCase()}-${PARENT}-01`,
      `00-${TRACE}-${PARENT}`,
      'garbage'
    ]) {
      expect(t.extractContext({ traceparent: tp }).traceId).toBeUndefined();
    }
  });

  it('falls back to B3 headers', () => {
    expect(t.extractContext({ 'x-b3-traceid': 'abc', 'x-b3-spanid': 'def' })).toEqual({ traceId: 'abc', spanId: 'def' });
  });
});

describe('Tracer.startSpan with parent', () => {
  const t = new Tracer({ serviceName: 'svc' });

  it('continues an extracted context', () => {
    const span = t.startSpan('http', { parent: t.extractContext({ traceparent: `00-${TRACE}-${PARENT}-01` }) });
    expect(span.traceId).toBe(TRACE);
    expect(span.spanId).not.toBe(PARENT);
    expect(span.end().parentSpanId).toBe(PARENT);
    expect(t.injectContext(span).traceparent).toBe(`00-${TRACE}-${span.spanId}-01`);
  });

  it('continues a local parent span', () => {
    const root = t.startSpan('root');
    const child = t.startSpan('child', { parent: root });
    expect(child.traceId).toBe(root.traceId);
    expect(child.end().parentSpanId).toBe(root.spanId);
  });

  it('pads 64-bit B3 trace ids to 128 bits', () => {
    const span = t.startSpan('x', { parent: { traceId: 'A3CE929D0E0E4736', spanId: PARENT } });
    expect(span.traceId).toBe('0000000000000000a3ce929d0e0e4736');
  });

  it('starts a new root on invalid or missing context', () => {
    for (const parent of [{}, { traceId: 'xyz' }, { traceId: '0'.repeat(32) }, undefined]) {
      const span = t.startSpan('x', { parent });
      expect(span.traceId).not.toBe(TRACE);
      expect(span.end().parentSpanId).toBeUndefined();
    }
    // Valid trace id with invalid span id: keep the trace, no parent span id
    const s = t.startSpan('x', { parent: { traceId: TRACE, spanId: 'nope' } });
    expect(s.traceId).toBe(TRACE);
    expect(s.end().parentSpanId).toBeUndefined();
  });

  it('startSpan(name) without options is unchanged', () => {
    const span = t.startSpan('x');
    expect(span.end().parentSpanId).toBeUndefined();
  });
});

describe('Tracer.trace / exporters', () => {
  it('records ok/error status and exports to the default in-memory store', async () => {
    const t = new Tracer({ serviceName: 'svc' });
    await t.trace('ok', async () => 1);
    await expect(t.trace('bad', async () => { throw new Error('boom'); })).rejects.toThrow('boom');
    const spans = t.getSpans();
    expect(spans.map(s => [s.name, s.status])).toEqual([['ok', 'ok'], ['bad', 'error']]);
    expect(spans[1].statusMessage).toBe('boom');
  });

  it('uses a custom exporter and child spans via parentSpan', async () => {
    const exported: SpanData[] = [];
    const t = new Tracer({ serviceName: 'svc', exporter: s => exported.push(s) });
    const root = t.startSpan('root');
    await t.trace('child', async () => {}, root);
    expect(exported[0].parentSpanId).toBe(root.spanId);
    t.exportSpan(root.end());
    expect(exported).toHaveLength(2);
    expect(t.getSpans()).toEqual([]);
  });

  it('injectContext emits traceparent and B3 headers', () => {
    const t = new Tracer({ serviceName: 'svc' });
    const s = t.startSpan('x');
    const h = t.injectContext(s);
    expect(h).toEqual({
      traceparent: `00-${s.traceId}-${s.spanId}-01`,
      'x-b3-traceid': s.traceId,
      'x-b3-spanid': s.spanId
    });
    vi.restoreAllMocks();
  });
});
