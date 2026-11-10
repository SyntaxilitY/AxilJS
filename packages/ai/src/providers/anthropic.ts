/**
 * Anthropic Provider.
 * Supports Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Haiku.
 * Pure Node.js https - no SDK required.
 *
 * Usage:
 *   const provider = new AnthropicProvider({
 *     apiKey: process.env.ANTHROPIC_API_KEY
 *   })
 *   const response = await provider.complete({
 *     messages: [{ role: 'user', content: 'Hello!' }],
 *     model: 'claude-3-5-sonnet-20241022'
 *   })
 */

import {
  AIProvider,
  CompletionOptions,
  CompletionResponse,
  CompletionStream,
  EmbeddingOptions,
  EmbeddingResponse,
  ToolCall
} from '../types';
import { requestJson, requestLines, DEFAULT_MAX_RETRIES } from './http';

export interface AnthropicProviderOptions {
  apiKey: string;
  baseUrl?: string;

  // Per-attempt socket idle timeout in ms (default: 60000)
  timeoutMs?: number;

  // Retries on 429 / 5xx / 529 overloaded / network errors (default: 2)
  maxRetries?: number;

  // Base delay for exponential backoff with jitter (default: 500)
  retryBaseDelayMs?: number;
}

export class AnthropicProvider implements AIProvider {
  readonly name = 'anthropic';
  readonly defaultModel = 'claude-3-5-haiku-20241022';

  private apiKey: string;
  private baseUrl: string;
  private timeoutMs: number;
  private maxRetries: number;
  private retryBaseDelayMs?: number;

  // Anthropic API version header
  private readonly API_VERSION = '2023-06-01';

  constructor(options: AnthropicProviderOptions) {
    if (!options.apiKey) {
      throw new Error(
        'Anthropic API key is required.\n' +
        'Set ANTHROPIC_API_KEY in your .env file.'
      );
    }
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl || 'https://api.anthropic.com/v1';
    this.timeoutMs = options.timeoutMs || 60000;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryBaseDelayMs = options.retryBaseDelayMs;
  }

  async complete(options: CompletionOptions): Promise<CompletionResponse> {
    const body = this.buildRequestBody(options, false);
    const data = await this.post('/messages', body, options);

    // Anthropic returns content as an array of content blocks
    const textContent = data.content
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text)
      .join('');

    const toolUse = data.content
      .filter((c: any) => c.type === 'tool_use')
      .map((c: any) => ({
        id: c.id,
        name: c.name,
        arguments: c.input || {}
      }));

