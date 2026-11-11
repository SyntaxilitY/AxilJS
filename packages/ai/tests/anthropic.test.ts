import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { AnthropicProvider } from '../src/providers/anthropic';
import { ToolDefinition } from '../src/types';
import { startMockServer, MockServer, sendJson, writeAwkward, collect } from './helpers/mock-server';

const tool: ToolDefinition = {
  name: 'lookup',
  description: 'Look something up',
  parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] }
};

function anthropicSSE(events: Array<Record<string, unknown>>): string {
  return events.map(e => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
}

describe('AnthropicProvider', () => {
  let server: MockServer;
  let provider: AnthropicProvider;

  beforeAll(async () => {
    server = await startMockServer((_req, res) => sendJson(res, 404, {}));
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    server.requests.length = 0;
    provider = new AnthropicProvider({ apiKey: 'ak', baseUrl: `${server.url}/v1` });
  });

  it('sends system/messages/tools and parses text + tool_use', async () => {
    server.setHandler((_req, res) => sendJson(res, 200, {
      model: 'claude-x',
      content: [
        { type: 'text', text: 'Looking up. ' },
        { type: 'tool_use', id: 'tu_1', name: 'lookup', input: { q: 'axil' } }
      ],
      stop_reason: 'tool_use',
      usage: { input_tokens: 10, output_tokens: 5 }
    }));

    const out = await provider.complete({
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'find axil' }
      ],
      tools: [tool],
      toolChoice: 'auto',
      temperature: 0
    });

    expect(out).toEqual({
      content: 'Looking up. ',
      toolCalls: [{ id: 'tu_1', name: 'lookup', arguments: { q: 'axil' } }],
      finishReason: 'tool_use',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      model: 'claude-x'
    });

    const req = server.requests[0];
    expect(req.url).toBe('/v1/messages');
    expect(req.headers['x-api-key']).toBe('ak');
    expect(req.headers['anthropic-version']).toBe('2023-06-01');
    expect(req.body).toMatchObject({
      model: 'claude-haiku-4-5-20251001',
      system: 'sys',
      max_tokens: 4096,
      temperature: 0,
      stream: false,
      messages: [{ role: 'user', content: 'find axil' }],
      tools: [{ name: 'lookup', description: 'Look something up', input_schema: tool.parameters }],
      tool_choice: { type: 'auto' }
    });
  });

  it('maps tool history into tool_use / tool_result blocks', async () => {
    server.setHandler((_req, res) => sendJson(res, 200, {
      model: 'claude-x', content: [{ type: 'text', text: 'done' }], stop_reason: 'end_turn'
    }));

    await provider.complete({
      messages: [
        { role: 'user', content: 'q' },
        { role: 'assistant', content: 'thinking', toolCalls: [
          { id: 't1', name: 'lookup', arguments: { q: 'a' } },
          { id: 't2', name: 'lookup', arguments: { q: 'b' } }
        ] },
        { role: 'tool', content: '"A"', toolCallId: 't1' },
        { role: 'tool', content: '"B"', toolCallId: 't2' }
      ]
    });

    expect(server.requests[0].body.messages).toEqual([
      { role: 'user', content: 'q' },
      { role: 'assistant', content: [
        { type: 'text', text: 'thinking' },
        { type: 'tool_use', id: 't1', name: 'lookup', input: { q: 'a' } },
        { type: 'tool_use', id: 't2', name: 'lookup', input: { q: 'b' } }
      ] },
      { role: 'user', content: [
        { type: 'tool_result', tool_use_id: 't1', content: '"A"' },
        { type: 'tool_result', tool_use_id: 't2', content: '"B"' }
      ] }
    ]);
  });

  it('streams text and tool_use input_json_delta across awkward boundaries', async () => {
    const body = anthropicSSE([
      { type: 'message_start', message: { model: 'claude-s', usage: { input_tokens: 7 } } },
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Sure — ' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'checking ✓' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_9', name: 'lookup', input: {} } },
      { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '' } },
      { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: '{"q": "ax' } },
      { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: 'il"}' } },
      { type: 'content_block_stop', index: 1 },
      { type: 'content_block_start', index: 2, content_block: { type: 'tool_use', id: 'toolu_10', name: 'lookup', input: {} } },
      { type: 'content_block_stop', index: 2 },
      { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 12 } },
      { type: 'message_stop' }
    ]);
    server.setHandler(async (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      await writeAwkward(res, body, [25, 3, 40, 11]);
    });

    const chunks = await collect(provider.stream({ messages: [{ role: 'user', content: 'x' }], tools: [tool] }));
    expect(chunks.filter(c => c.delta).map(c => c.delta).join('')).toBe('Sure — checking ✓');

    const toolDeltas = chunks.filter(c => c.toolCallDelta);
    expect(toolDeltas[0]).toMatchObject({ toolCallIndex: 0, toolCallDelta: { id: 'toolu_9', name: 'lookup' } });
    expect(toolDeltas.filter(d => d.toolCallIndex === 0).map(d => d.toolCallArgumentsDelta || '').join(''))
      .toBe('{"q": "axil"}');
    expect(toolDeltas.some(d => d.toolCallIndex === 1 && d.toolCallDelta!.id === 'toolu_10')).toBe(true);

    const final = chunks[chunks.length - 1];
    expect(final.done).toBe(true);
    expect(final.response).toEqual({
      content: 'Sure — checking ✓',
      toolCalls: [
        { id: 'toolu_9', name: 'lookup', arguments: { q: 'axil' } },
        { id: 'toolu_10', name: 'lookup', arguments: {} }
      ],
      finishReason: 'tool_use',
      usage: { promptTokens: 7, completionTokens: 12, totalTokens: 19 },
      model: 'claude-s'
    });
  });

  it('surfaces mid-stream error events', async () => {
    server.setHandler((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.end(anthropicSSE([
        { type: 'message_start', message: { model: 'm', usage: { input_tokens: 1 } } },
        { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } }
      ]));
    });
    await expect(collect(provider.stream({ messages: [{ role: 'user', content: 'x' }] })))
      .rejects.toThrow('Anthropic stream error: Overloaded');
  });

  it('does not support embeddings', async () => {
    await expect(provider.embed({ input: 'x' })).rejects.toThrow(/does not support embeddings/);
    await expect(provider.embed({ input: 'x' })).rejects.toThrow(/embeddingProvider/);
  });
});
