import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { OpenAIProvider } from '../src/providers/openai';
import { StreamChunk, ToolDefinition } from '../src/types';
import { startMockServer, MockServer, sendJson, writeAwkward, sse, collect } from './helpers/mock-server';

const weatherTool: ToolDefinition = {
  name: 'get_weather',
  description: 'Weather for a city',
  parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] }
};

describe('OpenAIProvider', () => {
  let server: MockServer;
  let provider: OpenAIProvider;

  beforeAll(async () => {
    server = await startMockServer((_req, res) => sendJson(res, 404, {}));
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    server.requests.length = 0;
    provider = new OpenAIProvider({ apiKey: 'sk-test', baseUrl: `${server.url}/v1`, organization: 'org-1' });
  });

  it('sends the chat request and parses the response', async () => {
    server.setHandler((_req, res) => sendJson(res, 200, {
      model: 'gpt-4o-mini-2024',
      choices: [{ message: { content: 'Hello!' }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 }
    }));

    const out = await provider.complete({
      messages: [{ role: 'user', content: 'Hi' }],
      system: 'Be brief',
      maxTokens: 50,
      stopSequences: ['END'],
      tools: [weatherTool],
      toolChoice: { name: 'get_weather' }
    });

    expect(out).toEqual({
      content: 'Hello!',
      toolCalls: undefined,
      finishReason: 'stop',
      usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5 },
      model: 'gpt-4o-mini-2024'
    });

    const req = server.requests[0];
    expect(req.url).toBe('/v1/chat/completions');
    expect(req.headers.authorization).toBe('Bearer sk-test');
    expect(req.headers['openai-organization']).toBe('org-1');
    expect(req.body).toMatchObject({
      model: 'gpt-4o-mini',
      stream: false,
      temperature: 0.7,
      max_tokens: 50,
      stop: ['END'],
      messages: [
        { role: 'system', content: 'Be brief' },
        { role: 'user', content: 'Hi' }
      ],
      tools: [{ type: 'function', function: { name: 'get_weather', description: 'Weather for a city' } }],
      tool_choice: { type: 'function', function: { name: 'get_weather' } }
    });
  });

  it('parses tool calls and keeps assistant text alongside tool_calls when replaying history', async () => {
    server.setHandler((_req, res) => sendJson(res, 200, {
      model: 'gpt-4o-mini',
      choices: [{
        message: {
          content: null,
          tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Paris"}' } }]
        },
        finish_reason: 'tool_calls'
      }]
    }));

    const out = await provider.complete({
      messages: [
        { role: 'user', content: 'Weather?' },
        {
          role: 'assistant',
          content: 'Let me check.',
          toolCalls: [{ id: 'call_0', name: 'get_weather', arguments: { city: 'Rome' } }]
        },
        { role: 'tool', content: '{"temp":20}', toolCallId: 'call_0' },
        { role: 'assistant', content: '', toolCalls: [{ id: 'call_x', name: 'get_weather', arguments: {} }] }
      ],
      tools: [weatherTool]
    });

    expect(out.finishReason).toBe('tool_use');
    expect(out.toolCalls).toEqual([{ id: 'call_1', name: 'get_weather', arguments: { city: 'Paris' } }]);

    const msgs = server.requests[0].body.messages;
    expect(msgs[1]).toEqual({
      role: 'assistant',
      content: 'Let me check.',
      tool_calls: [{ id: 'call_0', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Rome"}' } }]
    });
    expect(msgs[2]).toEqual({ role: 'tool', content: '{"temp":20}', tool_call_id: 'call_0' });
    // No text -> null content, as the API expects
    expect(msgs[3].content).toBeNull();
  });

  it('streams text across awkward SSE chunk boundaries (incl. split UTF-8)', async () => {
    const body = sse([
      { model: 'gpt-4o', choices: [{ delta: { content: 'Héllo ' } }] },
      { model: 'gpt-4o', choices: [{ delta: { content: 'wörld 🌍' } }] },
      { model: 'gpt-4o', choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 4, completion_tokens: 3 } }
    ], { done: true });
    server.setHandler(async (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      await writeAwkward(res, body);
    });

    const chunks = await collect(provider.stream({ messages: [{ role: 'user', content: 'Hi' }] }));
    const text = chunks.filter(c => !c.done).map(c => c.delta).join('');
    expect(text).toBe('Héllo wörld 🌍');

    const last = chunks[chunks.length - 1];
    expect(last.done).toBe(true);
    expect(last.response).toMatchObject({
      content: 'Héllo wörld 🌍',
      finishReason: 'stop',
      usage: { promptTokens: 4, completionTokens: 3, totalTokens: 7 },
      model: 'gpt-4o'
    });
    expect(server.requests[0].body.stream).toBe(true);
  });

  it('streams tool calls as deltas and assembles them in the final response', async () => {
    const body = sse([
      { choices: [{ delta: { content: 'Checking. ' } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_a', type: 'function', function: { name: 'get_weather', arguments: '' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"ci' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 1, id: 'call_b', type: 'function', function: { name: 'get_weather', arguments: '{"city":"Oslo"}' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'ty":"Paris"}' } }] } }] },
      { choices: [{ delta: {}, finish_reason: 'tool_calls' }] }
    ], { done: true });
    server.setHandler(async (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      await writeAwkward(res, body, [13, 4, 29]);
    });

    const chunks: StreamChunk[] = await collect(provider.stream({
      messages: [{ role: 'user', content: 'Weather?' }],
      tools: [weatherTool]
    }));

    const deltas = chunks.filter(c => c.toolCallDelta);
    expect(deltas[0]).toMatchObject({ toolCallIndex: 0, toolCallDelta: { id: 'call_a', name: 'get_weather' } });
    expect(deltas.filter(d => d.toolCallIndex === 0).map(d => d.toolCallArgumentsDelta || '').join(''))
      .toBe('{"city":"Paris"}');

    const final = chunks[chunks.length - 1];
    expect(final.done).toBe(true);
    expect(final.response!.finishReason).toBe('tool_use');
    expect(final.response!.content).toBe('Checking. ');
    expect(final.response!.toolCalls).toEqual([
      { id: 'call_a', name: 'get_weather', arguments: { city: 'Paris' } },
      { id: 'call_b', name: 'get_weather', arguments: { city: 'Oslo' } }
    ]);
  });

  it('embeds with the embeddings endpoint', async () => {
    server.setHandler((_req, res) => sendJson(res, 200, {
      model: 'text-embedding-3-small',
      data: [{ embedding: [1, 2] }, { embedding: [3, 4] }],
      usage: { total_tokens: 6 }
    }));

    const out = await provider.embed({ input: ['a', 'b'] });
    expect(out).toEqual({ embeddings: [[1, 2], [3, 4]], model: 'text-embedding-3-small', usage: { totalTokens: 6 } });
    expect(server.requests[0].url).toBe('/v1/embeddings');
    expect(server.requests[0].body).toEqual({ input: ['a', 'b'], model: 'text-embedding-3-small' });
  });

  it('surfaces API errors with the provider message', async () => {
    server.setHandler((_req, res) => sendJson(res, 400, { error: { message: 'bad model' } }));
    await expect(provider.complete({ messages: [{ role: 'user', content: 'x' }] }))
      .rejects.toThrow('OpenAI API error 400: bad model');
    expect(server.requests).toHaveLength(1); // 4xx is not retried

    await expect(collect(provider.stream({ messages: [{ role: 'user', content: 'x' }] })))
      .rejects.toThrow('OpenAI API error 400: bad model');
  });

  it('does not leak the stream when the consumer stops early', async () => {
    vi.useRealTimers();
    server.setHandler(async (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(sse([{ choices: [{ delta: { content: 'one' } }] }]));
      // never ends on its own
    });

    for await (const chunk of provider.stream({ messages: [{ role: 'user', content: 'x' }] })) {
      expect(chunk.delta).toBe('one');
      break;
    }

    await new Promise(r => setTimeout(r, 50));
    expect(server.closedEarly()).toBeGreaterThanOrEqual(1);
  });
});
