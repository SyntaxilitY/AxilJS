/**
 * OpenAI Provider.
 * Supports GPT-4o, GPT-4o-mini, GPT-4-turbo, GPT-3.5-turbo.
 * Uses the official openai npm package (peer dependency).
 *
 * Install: npm install openai
 *
 * Usage:
 *   const provider = new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY })
 *   const response = await provider.complete({
 *     messages: [{ role: 'user', content: 'Hello!' }],
 *     model: 'gpt-4o'
 *   })
 */

import { get } from 'https';
import {
  AIProvider,
  CompletionOptions,
  CompletionResponse,
  CompletionStream,
  EmbeddingOptions,
  EmbeddingResponse,
  StreamChunk,
  Message
} from '../types';

// ─── Options ──────────────────────────────────────────────────────────────────

export interface OpenAIProviderOptions {
  // OpenAI API key
  apiKey: string;

  // API base URL (default: https://api.openai.com/v1)
  // Override for Azure OpenAI or compatible APIs
  baseUrl?: string;

  // Organization ID (optional)
  organization?: string;

  // Request timeout in ms (default: 60000)
  timeoutMs?: number;
}

// ─── OpenAI Provider ──────────────────────────────────────────────────────────

export class OpenAIProvider implements AIProvider {
  readonly name = 'openai';
  readonly defaultModel = 'gpt-4o-mini';

  private apiKey: string;
  private baseUrl: string;
  private organization?: string;
  private timeoutMs: number;

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
  }

  // ─── Complete ─────────────────────────────────────────────────────────────────

  async complete(options: CompletionOptions): Promise<CompletionResponse> {
    const body = this.buildRequestBody(options, false);
    const data = await this.post('/chat/completions', body);

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

    // Use native https for streaming to avoid buffering
    const lines = await this.postStream('/chat/completions', body);

    let fullContent = '';
    let promptTokens = 0;
    let completionTokens = 0;
    let model = options.model || this.defaultModel;

    for await (const line of lines) {
      // SSE format: "data: {...}"
      if (!line.startsWith('data: ')) continue;

      const jsonStr = line.slice(6).trim();

      // [DONE] signals end of stream
      if (jsonStr === '[DONE]') {
        yield {
          delta: '',
          done: true,
          response: {
            content: fullContent,
            finishReason: 'stop',
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

      try {
        const chunk = JSON.parse(jsonStr);
        const delta = chunk.choices?.[0]?.delta;
        model = chunk.model || model;

        if (delta?.content) {
          fullContent += delta.content;

          const streamChunk: StreamChunk = {
            delta: delta.content,
            done: false
          };

          yield streamChunk;
        }

        // Track usage if provided mid-stream (some models do this)
        if (chunk.usage) {
          promptTokens = chunk.usage.prompt_tokens || 0;
          completionTokens = chunk.usage.completion_tokens || 0;
        }
      } catch {
        // Invalid JSON chunk - skip it
        continue;
      }
    }
  }

  // ─── Embed ────────────────────────────────────────────────────────────────────

  async embed(options: EmbeddingOptions): Promise<EmbeddingResponse> {
    const body = {
      input: options.input,
      model: options.model || 'text-embedding-3-small'
    };

    const data = await this.post('/embeddings', body);

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

      if (msg.toolCalls) {
        base.tool_calls = msg.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: {
            name: tc.name,
            arguments: JSON.stringify(tc.arguments)
          }
        }));
        // Assistant messages with tool calls have null content in OpenAI API
        base.content = null;
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
  private parseToolCalls(rawToolCalls?: any[]): any[] | undefined {
    if (!rawToolCalls || rawToolCalls.length === 0) return undefined;

    return rawToolCalls.map(tc => ({
      id: tc.id,
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments || '{}')
    }));
  }

  private mapFinishReason(
    reason: string
  ): CompletionResponse['finishReason'] {
    const map: Record<string, CompletionResponse['finishReason']> = {
      'stop':          'stop',
      'tool_calls':    'tool_use',
      'length':        'length',
      'content_filter': 'stop'
    };
    return map[reason] || 'stop';
  }

  /**
   * Make a POST request to the OpenAI API.
   * Pure Node.js https - no external dependencies.
   */
  private post(path: string, body: unknown): Promise<any> {
    return new Promise((resolve, reject) => {
      const bodyStr = JSON.stringify(body);
      const url = new URL(this.baseUrl + path);

      const headers: Record<string, string> = {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Length': String(Buffer.byteLength(bodyStr))
      };

      if (this.organization) {
        headers['OpenAI-Organization'] = this.organization;
      }

      const req = require('https').request(
        {
          hostname: url.hostname,
          port: url.port || 443,
          path: url.pathname + url.search,
          method: 'POST',
          headers
        },
        (res: any) => {
          let data = '';
          res.on('data', (chunk: string) => (data += chunk));
          res.on('end', () => {
            try {
              const parsed = JSON.parse(data);

              if (res.statusCode >= 400) {
                reject(new Error(
                  `OpenAI API error ${res.statusCode}: ` +
                  (parsed.error?.message || data)
                ));
                return;
              }

              resolve(parsed);
            } catch {
              reject(new Error(`OpenAI: Invalid JSON response: ${data}`));
            }
          });
          res.on('error', reject);
        }
      );

      req.on('error', reject);

      // Set timeout
      req.setTimeout(this.timeoutMs, () => {
        req.destroy(new Error(`OpenAI request timed out after ${this.timeoutMs}ms`));
      });

      req.write(bodyStr);
      req.end();
    });
  }

  /**
   * Stream POST request - returns async iterable of SSE lines.
   */
  private postStream(
    path: string,
    body: unknown
  ): AsyncIterable<string> {
    const bodyStr = JSON.stringify(body);
    const url     = new URL(this.baseUrl + path);

    const headers: Record<string, string> = {
      'Content-Type':   'application/json',
      'Authorization':  `Bearer ${this.apiKey}`,
      'Content-Length': String(Buffer.byteLength(bodyStr))
    };

    if (this.organization) {
      headers['OpenAI-Organization'] = this.organization;
    }

    return {
      [Symbol.asyncIterator]() {
        return (async function* () {
          const lines: string[] = [];
          let resolve: (() => void) | null = null;
          let done        = false;
          let streamError: Error | null = null;
          let lineBuffer  = '';

          const req = require('https').request(
            {
              hostname: url.hostname,
              port:     url.port || 443,
              path:     url.pathname,
              method:   'POST',
              headers
            },
            (res: any) => {
              res.on('data', (chunk: Buffer) => {
                lineBuffer += chunk.toString();
                const parts = lineBuffer.split('\n');
                lineBuffer  = parts.pop() || '';

                for (const part of parts) {
                  if (part.trim()) {
                    lines.push(part.trim());
                    if (resolve) { resolve(); resolve = null; }
                  }
                }
              });

              res.on('end', () => {
                done = true;
                if (resolve) { resolve(); resolve = null; }
              });

              res.on('error', (err: Error) => {
                streamError = err;
                done = true;
                if (resolve) { resolve(); resolve = null; }
              });
            }
          );

          // ✅ CRITICAL — handle error event on req
          req.on('error', (err: Error) => {
            streamError = err;
            done = true;
            if (resolve) { resolve(); resolve = null; }
          });

          req.write(bodyStr);
          req.end();

          while (!done || lines.length > 0) {
            if (lines.length > 0) {
              yield lines.shift()!;
            } else if (!done) {
              await new Promise<void>(r => { resolve = r; });
            }
          }

          if (streamError) throw streamError;
        })();
      }
    };
  }
}