    return {
      content: textContent,
      toolCalls: toolUse.length > 0 ? toolUse : undefined,
      finishReason: this.mapStopReason(data.stop_reason),
      usage: {
        promptTokens: data.usage?.input_tokens || 0,
        completionTokens: data.usage?.output_tokens || 0,
        totalTokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
      },
      model: data.model
    };
  }

  async *stream(options: CompletionOptions): CompletionStream {
    const body = this.buildRequestBody(options, true);

    let fullContent = '';
    let model = options.model || this.defaultModel;
    let inputTokens = 0;
    let outputTokens = 0;
    let stopReason = '';
    let streamFailure: string | null = null;

    // tool_use blocks keyed by content block index
    const toolBlocks = new Map<number, { id: string; name: string; json: string; input?: Record<string, unknown> }>();
    // Stable 0-based position of each tool call (block index -> call index)
    const toolOrder: number[] = [];

    const lines = this.postStream('/messages', body, options);

    for await (const line of lines) {
      if (!line.startsWith('data: ')) continue;

      const jsonStr = line.slice(6).trim();
      if (!jsonStr) continue;

      let event: any;
      try {
        event = JSON.parse(jsonStr);
      } catch {
        continue;
      }

      switch (event.type) {
        case 'content_block_start': {
          const block = event.content_block;
          if (block?.type === 'tool_use') {
            const index = typeof event.index === 'number' ? event.index : toolOrder.length;
            const hasInput = block.input && Object.keys(block.input).length > 0;
            toolBlocks.set(index, {
              id: block.id,
              name: block.name,
              json: '',
              input: hasInput ? block.input : undefined
            });
            toolOrder.push(index);
            yield {
              delta: '',
              done: false,
              toolCallIndex: toolOrder.length - 1,
              toolCallDelta: { id: block.id, name: block.name }
            };
          }
          break;
        }

        case 'content_block_delta': {
          if (event.delta?.type === 'input_json_delta') {
            const block = toolBlocks.get(event.index);
            const partial = event.delta.partial_json || '';
            if (block && partial) {
              block.json += partial;
              yield {
                delta: '',
                done: false,
                toolCallIndex: toolOrder.indexOf(event.index),
                toolCallDelta: { id: block.id },
                toolCallArgumentsDelta: partial
              };
            }
            break;
          }

          const delta = event.delta?.text || '';
          if (delta) {
            fullContent += delta;
            yield { delta, done: false };
          }
          break;
        }

        case 'message_delta': {
          outputTokens = event.usage?.output_tokens || outputTokens;
          stopReason = event.delta?.stop_reason || stopReason;
          break;
        }

        case 'error': {
          // Mid-stream API error (e.g. overloaded_error) - surface it
          streamFailure = event.error?.message || 'Unknown stream error';
          break;
        }

        case 'message_start': {
          model = event.message?.model || model;
          inputTokens = event.message?.usage?.input_tokens || 0;
          break;
        }

        case 'message_stop': {
          const toolCalls: ToolCall[] = toolOrder.map(index => {
            const b = toolBlocks.get(index)!;
            return { id: b.id, name: b.name, arguments: parseJsonArgs(b.json, b.input) };
          });

          yield {
            delta: '',
            done: true,
            response: {
              content: fullContent,
              toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
              finishReason: this.mapStopReason(stopReason),
              usage: {
                promptTokens: inputTokens,
                completionTokens: outputTokens,
                totalTokens: inputTokens + outputTokens
              },
              model
            }
          };
          return;
        }
      }

      if (streamFailure) {
        throw new Error(`Anthropic stream error: ${streamFailure}`);
      }
    }
  }

  async embed(_options: EmbeddingOptions): Promise<EmbeddingResponse> {
    // Anthropic does not provide a native embeddings API
    // Use OpenAI or a dedicated embedding provider for this
    throw new Error(
      'Anthropic does not support embeddings.\n' +
      'Use OpenAIProvider or OllamaProvider for embeddings.'
    );
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  private buildRequestBody(
    options: CompletionOptions,
    stream: boolean
  ): Record<string, unknown> {
    // Separate system messages from conversation messages
    const systemMessages = options.messages.filter(m => m.role === 'system');
    const conversationMessages = options.messages.filter(m => m.role !== 'system');

    // Anthropic accepts system as a top-level field
    const system =
      options.system ||
      systemMessages.map(m => m.content).join('\n') ||
      undefined;

    // Map to Anthropic content blocks. Anthropic has no 'tool' role:
    // tool results are user-turn tool_result blocks, and assistant tool
    // calls are tool_use blocks. Consecutive tool results share one turn.
    const messages: any[] = [];
    for (const msg of conversationMessages) {
      if (msg.role === 'tool') {
        const block = {
          type: 'tool_result',
          tool_use_id: msg.toolCallId,
          content: msg.content
        };
        const last = messages[messages.length - 1];
        if (
          last && last.role === 'user' && Array.isArray(last.content) &&
          last.content.every((b: any) => b.type === 'tool_result')
        ) {
          last.content.push(block);
        } else {
          messages.push({ role: 'user', content: [block] });
        }
      } else if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        messages.push({
          role: 'assistant',
          content: [
            ...(msg.content ? [{ type: 'text', text: msg.content }] : []),
            ...msg.toolCalls.map(tc => ({
              type: 'tool_use',
              id: tc.id,
              name: tc.name,
              input: tc.arguments || {}
            }))
          ]
        });
      } else {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    const body: Record<string, unknown> = {
      model: options.model || this.defaultModel,
      messages,
      max_tokens: options.maxTokens || 4096,
      stream
    };

    if (system) body.system = system;
    if (options.temperature !== undefined) body.temperature = options.temperature;
    if (options.topP !== undefined) body.top_p = options.topP;
    if (options.stopSequences) body.stop_sequences = options.stopSequences;

    // Tool definitions
    if (options.tools && options.tools.length > 0) {
      body.tools = options.tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.parameters
      }));

      if (options.toolChoice) {
        body.tool_choice =
          options.toolChoice === 'auto' || options.toolChoice === 'none'
            ? { type: options.toolChoice }
            : { type: 'tool', name: options.toolChoice.name };
      }
    }

    return body;
  }

  private mapStopReason(
    reason: string
  ): CompletionResponse['finishReason'] {
    const map: Record<string, CompletionResponse['finishReason']> = {
      'end_turn': 'stop',
      'tool_use': 'tool_use',
      'max_tokens': 'length',
      'stop_sequence': 'stop'
    };
    return map[reason] || 'stop';
  }

  private headers(): Record<string, string> {
    return {
      'x-api-key': this.apiKey,
      'anthropic-version': this.API_VERSION
    };
  }

  private post(
    path: string,
    body: unknown,
    call: { signal?: AbortSignal; timeoutMs?: number } = {}
  ): Promise<any> {
    return requestJson({
      label: 'Anthropic',
      url: this.baseUrl + path,
      headers: this.headers(),
      body,
      maxRetries: this.maxRetries,
      retryBaseDelayMs: this.retryBaseDelayMs,
      idleTimeoutMs: this.timeoutMs,
      signal: call.signal,
      timeoutMs: call.timeoutMs,
      invalidJson: raw => new Error(`Anthropic: Invalid JSON: ${raw}`)
    });
  }

  private postStream(
    path: string,
    body: unknown,
    call: { signal?: AbortSignal; timeoutMs?: number } = {}
  ): AsyncIterable<string> {
    return requestLines({
      label: 'Anthropic',
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
 * Parse accumulated input_json_delta fragments ('' means no input).
 */
function parseJsonArgs(json: string, fallback?: Record<string, unknown>): Record<string, unknown> {
  if (!json.trim()) return fallback || {};
  try {
    const parsed = JSON.parse(json);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return fallback || {};
  }
}
