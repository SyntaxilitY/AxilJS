import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { GeminiProvider } from '../src/providers/gemini';
import { ToolDefinition } from '../src/types';
import { startMockServer, MockServer, sendJson, writeAwkward, sse, collect } from './helpers/mock-server';

const tool: ToolDefinition = {
  name: 'add',
  description: 'Add numbers',
  parameters: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } } }
};

describe('GeminiProvider', () => {
  let server: MockServer;
  let provider: GeminiProvider;

  beforeAll(async () => {
    server = await startMockServer((_req, res) => sendJson(res, 404, {}));
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    server.requests.length = 0;
    provider = new GeminiProvider({ apiKey: 'gk', baseUrl: `${server.url}/v1beta` });
  });

  it('sends contents/systemInstruction/tools and parses text', async () => {
    server.setHandler((_req, res) => sendJson(res, 200, {
      candidates: [{ content: { parts: [{ text: 'Hi ' }, { text: 'there' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2, totalTokenCount: 6 }
    }));

    const out = await provider.complete({
      messages: [{ role: 'user', content: 'hello' }, { role: 'assistant', content: 'yo' }, { role: 'user', content: 'again' }],
      system: 'sys',
      tools: [tool],
      toolChoice: { name: 'add' }
    });

    expect(out).toEqual({
      content: 'Hi there',
      toolCalls: undefined,
      finishReason: 'stop',
      usage: { promptTokens: 4, completionTokens: 2, totalTokens: 6 },
      model: 'gemini-1.5-flash'
    });

    const req = server.requests[0];
    expect(req.url).toBe('/v1beta/models/gemini-1.5-flash:generateContent?key=gk');
    expect(req.body).toMatchObject({
      contents: [
        { role: 'user', parts: [{ text: 'hello' }] },
        { role: 'model', parts: [{ text: 'yo' }] },
        { role: 'user', parts: [{ text: 'again' }] }
      ],
      systemInstruction: { parts: [{ text: 'sys' }] },
      tools: [{ functionDeclarations: [{ name: 'add', description: 'Add numbers', parameters: tool.parameters }] }],
      toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: ['add'] } }
    });
  });

  it('parses functionCall parts and replays functionCall / functionResponse history', async () => {
    server.setHandler((_req, res) => sendJson(res, 200, {
      candidates: [{
        content: { parts: [{ functionCall: { name: 'add', args: { a: 1, b: 2 } } }, { functionCall: { id: 'fc-real', name: 'add', args: { a: 3, b: 4 } } }] },
        finishReason: 'STOP'
      }]
    }));

    const out = await provider.complete({ messages: [{ role: 'user', content: 'sum' }], tools: [tool] });
    expect(out.finishReason).toBe('tool_use');
    expect(out.toolCalls).toHaveLength(2);
    expect(out.toolCalls![0]).toMatchObject({ name: 'add', arguments: { a: 1, b: 2 } });
    expect(out.toolCalls![0].id).toMatch(/^gemini-call-/);
    expect(out.toolCalls![1]).toEqual({ id: 'fc-real', name: 'add', arguments: { a: 3, b: 4 } });

    server.requests.length = 0;
    server.setHandler((_req, res) => sendJson(res, 200, {
      candidates: [{ content: { parts: [{ text: '3 and 7' }] }, finishReason: 'STOP' }]
    }));

    const final = await provider.complete({
      messages: [
        { role: 'user', content: 'sum' },
        { role: 'assistant', content: '', toolCalls: out.toolCalls },
        { role: 'tool', content: '3', toolCallId: out.toolCalls![0].id },
        { role: 'tool', content: '{"sum":7}', toolCallId: 'fc-real' }
      ],
      tools: [tool]
    });
    expect(final.content).toBe('3 and 7');

    expect(server.requests[0].body.contents).toEqual([
      { role: 'user', parts: [{ text: 'sum' }] },
      { role: 'model', parts: [
        { functionCall: { name: 'add', args: { a: 1, b: 2 } } },
        { functionCall: { id: 'fc-real', name: 'add', args: { a: 3, b: 4 } } }
      ] },
      { role: 'user', parts: [
        { functionResponse: { name: 'add', response: { result: 3 } } },
        { functionResponse: { id: 'fc-real', name: 'add', response: { sum: 7 } } }
      ] }
    ]);
  });

  it('streams text and function calls over SSE', async () => {
    const body = sse([
      { candidates: [{ content: { parts: [{ text: 'Grüße, ' }] } }] },
      { candidates: [{ content: { parts: [{ text: 'adding' }, { functionCall: { name: 'add', args: { a: 2, b: 5 } } }] } }] },
      { candidates: [{ content: { parts: [] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 4, totalTokenCount: 7 } }
    ]);
    server.setHandler(async (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      await writeAwkward(res, body, [3, 8, 1]);
    });

    const chunks = await collect(provider.stream({ messages: [{ role: 'user', content: 'x' }], tools: [tool] }));
    expect(server.requests[0].url).toBe('/v1beta/models/gemini-1.5-flash:streamGenerateContent?key=gk&alt=sse');
    expect(chunks.filter(c => c.delta).map(c => c.delta).join('')).toBe('Grüße, adding');

    const toolChunk = chunks.find(c => c.toolCallDelta)!;
    expect(toolChunk.toolCallIndex).toBe(0);
    expect(toolChunk.toolCallDelta).toMatchObject({ name: 'add', arguments: { a: 2, b: 5 } });

    const final = chunks[chunks.length - 1];
    expect(final.done).toBe(true);
    expect(final.response).toMatchObject({
      content: 'Grüße, adding',
      finishReason: 'tool_use',
      usage: { promptTokens: 3, completionTokens: 4, totalTokens: 7 }
    });
    expect(final.response!.toolCalls![0]).toMatchObject({ name: 'add', arguments: { a: 2, b: 5 } });
  });

  it('embeds in batches with batchEmbedContents', async () => {
    server.setHandler((req, res) => sendJson(res, 200, {
      embeddings: req.body.requests.map((_r: unknown, i: number) => ({ values: [i, req.body.requests.length] }))
    }));

    const inputs = Array.from({ length: 150 }, (_, i) => `text ${i}`);
    const out = await provider.embed({ input: inputs });

    expect(server.requests).toHaveLength(2);
    expect(server.requests[0].url).toBe('/v1beta/models/text-embedding-004:batchEmbedContents?key=gk');
    expect(server.requests[0].body.requests).toHaveLength(100);
    expect(server.requests[0].body.requests[0]).toEqual({
      model: 'models/text-embedding-004',
      content: { parts: [{ text: 'text 0' }] }
    });
    expect(server.requests[1].body.requests).toHaveLength(50);
    expect(out.embeddings).toHaveLength(150);
    expect(out.embeddings[0]).toEqual([0, 100]);
    expect(out.embeddings[149]).toEqual([49, 50]);
    expect(out.model).toBe('text-embedding-004');
  });
});
