import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { OpenAIProvider } from '../src/providers/openai';
import { AnthropicProvider } from '../src/providers/anthropic';
import { OllamaProvider } from '../src/providers/ollama';
import { AIHttpError, parseRetryAfter, requestJson } from '../src/providers/http';
import { startMockServer, MockServer, sendJson, sse, collect } from './helpers/mock-server';

const okBody = {
  model: 'gpt-4o-mini',
  choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
};

describe('retry / abort / timeout transport', () => {
  let server: MockServer;

  beforeAll(async () => {
    server = await startMockServer((_req, res) => sendJson(res, 200, okBody));
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    server.requests.length = 0;
  });

  const openai = (extra: Record<string, unknown> = {}) =>
    new OpenAIProvider({ apiKey: 'k', baseUrl: server.url, retryBaseDelayMs: 5, ...extra });

  it('retries 429 honoring retry-after, then succeeds', async () => {
    const times: number[] = [];
    server.setHandler((_req, res, i) => {
      times.push(Date.now());
      if (i < 2) sendJson(res, 429, { error: { message: 'slow down' } }, { 'retry-after': '0.15' });
      else sendJson(res, 200, okBody);
    });

    const out = await openai().complete({ messages: [{ role: 'user', content: 'x' }] });
    expect(out.content).toBe('ok');
    expect(server.requests).toHaveLength(3);
    // retry-after (150ms) wins over the 5ms base backoff
    expect(times[1] - times[0]).toBeGreaterThanOrEqual(130);
    expect(times[2] - times[1]).toBeGreaterThanOrEqual(130);
  });

  it('honors retry-after-ms too and retries 5xx', async () => {
    server.setHandler((_req, res, i) => {
      if (i === 0) sendJson(res, 503, { error: { message: 'busy' } }, { 'retry-after-ms': '20' });
      else if (i === 1) sendJson(res, 500, { error: { message: 'oops' } });
      else sendJson(res, 200, okBody);
    });
    const out = await openai().complete({ messages: [{ role: 'user', content: 'x' }] });
    expect(out.content).toBe('ok');
    expect(server.requests).toHaveLength(3);
  });

  it('gives up after maxRetries and exposes the status', async () => {
    server.setHandler((_req, res) => sendJson(res, 529, { error: { message: 'overloaded' } }));
    const p = new AnthropicProvider({ apiKey: 'k', baseUrl: server.url, maxRetries: 1, retryBaseDelayMs: 1 });
    const err = await p.complete({ messages: [{ role: 'user', content: 'x' }] }).catch(e => e);
    expect(err).toBeInstanceOf(AIHttpError);
    expect(err.status).toBe(529);
    expect(err.message).toBe('Anthropic API error 529: overloaded');
    expect(server.requests).toHaveLength(2);
  });

  it('maxRetries: 0 disables retries', async () => {
    server.setHandler((_req, res) => sendJson(res, 429, { error: { message: 'no' } }));
    await expect(openai({ maxRetries: 0 }).complete({ messages: [{ role: 'user', content: 'x' }] }))
      .rejects.toThrow('OpenAI API error 429');
    expect(server.requests).toHaveLength(1);
  });

  it('retries network errors (connection refused)', async () => {
    // A server that closed: every attempt is refused
    const dead = await startMockServer(() => {});
    const url = dead.url;
    await dead.close();
    const p = new OllamaProvider({ baseUrl: url, maxRetries: 2, retryBaseDelayMs: 1 });
    const started = Date.now();
    await expect(p.complete({ messages: [{ role: 'user', content: 'x' }] }))
      .rejects.toThrow(/Cannot connect to Ollama/);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('retries a stream before the first byte, but not after', async () => {
    server.setHandler((_req, res, i) => {
      if (i === 0) { sendJson(res, 503, { error: { message: 'warming up' } }); return; }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end(sse([{ choices: [{ delta: { content: 'hi' } }] }], { done: true }));
    });
    const chunks = await collect(openai().stream({ messages: [{ role: 'user', content: 'x' }] }));
    expect(chunks.map(c => c.delta).join('')).toBe('hi');
    expect(server.requests).toHaveLength(2);

    // Connection drops after a line was yielded -> error, no retry
    server.requests.length = 0;
    server.setHandler((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(sse([{ choices: [{ delta: { content: 'partial' } }] }]));
      setTimeout(() => res.socket?.destroy(), 20);
    });
    const seen: string[] = [];
    await expect((async () => {
      for await (const c of openai().stream({ messages: [{ role: 'user', content: 'x' }] })) seen.push(c.delta);
    })()).rejects.toThrow();
    expect(seen).toEqual(['partial']);
    expect(server.requests).toHaveLength(1);
  });

  it('aborts an in-flight request and tears it down', async () => {
    server.setHandler(() => { /* never respond */ });
    const closedBefore = server.closedEarly();
    const controller = new AbortController();
    const p = openai().complete({ messages: [{ role: 'user', content: 'x' }], signal: controller.signal });
    setTimeout(() => controller.abort(), 30);
    const err = await p.catch(e => e);
    expect(err.name).toBe('AbortError');
    await new Promise(r => setTimeout(r, 30));
    expect(server.closedEarly()).toBeGreaterThanOrEqual(closedBefore + 1);
  });

  it('rejects immediately with an already-aborted signal', async () => {
    const err = await openai().complete({
      messages: [{ role: 'user', content: 'x' }],
      signal: AbortSignal.abort()
    }).catch(e => e);
    expect(err.name).toBe('AbortError');
    expect(server.requests).toHaveLength(0);
  });

  it('aborts during a retry backoff', async () => {
    server.setHandler((_req, res) => sendJson(res, 429, {}, { 'retry-after': '10' }));
    const controller = new AbortController();
    const started = Date.now();
    setTimeout(() => controller.abort(), 50);
    const err = await openai().complete({ messages: [{ role: 'user', content: 'x' }], signal: controller.signal })
      .catch(e => e);
    expect(err.name).toBe('AbortError');
    expect(Date.now() - started).toBeLessThan(2000);
    expect(server.requests).toHaveLength(1);
  });

  it('aborts a stream mid-way', async () => {
    server.setHandler((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(sse([{ choices: [{ delta: { content: 'a' } }] }]));
    });
    const controller = new AbortController();
    const seen: string[] = [];
    const err = await (async () => {
      for await (const c of openai().stream({ messages: [{ role: 'user', content: 'x' }], signal: controller.signal })) {
        seen.push(c.delta);
        controller.abort();
      }
    })().catch(e => e);
    expect(seen).toEqual(['a']);
    expect(err.name).toBe('AbortError');
  });

  it('timeoutMs sets an overall deadline (TimeoutError)', async () => {
    server.setHandler(() => { /* hang */ });
    const err = await openai().complete({ messages: [{ role: 'user', content: 'x' }], timeoutMs: 60 }).catch(e => e);
    expect(err.name).toBe('TimeoutError');
    expect(err.message).toMatch(/timed out after 60ms/);

    const err2 = await openai().embed({ input: 'x', timeoutMs: 40 }).catch(e => e);
    expect(err2.name).toBe('TimeoutError');
  });

  it('requestJson works standalone and parses retry-after formats', async () => {
    server.setHandler((req, res) => sendJson(res, 200, { echo: req.body }));
    const out = await requestJson({ label: 'X', url: `${server.url}/echo?q=1`, body: { a: 1 } });
    expect(out).toEqual({ echo: { a: 1 } });
    expect(server.requests[0].url).toBe('/echo?q=1');

    expect(parseRetryAfter({ 'retry-after': '2' })).toBe(2000);
    expect(parseRetryAfter({ 'retry-after-ms': '150' })).toBe(150);
    const date = new Date(Date.now() + 5000).toUTCString();
    const ms = parseRetryAfter({ 'retry-after': date })!;
    expect(ms).toBeGreaterThan(3000);
    expect(ms).toBeLessThanOrEqual(5000);
    expect(parseRetryAfter({})).toBeUndefined();
  });
});
