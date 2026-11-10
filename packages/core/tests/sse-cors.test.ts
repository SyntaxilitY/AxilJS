import { describe, it, expect, afterEach } from 'vitest';
import { createSSE } from '../src/middleware/sse';
import { cors } from '../src/middleware/cors';
import { createApp, start, stopAll } from './helpers';

afterEach(stopAll);

describe('cors', () => {
  it('allows any origin by default and answers preflight with 204', async () => {
    const app = createApp();
    app.use(cors());
    app.get('/x', (_req, res) => res.text('x'));
    const base = await start(app);

    const res = await fetch(`${base}/x`, { headers: { Origin: 'https://a.com' } });
    expect(res.headers.get('access-control-allow-origin')).toBe('*');

    const pre = await fetch(`${base}/x`, { method: 'OPTIONS', headers: { Origin: 'https://a.com' } });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-methods')).toContain('GET');
    expect(pre.headers.get('access-control-max-age')).toBe('86400');
  });

  it('reflects only listed origins and sets Vary: Origin', async () => {
    const app = createApp();
    app.use(cors({ origin: ['https://ok.com'], credentials: true }));
    app.get('/x', (_req, res) => res.text('x'));
    const base = await start(app);

    const ok = await fetch(`${base}/x`, { headers: { Origin: 'https://ok.com' } });
    expect(ok.headers.get('access-control-allow-origin')).toBe('https://ok.com');
    expect(ok.headers.get('access-control-allow-credentials')).toBe('true');
    expect(ok.headers.get('vary')).toBe('Origin');

    const bad = await fetch(`${base}/x`, { headers: { Origin: 'https://evil.com' } });
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();
  });
});

async function readSSE(url: string, init?: RequestInit): Promise<{ res: Response; text: string }> {
  const res = await fetch(url, init);
  const text = await res.text();
  return { res, text };
}

describe('createSSE', () => {
  it('sets SSE headers, defaults ACAO to * and frames events', async () => {
    const app = createApp();
    app.get('/events', (_req, res) => {
      const sse = createSSE(res);
      sse.send({ n: 1 }, 'update', '7');
      sse.send('line1\nline2');
      sse.comment('ping');
      sse.close();
      expect(sse.isOpen).toBe(false);
    });
    const base = await start(app);
    const { res, text } = await readSSE(`${base}/events`);
    expect(res.headers.get('content-type')).toBe('text/event-stream');
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
    expect(text).toBe(
      ': connected\n\n' +
        'id: 7\nevent: update\ndata: {"n":1}\n\n' +
        'data: line1\ndata: line2\n\n' +
        ': ping\n\n'
    );
  });

  it('strips line breaks from id and event to prevent field injection', async () => {
    const app = createApp();
    app.get('/events', (_req, res) => {
      const sse = createSSE(res);
      sse.send('x', 'a\nevent: evil', '1\r\n2');
      sse.close();
    });
    const base = await start(app);
    const { text } = await readSSE(`${base}/events`);
    expect(text).toContain('id: 12\nevent: aevent: evil\ndata: x\n\n');
  });

  it('keeps the origin chosen by cors() instead of forcing *', async () => {
    const app = createApp();
    app.use(cors({ origin: ['https://app.example'] }));
    app.get('/events', (_req, res) => {
      const sse = createSSE(res);
      sse.close();
    });
    const base = await start(app);
    const { res } = await readSSE(`${base}/events`, { headers: { Origin: 'https://app.example' } });
    expect(res.headers.get('access-control-allow-origin')).toBe('https://app.example');
  });
});
