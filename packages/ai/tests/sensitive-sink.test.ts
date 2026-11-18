import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { OpenAIProvider } from '../src/providers/openai';
import { startMockServer, MockServer, sendJson } from './helpers/mock-server';

// @axiljs/runtime's sensitive data lineage listens on this hook
const KEY = Symbol.for('axiljs.sensitive.sink');

const okBody = {
  model: 'gpt-4o-mini',
  choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
};

describe('sensitive data sink hook', () => {
  let server: MockServer;

  beforeAll(async () => {
    server = await startMockServer((_req, res) => sendJson(res, 200, okBody));
  });

  afterAll(async () => {
    await server.close();
  });

  afterEach(() => {
    delete (globalThis as any)[KEY];
    server.requests.length = 0;
  });

  const provider = () => new OpenAIProvider({ apiKey: 'k', baseUrl: server.url, maxRetries: 0 });
  const messages = [{ role: 'user' as const, content: 'mail ann@example.com' }];

  it('passes the request body (with the messages) to the hook as the ai sink', async () => {
    const calls: unknown[][] = [];
    (globalThis as any)[KEY] = (...args: unknown[]) => { calls.push(args); };
    await provider().complete({ messages });
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('ai');
    expect(JSON.stringify(calls[0][1])).toContain('ann@example.com');
  });

  it('sends nothing when the hook throws (complete and stream)', async () => {
    (globalThis as any)[KEY] = () => { throw new Error('leak'); };
    await expect(provider().complete({ messages })).rejects.toThrow('leak');
    const drain = async () => {
      for await (const chunk of provider().stream({ messages })) void chunk;
    };
    await expect(drain()).rejects.toThrow('leak');
    expect(server.requests).toHaveLength(0);
  });

  it('is a no-op without the hook', async () => {
    await expect(provider().complete({ messages })).resolves.toMatchObject({ content: 'ok' });
    expect(server.requests).toHaveLength(1);
  });
});
