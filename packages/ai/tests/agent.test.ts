import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Agent } from '../src/agents/agent';
import { createTool, calculatorTool } from '../src/agents/tool';
import { OpenAIProvider } from '../src/providers/openai';
import { AnthropicProvider } from '../src/providers/anthropic';
import { GeminiProvider } from '../src/providers/gemini';
import { OllamaProvider } from '../src/providers/ollama';
import {
  AIProvider, CompletionOptions, CompletionResponse, CompletionStream, EmbeddingResponse
} from '../src/types';
import { startMockServer, MockServer, sendJson, collect, silenceConsole, RecordedRequest } from './helpers/mock-server';

// ─── Scripted mock provider ───────────────────────────────────────────────────

class ScriptedProvider implements AIProvider {
  readonly name = 'scripted';
  readonly defaultModel = 'scripted-1';
  calls: CompletionOptions[] = [];

  constructor(private script: Array<Partial<CompletionResponse>>) {}

  async complete(options: CompletionOptions): Promise<CompletionResponse> {
    this.calls.push(JSON.parse(JSON.stringify({ ...options, signal: undefined })));
    const next = this.script[Math.min(this.calls.length - 1, this.script.length - 1)];
    return {
      content: '',
      finishReason: 'stop',
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      model: this.defaultModel,
      ...next
    };
  }

  // eslint-disable-next-line require-yield
  async *stream(): CompletionStream {
    throw new Error('not used');
  }

  async embed(): Promise<EmbeddingResponse> {
    throw new Error('not used');
  }
}

const echoTool = createTool({
  name: 'echo',
  description: 'Echo input',
  parameters: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
  handler: async ({ text }) => ({ echoed: text })
});

describe('Agent with a mock provider', () => {
  beforeEach(() => silenceConsole(vi));

  it('logger: false prints nothing; a custom logger receives the messages', async () => {
    vi.restoreAllMocks();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const failing = createTool({
      name: 'boom', description: 'fails', parameters: { type: 'object', properties: {} },
      handler: async () => { throw new Error('kaput'); }
    });
    const script = (): Array<Partial<CompletionResponse>> => [
      { content: 'thinking', finishReason: 'tool_use', toolCalls: [
        { id: 't1', name: 'echo', arguments: { text: 'x' } },
        { id: 't2', name: 'boom', arguments: {} }
      ] },
      { content: 'done' }
    ];

    const silent = new Agent({ provider: new ScriptedProvider(script()), tools: [echoTool, failing], logger: false });
    expect((await silent.run('task')).response).toBe('done');
    const capped = new Agent({ provider: new ScriptedProvider(script()), tools: [echoTool, failing], logger: false, maxIterations: 1 });
    expect((await capped.run('task')).success).toBe(false);
    for (const spy of [log, warn, error, write]) expect(spy).not.toHaveBeenCalled();

    const info: string[] = [];
    const warns: string[] = [];
    const custom = new Agent({
      provider: new ScriptedProvider(script()), tools: [echoTool, failing],
      logger: { info: m => info.push(m), warn: m => warns.push(m) }
    });
    await custom.run('task');
    expect(info.some(m => m.includes('Starting task'))).toBe(true);
    expect(info.some(m => m.includes('Completed in 2'))).toBe(true);
    expect(warns).toEqual(['Tool boom failed: kaput']);
    expect([...info, ...warns].some(m => m.includes('\u001b['))).toBe(false);
    for (const spy of [log, warn, error, write]) expect(spy).not.toHaveBeenCalled();
  });

  it('runs tools and returns the final answer', async () => {
    const provider = new ScriptedProvider([
      { content: 'calling', finishReason: 'tool_use', toolCalls: [
        { id: 't1', name: 'echo', arguments: { text: 'hi' } },
        { id: 't2', name: 'calculator', arguments: { expression: '2^10' } },
        { id: 't3', name: 'missing', arguments: {} }
      ] },
      { content: 'All done' }
    ]);
    const steps: number[] = [];
    const agent = new Agent({ provider, tools: [echoTool, calculatorTool], onStep: s => steps.push(s.iteration) });

    const result = await agent.run('do it');
    expect(result).toMatchObject({ response: 'All done', iterations: 2, success: true, usage: { totalTokens: 4, steps: 2 } });
    expect(steps).toEqual([1, 2]);

    const toolResults = result.steps[0].toolResults!;
    expect(toolResults.find(r => r.toolName === 'echo')!.result).toEqual({ echoed: 'hi' });
    expect(toolResults.find(r => r.toolName === 'calculator')!.result).toMatchObject({ result: 1024 });
    expect(toolResults.find(r => r.toolName === 'missing')!.error).toBe("Tool 'missing' not found");

    // Second call carries the assistant tool calls and the tool results
    const second = provider.calls[1].messages;
    expect(second[1]).toMatchObject({ role: 'assistant', content: 'calling' });
    expect(second.filter(m => m.role === 'tool').map(m => m.toolCallId).sort()).toEqual(['t1', 't2', 't3']);
    expect(provider.calls[0].tools!.map(t => t.name)).toEqual(['echo', 'calculator']);
  });

  it('run() reports failure at maxIterations', async () => {
    const provider = new ScriptedProvider([
      { finishReason: 'tool_use', toolCalls: [{ id: 'x', name: 'echo', arguments: { text: 'loop' } }] }
    ]);
    const result = await new Agent({ provider, tools: [echoTool], maxIterations: 2 }).run('loop');
    expect(result).toMatchObject({ success: false, iterations: 2, response: 'Task could not be completed within 2 iterations.' });
  });

  it('runStream yields a final done step when maxIterations is hit', async () => {
    const provider = new ScriptedProvider([
      { finishReason: 'tool_use', toolCalls: [{ id: 'x', name: 'echo', arguments: { text: 'loop' } }] }
    ]);
    const agent = new Agent({ provider, tools: [echoTool], maxIterations: 3 });
    const steps = await collect(agent.runStream('loop'));

    expect(steps.filter(s => !s.done)).toHaveLength(3);
    const last = steps[steps.length - 1];
    expect(last.done).toBe(true);
    expect(last.finalResult).toEqual({
      response: 'Task could not be completed within 3 iterations.',
      steps: expect.any(Array),
      iterations: 3,
      success: false,
      usage: { totalTokens: 6, steps: 3 }
    });
    expect(last.finalResult!.steps).toHaveLength(3);
  });

  it('runStream finishes normally with a final answer', async () => {
    const provider = new ScriptedProvider([
      { finishReason: 'tool_use', toolCalls: [{ id: 'x', name: 'echo', arguments: { text: 'a' } }] },
      { content: 'final' }
    ]);
    const steps = await collect(new Agent({ provider, tools: [echoTool] }).runStream('go'));
    expect(steps.map(s => s.done)).toEqual([false, true]);
    expect(steps[1].finalResult).toMatchObject({ response: 'final', success: true, iterations: 2 });
  });
});

