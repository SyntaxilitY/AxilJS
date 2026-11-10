import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { OllamaProvider } from '../src/providers/ollama';
import { ToolDefinition } from '../src/types';
import { startMockServer, MockServer, sendJson, writeAwkward, ndjson, collect } from './helpers/mock-server';

const tool: ToolDefinition = {
  name: 'get_time',
  description: 'Current time',
  parameters: { type: 'object', properties: { tz: { type: 'string' } } }
};

describe('OllamaProvider', () => {
  let server: MockServer;
  let provider: OllamaProvider;

  beforeAll(async () => {
    server = await startMockServer((_req, res) => sendJson(res, 404, { error: 'not found' }));
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    server.requests.length = 0;
    provider = new OllamaProvider({ baseUrl: server.url, model: 'llama-test' });
  });

  it('sends /api/chat with tools and parses tool_calls', async () => {
    server.setHandler((_req, res) => sendJson(res, 200, {
      model: 'llama-test',
      message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'get_time', arguments: { tz: 'UTC' } } }] },
      done: true,
      prompt_eval_count: 5,
      eval_count: 2
    }));

    const out = await provider.complete({
      messages: [{ role: 'user', content: 'time?' }],
      system: 'sys',
      tools: [tool]
    });

    expect(out.finishReason).toBe('tool_use');
    expect(out.toolCalls).toHaveLength(1);
    expect(out.toolCalls![0]).toMatchObject({ name: 'get_time', arguments: { tz: 'UTC' } });
    expect(out.usage).toEqual({ promptTokens: 5, completionTokens: 2, totalTokens: 7 });

    const req = server.requests[0];
    expect(req.url).toBe('/api/chat');
    expect(req.body).toMatchObject({
      model: 'llama-test',
      stream: false,
      messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'time?' }],
      tools: [{ type: 'function', function: { name: 'get_time', description: 'Current time', parameters: tool.parameters } }]
    });
  });

  it('replays tool history with tool_calls and tool_name; toolChoice none drops tools', async () => {
    server.setHandler((_req, res) => sendJson(res, 200, {
      model: 'llama-test', message: { role: 'assistant', content: 'It is noon' }, done: true
    }));

    const out = await provider.complete({
      messages: [
        { role: 'user', content: 'time?' },
        { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 'get_time', arguments: { tz: 'UTC' } }] },
        { role: 'tool', content: '"12:00"', toolCallId: 'c1' }
      ],
      tools: [tool],
      toolChoice: 'none'
    });

    expect(out).toMatchObject({ content: 'It is noon', finishReason: 'stop', toolCalls: undefined });
    expect(server.requests[0].body.tools).toBeUndefined();
    expect(server.requests[0].body.messages).toEqual([
      { role: 'user', content: 'time?' },
      { role: 'assistant', content: '', tool_calls: [{ function: { name: 'get_time', arguments: { tz: 'UTC' } } }] },
      { role: 'tool', content: '"12:00"', tool_name: 'get_time' }
    ]);
  });

  it('streams NDJSON split at awkward boundaries, including tool calls', async () => {
    const body = ndjson([
      { model: 'llama-test', message: { content: 'Zeit: ' }, done: false },
      { model: 'llama-test', message: { content: '½ ' }, done: false },
      { model: 'llama-test', message: { content: '', tool_calls: [{ function: { name: 'get_time', arguments: '{"tz":"CET"}' } }] }, done: false },
      { model: 'llama-test', message: { content: '' }, done: true, prompt_eval_count: 3, eval_count: 4 }
    ]);
    server.setHandler(async (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
      await writeAwkward(res, body.trimEnd(), [6, 1, 13]); // last line not newline-terminated
    });

    const chunks = await collect(provider.stream({ messages: [{ role: 'user', content: 'x' }], tools: [tool] }));
    expect(chunks.filter(c => c.delta).map(c => c.delta).join('')).toBe('Zeit: ½ ');
    expect(chunks.find(c => c.toolCallDelta)!.toolCallDelta).toMatchObject({ name: 'get_time', arguments: { tz: 'CET' } });

    const final = chunks[chunks.length - 1];
    expect(final.done).toBe(true);
    expect(final.response).toMatchObject({
      content: 'Zeit: ½ ',
      finishReason: 'tool_use',
      usage: { promptTokens: 3, completionTokens: 4, totalTokens: 7 }
    });
    expect(final.response!.toolCalls![0]).toMatchObject({ name: 'get_time', arguments: { tz: 'CET' } });
  });

  it('embeds in one batch with /api/embed', async () => {
    server.setHandler((req, res) => {
      if (req.url === '/api/embed') {
        sendJson(res, 200, { model: 'nomic-embed-text', embeddings: req.body.input.map((_: string, i: number) => [i]), prompt_eval_count: 9 });
      } else sendJson(res, 404, { error: 'not found' });
    });

    const out = await provider.embed({ input: ['a', 'b', 'c'] });
    expect(server.requests).toHaveLength(1);
    expect(server.requests[0].body).toEqual({ model: 'nomic-embed-text', input: ['a', 'b', 'c'] });
    expect(out).toEqual({ embeddings: [[0], [1], [2]], model: 'nomic-embed-text', usage: { totalTokens: 9 } });
  });

  it('falls back to legacy /api/embeddings on 404 and remembers it', async () => {
    server.setHandler((req, res) => {
      if (req.url === '/api/embeddings') sendJson(res, 200, { embedding: [req.body.prompt.length] });
      else { res.writeHead(404, { 'Content-Type': 'text/plain' }); res.end('404 page not found'); }
    });

    const out = await provider.embed({ input: ['aa', 'bbb'] });
    expect(out.embeddings).toEqual([[2], [3]]);
    expect(server.requests.map(r => r.url)).toEqual(['/api/embed', '/api/embeddings', '/api/embeddings']);

    server.requests.length = 0;
    await provider.embed({ input: 'z' });
    expect(server.requests.map(r => r.url)).toEqual(['/api/embeddings']);
  });

  it('does not fall back when /api/embed says the model is missing', async () => {
    server.setHandler((_req, res) =>
      sendJson(res, 404, { error: 'model "nope" not found, try pulling it first' }));
    await expect(provider.embed({ input: 'x', model: 'nope' })).rejects.toThrow(/model "nope" not found/);
    expect(server.requests).toHaveLength(1);
  });

  it('treats a 200 { error } body as an error', async () => {
    server.setHandler((_req, res) => sendJson(res, 200, { error: 'boom' }));
    await expect(provider.complete({ messages: [{ role: 'user', content: 'x' }] })).rejects.toThrow('Ollama API error 200: boom');
  });
});
