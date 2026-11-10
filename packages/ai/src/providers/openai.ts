/**
 * OpenAI Provider.
 * Supports GPT-4o, GPT-4o-mini, GPT-4-turbo, GPT-3.5-turbo.
 * Pure Node.js https - no SDK required.
 *
 * Usage:
 *   const provider = new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY })
 *   const response = await provider.complete({
 *     messages: [{ role: 'user', content: 'Hello!' }],
 *     model: 'gpt-4o'
 *   })
 */

import {
  AIProvider,
  CompletionOptions,
  CompletionResponse,
  CompletionStream,
  EmbeddingOptions,
  EmbeddingResponse,
  StreamChunk,
  ToolCall
} from '../types';
import { requestJson, requestLines, DEFAULT_MAX_RETRIES } from './http';

// ─── Options ──────────────────────────────────────────────────────────────────

export interface OpenAIProviderOptions {
  // OpenAI API key
  apiKey: string;

  // API base URL (default: https://api.openai.com/v1)
  // Override for Azure OpenAI or compatible APIs
  baseUrl?: string;

  // Organization ID (optional)
  organization?: string;

  // Per-attempt socket idle timeout in ms (default: 60000)
  timeoutMs?: number;

  // Retries on 429 / 5xx / network errors (default: 2)
  maxRetries?: number;

  // Base delay for exponential backoff with jitter (default: 500)
  retryBaseDelayMs?: number;
}

