import { describe, it, expect, afterEach } from 'vitest';
import { createApp, start, stopAll } from './helpers';

// @axiljs/runtime's sensitive data lineage listens on this hook
const KEY = Symbol.for('axiljs.sensitive.sink');

afterEach(async () => {
  delete (globalThis as any)[KEY];
  await stopAll();
});

describe('sensitive data sink hook', () => {
  it('passes response bodies to the hook as the response sink', async () => {
    const calls: unknown[][] = [];
    (globalThis as any)[KEY] = (...args: unknown[]) => { calls.push(args); };
    const app = createApp();
    app.get('/json', (_req, res) => res.json({ a: 1 }));
    app.get('/env', (_req, res) => res.success({ b: 2 }, 'ok'));
    app.get('/text', (_req, res) => res.text('plain'));
    const base = await start(app);
    await fetch(`${base}/json`);
    await fetch(`${base}/env`);
    await fetch(`${base}/text`);
    expect(calls).toEqual([
      ['response', { a: 1 }],
      ['response', { message: 'ok', data: { b: 2 } }],
      ['response', 'plain']
    ]);
  });

  it('turns a throwing hook into the app error response', async () => {
    (globalThis as any)[KEY] = (_sink: string, body: any) => {
      if (body?.data?.secret) throw new Error('leak detected');
    };
    const app = createApp();
    app.get('/leak', (_req, res) => res.success({ secret: 'ann@example.com' }));
    const base = await start(app);
    const res = await fetch(`${base}/leak`);
    const text = await res.text();
    expect(res.status).toBe(500);
    expect(text).toContain('leak detected');
    expect(text).not.toContain('ann@example.com');
  });

  it('is a no-op without the hook', async () => {
    const app = createApp();
    app.get('/json', (_req, res) => res.json({ a: 1 }));
    const base = await start(app);
    expect(await (await fetch(`${base}/json`)).json()).toEqual({ a: 1 });
  });
});