// ─── Agent round trips through every real provider ────────────────────────────

describe('Agent tool-calling round trip for every provider', () => {
  let server: MockServer;

  beforeAll(async () => {
    server = await startMockServer((_req, res) => sendJson(res, 404, {}));
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    silenceConsole(vi);
    server.requests.length = 0;
  });

  interface Case {
    name: string;
    make: (url: string) => AIProvider;
    // first response (tool call), second response (final answer)
    respond: (req: RecordedRequest, index: number) => unknown;
    // assert the tool result made it back in provider format
    checkSecond: (body: any) => void;
  }

  const cases: Case[] = [
    {
      name: 'openai',
      make: url => new OpenAIProvider({ apiKey: 'k', baseUrl: url }),
      respond: (_r, i) => i === 0
        ? { model: 'm', choices: [{ message: { content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'echo', arguments: '{"text":"ping"}' } }] }, finish_reason: 'tool_calls' }] }
        : { model: 'm', choices: [{ message: { content: 'pong!' }, finish_reason: 'stop' }] },
      checkSecond: body => {
        expect(body.messages).toContainEqual({ role: 'tool', content: '{"echoed":"ping"}', tool_call_id: 'c1' });
      }
    },
    {
      name: 'anthropic',
      make: url => new AnthropicProvider({ apiKey: 'k', baseUrl: url }),
      respond: (_r, i) => i === 0
        ? { model: 'm', content: [{ type: 'tool_use', id: 'tu1', name: 'echo', input: { text: 'ping' } }], stop_reason: 'tool_use' }
        : { model: 'm', content: [{ type: 'text', text: 'pong!' }], stop_reason: 'end_turn' },
      checkSecond: body => {
        expect(body.messages[body.messages.length - 1]).toEqual({
          role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu1', content: '{"echoed":"ping"}' }]
        });
      }
    },
    {
      name: 'gemini',
      make: url => new GeminiProvider({ apiKey: 'k', baseUrl: url }),
      respond: (_r, i) => i === 0
        ? { candidates: [{ content: { parts: [{ functionCall: { name: 'echo', args: { text: 'ping' } } }] }, finishReason: 'STOP' }] }
        : { candidates: [{ content: { parts: [{ text: 'pong!' }] }, finishReason: 'STOP' }] },
      checkSecond: body => {
        expect(body.contents[body.contents.length - 1]).toEqual({
          role: 'user', parts: [{ functionResponse: { name: 'echo', response: { echoed: 'ping' } } }]
        });
      }
    },
    {
      name: 'ollama',
      make: url => new OllamaProvider({ baseUrl: url }),
      respond: (_r, i) => i === 0
        ? { model: 'm', message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'echo', arguments: { text: 'ping' } } }] }, done: true }
        : { model: 'm', message: { role: 'assistant', content: 'pong!' }, done: true },
      checkSecond: body => {
        expect(body.messages[body.messages.length - 1]).toEqual({ role: 'tool', content: '{"echoed":"ping"}', tool_name: 'echo' });
      }
    }
  ];

  for (const c of cases) {
    it(`${c.name}: model -> tool -> model`, async () => {
      server.setHandler((req, res, i) => sendJson(res, 200, c.respond(req, i)));
      const agent = new Agent({ provider: c.make(server.url), tools: [echoTool] });

      const result = await agent.run('say ping');
      expect(result.success).toBe(true);
      expect(result.response).toBe('pong!');
      expect(result.steps[0].toolResults![0]).toMatchObject({ toolName: 'echo', result: { echoed: 'ping' } });
      expect(server.requests).toHaveLength(2);
      c.checkSecond(server.requests[1].body);
    });
  }
});