// ─── OpenAI Provider ──────────────────────────────────────────────────────────

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  readonly defaultModel = 'gpt-4o-mini';

  private apiKey: string;
  private baseUrl: string;
  private organization?: string;
  private timeoutMs: number;
  private maxRetries: number;
  private retryBaseDelayMs?: number;

  constructor(options: OpenAIProviderOptions) {
    if (!options.apiKey) {
      throw new Error(
        'OpenAI API key is required.\n' +
        'Set OPENAI_API_KEY in your .env file.'
      );
    }

    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl || 'https://api.openai.com/v1';
    this.organization = options.organization;
    this.timeoutMs = options.timeoutMs || 60000;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryBaseDelayMs = options.retryBaseDelayMs;
  }

  // ─── Complete ─────────────────────────────────────────────────────────────────

  async complete(options: CompletionOptions): Promise<CompletionResponse> {
    const body = this.buildRequestBody(options, false);
    const data = await this.post('/chat/completions', body, options);

    const choice = data.choices[0];
    const message = choice.message;

    return {
      content: message.content || '',
      toolCalls: this.parseToolCalls(message.tool_calls),
      finishReason: this.mapFinishReason(choice.finish_reason),
      usage: {
        promptTokens:     data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens:      data.usage?.total_tokens || 0
      },
      model: data.model
    };
  }

  // ─── Stream ───────────────────────────────────────────────────────────────────

  async *stream(options: CompletionOptions): CompletionStream {
    const body = this.buildRequestBody(options, true);

    const lines = this.postStream('/chat/completions', body, options);

    let fullContent = '';
    let promptTokens = 0;
    let completionTokens = 0;
    let model = options.model || this.defaultModel;
    let finishReason = '';

    // Tool calls arrive as fragments keyed by index
    const toolCalls: Array<{ id: string; name: string; args: string }> = [];

    for await (const line of lines) {
      // SSE format: "data: {...}"
      if (!line.startsWith('data: ')) continue;

      const jsonStr = line.slice(6).trim();

      // [DONE] signals end of stream
      if (jsonStr === '[DONE]') {
        const assembled = this.assembleToolCalls(toolCalls);
        yield {
          delta: '',
          done: true,
          response: {
            content: fullContent,
            toolCalls: assembled,
            finishReason: this.mapFinishReason(finishReason),
            usage: {
              promptTokens,
              completionTokens,
              totalTokens: promptTokens + completionTokens
            },
            model
          }
        };
        return;
      }

      let chunk: any;
      try {
        chunk = JSON.parse(jsonStr);
      } catch {
        // Invalid JSON chunk - skip it
        continue;
      }

      const delta = chunk.choices?.[0]?.delta;
      model = chunk.model || model;
      finishReason = chunk.choices?.[0]?.finish_reason || finishReason;

      if (delta?.content) {
        fullContent += delta.content;

        const streamChunk: StreamChunk = {
          delta: delta.content,
          done: false
        };

        yield streamChunk;
      }

      if (Array.isArray(delta?.tool_calls)) {
        for (const tc of delta.tool_calls) {
          const index = typeof tc.index === 'number' ? tc.index : toolCalls.length;
          let entry = toolCalls[index];

          if (!entry) {
            entry = { id: tc.id || `call_${index}`, name: tc.function?.name || '', args: '' };
            toolCalls[index] = entry;
            yield {
              delta: '',
              done: false,
              toolCallIndex: index,
              toolCallDelta: { id: entry.id, name: entry.name }
            };
          } else {
            if (tc.id) entry.id = tc.id;
            if (tc.function?.name) entry.name += tc.function.name;
          }

          const argsDelta = tc.function?.arguments;
          if (argsDelta) {
            entry.args += argsDelta;
            yield {
              delta: '',
              done: false,
              toolCallIndex: index,
              toolCallDelta: { id: entry.id },
              toolCallArgumentsDelta: argsDelta
            };
          }
        }
      }

      // Track usage if provided mid-stream (some models do this)
      if (chunk.usage) {
        promptTokens = chunk.usage.prompt_tokens || 0;
        completionTokens = chunk.usage.completion_tokens || 0;
      }
    }
  }

  // ─── Embed ────────────────────────────────────────────────────────────────────

  async embed(options: EmbeddingOptions): Promise<EmbeddingResponse> {
    const body = {
      input: options.input,
      model: options.model || 'text-embedding-3-small'
    };

    const data = await this.post('/embeddings', body, options);

    return {
      embeddings: data.data.map((d: any) => d.embedding),
      model: data.model,
      usage: { totalTokens: data.usage?.total_tokens || 0 }
    };
  }

  // ─── Internal ─────────────────────────────────────────────────────────────────

  /**
   * Build the request body for the OpenAI API.
   */
  private buildRequestBody(
    options: CompletionOptions,
    stream: boolean
  ): Record<string, unknown> {
    const messages = this.buildMessages(options);

    const body: Record<string, unknown> = {
      model: options.model || this.defaultModel,
      messages,
      temperature: options.temperature ?? 0.7,
      stream
    };

    if (options.maxTokens) body.max_tokens = options.maxTokens;
    if (options.topP !== undefined) body.top_p = options.topP;
    if (options.stopSequences) body.stop = options.stopSequences;

    // Tool definitions
    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools.map(tool => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters
        }
      }));

      if (options.toolChoice) {
        body.tool_choice =
          options.toolChoice === 'auto' || options.toolChoice === 'none'
            ? options.toolChoice
            : { type: 'function', function: { name: (options.toolChoice as any).name } };
      }
    }

    return body;
  }

  /**
   * Build messages array, injecting system prompt if provided separately.
   */
  private buildMessages(options: CompletionOptions): any[] {
    const messages = [...options.messages];

    // If system prompt provided separately, prepend it
    if (options.system && !messages.find(m => m.role === 'system')) {
      messages.unshift({ role: 'system', content: options.system });
    }

    // Map to OpenAI format
    return messages.map(msg => {
      const base: any = { role: msg.role, content: msg.content };

      if (msg.toolCalls && msg.toolCalls.length > 0) {
        base.tool_calls = msg.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments ?? {})
          }
        }));
        // Keep any assistant text that accompanied the tool calls;
        // the API only needs null when there is no text at all
        base.content = msg.content ? msg.content : null;
      }

      if (msg.toolCallId) {
        base.tool_call_id = msg.toolCallId;
      }

      return base;
    });
  }

  /**
   * Parse OpenAI tool_calls format into our ToolCall format.
   */
  private parseToolCalls(rawToolCalls?: any[]): ToolCall[] | undefined {
    if (!rawToolCalls || rawToolCalls.length === 0) return undefined;

    return rawToolCalls.map(tc => ({
      id: tc.id,
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments || '{}')
    }));
  }

  private assembleToolCalls(
    calls: Array<{ id: string; name: string; args: string }>
  ): ToolCall[] | undefined {
    const list = calls.filter(Boolean);
    if (list.length === 0) return undefined;
    return list.map(c => ({ id: c.id, name: c.name, arguments: safeParseArgs(c.args) }));
  }

  private mapFinishReason(
    reason: string
  ): CompletionResponse['finishReason'] {
    const map: Record<string, CompletionResponse['finishReason']> = {
      'stop':          'stop',
      'tool_calls':    'tool_use',
      'function_call': 'tool_use',
      'length':        'length',
      'content_filter': 'stop'
    };
    return map[reason] || 'stop';
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`
    };
    if (this.organization) {
      headers['OpenAI-Organization'] = this.organization;
    }
    return headers;
  }

  /**
   * POST to the OpenAI API (retries, abort and timeouts via ./http).
   */
  private post(
    path: string,
    body: unknown,
    call: { signal?: AbortSignal; timeoutMs?: number } = {}
  ): Promise<any> {
    return requestJson({
      label: 'OpenAI',
      url: this.baseUrl + path,
      headers: this.headers(),
      body,
      maxRetries: this.maxRetries,
      retryBaseDelayMs: this.retryBaseDelayMs,
      idleTimeoutMs: this.timeoutMs,
      signal: call.signal,
      timeoutMs: call.timeoutMs,
      invalidJson: raw => new Error(`OpenAI: Invalid JSON response: ${raw}`)
    });
  }

  /**
   * Streaming POST - async iterable of SSE lines.
   */
  private postStream(
    path: string,
    body: unknown,
    call: { signal?: AbortSignal; timeoutMs?: number } = {}
  ): AsyncIterable<string> {
    return requestLines({
      label: 'OpenAI',
      url: this.baseUrl + path,
      headers: this.headers(),
      body,
      maxRetries: this.maxRetries,
      retryBaseDelayMs: this.retryBaseDelayMs,
      signal: call.signal,
      timeoutMs: call.timeoutMs
    });
  }
}

/**
 * Parse a JSON arguments string; malformed or empty input yields {}.
 */
function safeParseArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object') return raw as Record<string, unknown>;
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : { value: parsed };
  } catch {
    return {};
  }
}
