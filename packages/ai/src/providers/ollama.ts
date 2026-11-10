/**
 * Ollama Provider.
 * Run LLMs locally: Llama 3, Mistral, Phi-3, Gemma, DeepSeek, etc.
 * No API key required. Requires Ollama to be running locally.
 *
 * Install Ollama: https://ollama.ai
 * Pull a model:   ollama pull llama3.2
 *
 * Usage:
 *   const provider = new OllamaProvider({ model: 'llama3.2' })
 *   const response = await provider.complete({
 *     messages: [{ role: 'user', content: 'Hello!' }]
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
import { requestJson, requestLines, linkSignal, AIHttpError, DEFAULT_MAX_RETRIES } from './http';

export interface OllamaProviderOptions {
  // Ollama base URL (default: http://localhost:11434)
  baseUrl?: string;

  // Default model to use
  model?: string;

  // Per-attempt socket idle timeout (default: 120000 - local models can be slow)
  timeoutMs?: number;

  // Retries on 429 / 5xx / network errors (default: 2)
  maxRetries?: number;

  // Base delay for exponential backoff with jitter (default: 500)
  retryBaseDelayMs?: number;
}

export class OllamaProvider implements AIProvider {
  readonly name = 'ollama';
  readonly defaultModel: string;

  private baseUrl: string;
  private timeoutMs: number;
  private maxRetries: number;
  private retryBaseDelayMs?: number;
  private callCounter = 0;

  // Set once the server answered 404 to /api/embed (Ollama < 0.3.4)
  private legacyEmbeddings = false;

  constructor(options: OllamaProviderOptions = {}) {
    this.baseUrl = options.baseUrl || 'http://localhost:11434';
    this.defaultModel = options.model || 'llama3.2';
    this.timeoutMs = options.timeoutMs || 120000;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryBaseDelayMs = options.retryBaseDelayMs;
  }

  async complete(options: CompletionOptions): Promise<CompletionResponse> {
    const model = options.model || this.defaultModel;
    const body: Record<string, unknown> = {
      model,
      messages: this.formatMessages(options),
      stream: false,
      options: {
        temperature: options.temperature ?? 0.7,
        top_p: options.topP ?? 1,
        num_predict: options.maxTokens
      }
    };
    this.addTools(body, options);

    const data = await this.post('/api/chat', body, options);
    const toolCalls = this.parseToolCalls(data.message?.tool_calls);

    return {
      content: data.message?.content || '',
      toolCalls,
      finishReason: toolCalls ? 'tool_use' : (data.done ? 'stop' : 'length'),
      usage: {
        promptTokens: data.prompt_eval_count || 0,
        completionTokens: data.eval_count || 0,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0)
      },
      model: data.model || model
    };
  }

  async *stream(options: CompletionOptions): CompletionStream {
    const model = options.model || this.defaultModel;
    const body: Record<string, unknown> = {
      model,
      messages: this.formatMessages(options),
      stream: true,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens
      }
    };
    this.addTools(body, options);

    let fullContent = '';
    let promptTokens = 0;
    let completionTokens = 0;
    const toolCalls: ToolCall[] = [];

    const lines = this.postStream('/api/chat', body, options);

    let streamFailure: string | null = null;

    for await (const line of lines) {
      if (!line.trim()) continue;

      let chunk: any;
      try {
        chunk = JSON.parse(line);
      } catch {
        continue;
      }

      // Ollama reports errors (e.g. model unloaded mid-stream) as { error }
      if (chunk.error) streamFailure = String(chunk.error);

      const delta = chunk.message?.content || '';
      if (delta) {
        fullContent += delta;
        yield { delta, done: false };
      }

      // Ollama sends complete tool calls (usually in one chunk)
      for (const call of this.parseToolCalls(chunk.message?.tool_calls) || []) {
        toolCalls.push(call);
        yield {
          delta: '',
          done: false,
          toolCallIndex: toolCalls.length - 1,
          toolCallDelta: { ...call }
        };
      }

      if (chunk.done) {
        promptTokens = chunk.prompt_eval_count || 0;
        completionTokens = chunk.eval_count || 0;

        yield {
          delta: '',
          done: true,
          response: {
            content: fullContent,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            finishReason: toolCalls.length > 0 ? 'tool_use' : 'stop',
            usage: {
              promptTokens,
              completionTokens,
              totalTokens: promptTokens + completionTokens
            },
            model: chunk.model || model
          }
        };
        return;
      }

      if (streamFailure) {
        throw new Error(`Ollama error: ${streamFailure}`);
      }
    }
  }

  /**
   * Embed with the batched /api/embed endpoint (`input: string[]`).
   * Falls back to the legacy one-text-per-request /api/embeddings when the
   * server answers 404 (Ollama older than 0.3.4).
   */
  async embed(options: EmbeddingOptions): Promise<EmbeddingResponse> {
    const inputs = Array.isArray(options.input)
      ? options.input
      : [options.input];

    const model = options.model || 'nomic-embed-text';

    // One deadline / signal for the whole call
    const { signal, cleanup } = linkSignal('Ollama', options.signal, options.timeoutMs);

    try {
      if (!this.legacyEmbeddings) {
        try {
          const data = await this.post('/api/embed', { model, input: inputs }, { signal });
          return {
            embeddings: data.embeddings || [],
            model,
            usage: {
              totalTokens: data.prompt_eval_count ||
                inputs.reduce((n, t) => n + t.split(' ').length, 0)
            }
          };
        } catch (err) {
          if (!(err instanceof AIHttpError && err.status === 404) || isModelNotFound(err)) throw err;
          this.legacyEmbeddings = true;
        }
      }

      // Legacy endpoint processes embeddings one at a time
      const embeddings: number[][] = [];
      let totalTokens = 0;

      for (const input of inputs) {
        const data = await this.post('/api/embeddings', { model, prompt: input }, { signal });
        embeddings.push(data.embedding);
        totalTokens += input.split(' ').length; // Approximate
      }

      return {
        embeddings,
        model,
        usage: { totalTokens }
      };
    } finally {
      cleanup();
    }
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  private addTools(body: Record<string, unknown>, options: CompletionOptions): void {
    // Ollama has no tool_choice; 'none' means: don't offer the tools
    if (!options.tools || options.tools.length === 0 || options.toolChoice === 'none') return;

    body.tools = options.tools.map(tool => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    }));
  }

  private formatMessages(options: CompletionOptions): any[] {
    const messages = [...options.messages];

    if (options.system && !messages.find(m => m.role === 'system')) {
      messages.unshift({ role: 'system', content: options.system });
    }

    const callNames = new Map<string, string>();

    return messages.map(m => {
      const out: any = { role: m.role, content: m.content };

      if (m.toolCalls && m.toolCalls.length > 0) {
        out.tool_calls = m.toolCalls.map(tc => {
          callNames.set(tc.id, tc.name);
          return { function: { name: tc.name, arguments: tc.arguments || {} } };
        });
      }

      if (m.role === 'tool') {
        const name = m.name || (m.toolCallId ? callNames.get(m.toolCallId) : undefined);
        if (name) out.tool_name = name;
      }

      return out;
    });
  }

  private parseToolCalls(raw: unknown): ToolCall[] | undefined {
    if (!Array.isArray(raw) || raw.length === 0) return undefined;

    return raw.map((tc: any) => {
      let args = tc.function?.arguments ?? {};
      if (typeof args === 'string') {
        try { args = JSON.parse(args); } catch { args = {}; }
      }
      return {
        id: tc.id || `ollama-call-${++this.callCounter}`,
        name: tc.function?.name || '',
        arguments: args && typeof args === 'object' ? args : {}
      };
    });
  }

  private connectError(err: Error): Error {
    return new Error(
      `Cannot connect to Ollama at ${this.baseUrl}.\n` +
      `Make sure Ollama is running: ollama serve\n` +
      `Pull model: ollama pull ${this.defaultModel}\n` +
      `Error: ${err.message}`
    );
  }

  private post(
    path: string,
    body: unknown,
    call: { signal?: AbortSignal; timeoutMs?: number } = {}
  ): Promise<any> {
    return requestJson({
      label: 'Ollama',
      url: this.baseUrl + path,
      body,
      defaultPort: 11434,
      maxRetries: this.maxRetries,
      retryBaseDelayMs: this.retryBaseDelayMs,
      idleTimeoutMs: this.timeoutMs,
      signal: call.signal,
      timeoutMs: call.timeoutMs,
      // Ollama may also return { error } with a 2xx status
      isErrorBody: parsed => Boolean(parsed?.error),
      invalidJson: () => new Error(
        `Ollama: Invalid JSON response. ` +
        `Is Ollama running at ${this.baseUrl}? ` +
        `Start with: ollama serve`
      ),
      wrapNetworkError: err => this.connectError(err)
    });
  }

  private postStream(
    path: string,
    body: unknown,
    call: { signal?: AbortSignal; timeoutMs?: number } = {}
  ): AsyncIterable<string> {
    const url = new URL(this.baseUrl + path);
    return requestLines({
      label: 'Ollama',
      url: this.baseUrl + path,
      body,
      defaultPort: 11434,
      maxRetries: this.maxRetries,
      retryBaseDelayMs: this.retryBaseDelayMs,
      signal: call.signal,
      timeoutMs: call.timeoutMs,
      wrapNetworkError: () => new Error(
        `Cannot connect to Ollama at ${url.origin}. ` +
        `Start Ollama with: ollama serve`
      )
    });
  }
}

/**
 * /api/embed answers 404 both when the endpoint is missing and when the
 * model is not pulled; only the former should trigger the legacy fallback.
 */
function isModelNotFound(err: AIHttpError): boolean {
  return /model\b.*not found|not found.*pull/i.test(err.message);
}
