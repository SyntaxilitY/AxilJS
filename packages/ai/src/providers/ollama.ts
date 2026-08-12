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
  StreamChunk
} from '../types';

export interface OllamaProviderOptions {
  // Ollama base URL (default: http://localhost:11434)
  baseUrl?: string;

  // Default model to use
  model?: string;

  // Request timeout (default: 120000 - local models can be slow)
  timeoutMs?: number;
}

export class OllamaProvider implements AIProvider {
  readonly name = 'ollama';
  readonly defaultModel: string;

  private baseUrl: string;
  private timeoutMs: number;

  constructor(options: OllamaProviderOptions = {}) {
    this.baseUrl = options.baseUrl || 'http://localhost:11434';
    this.defaultModel = options.model || 'llama3.2';
    this.timeoutMs = options.timeoutMs || 120000;
  }

  async complete(options: CompletionOptions): Promise<CompletionResponse> {
    const model = options.model || this.defaultModel;
    const body = {
      model,
      messages: this.formatMessages(options),
      stream: false,
      options: {
        temperature: options.temperature ?? 0.7,
        top_p: options.topP ?? 1,
        num_predict: options.maxTokens
      }
    };

    const data = await this.post('/api/chat', body);

    return {
      content: data.message?.content || '',
      finishReason: data.done ? 'stop' : 'length',
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
    const body = {
      model,
      messages: this.formatMessages(options),
      stream: true,
      options: {
        temperature: options.temperature ?? 0.7,
        num_predict: options.maxTokens
      }
    };

    let fullContent = '';
    let promptTokens = 0;
    let completionTokens = 0;

    const lines = await this.postStream('/api/chat', body);

    for await (const line of lines) {
      if (!line.trim()) continue;

      try {
        const chunk = JSON.parse(line);

        const delta = chunk.message?.content || '';
        if (delta) {
          fullContent += delta;
          yield { delta, done: false };
        }

        if (chunk.done) {
          promptTokens = chunk.prompt_eval_count || 0;
          completionTokens = chunk.eval_count || 0;

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
              model: chunk.model || model
            }
          };
          return;
        }
      } catch {
        continue;
      }
    }
  }

  async embed(options: EmbeddingOptions): Promise<EmbeddingResponse> {
    const inputs = Array.isArray(options.input)
      ? options.input
      : [options.input];

    const model = options.model || 'nomic-embed-text';

    // Ollama processes embeddings one at a time
    const embeddings: number[][] = [];
    let totalTokens = 0;

    for (const input of inputs) {
      const data = await this.post('/api/embeddings', { model, prompt: input });
      embeddings.push(data.embedding);
      totalTokens += input.split(' ').length; // Approximate
    }

    return {
      embeddings,
      model,
      usage: { totalTokens }
    };
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  private formatMessages(options: CompletionOptions): any[] {
    const messages = [...options.messages];

    if (options.system && !messages.find(m => m.role === 'system')) {
      messages.unshift({ role: 'system', content: options.system });
    }

    return messages.map(m => ({ role: m.role, content: m.content }));
  }

  private post(path: string, body: unknown): Promise<any> {
    return new Promise((resolve, reject) => {
      const bodyStr = JSON.stringify(body);
      const url = new URL(this.baseUrl + path);
      const isHttps = url.protocol === 'https:';
      const transport = isHttps ? require('https') : require('http');

      let responded = false;

      const req = transport.request(
        {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 11434),
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': String(Buffer.byteLength(bodyStr))
          }
        },
        (res: any) => {
          responded = true;
          let data = '';
          res.on('data', (chunk: string) => (data += chunk));
          res.on('end', () => {
            try {
              resolve(JSON.parse(data));
            } catch {
              reject(new Error(
                `Ollama: Invalid JSON response. ` +
                `Is Ollama running at ${this.baseUrl}? ` +
                `Start with: ollama serve`
              ));
            }
          });
          res.on('error', (err: Error) => {
            if (!responded) reject(err);
          });
        }
      );

      // ✅ CRITICAL — always handle the error event on req
      // Without this Node.js crashes with unhandled 'error' event
      req.on('error', (err: Error) => {
        reject(new Error(
          `Cannot connect to Ollama at ${this.baseUrl}.\n` +
          `Make sure Ollama is running: ollama serve\n` +
          `Pull model: ollama pull ${this.defaultModel}\n` +
          `Error: ${err.message}`
        ));
      });

      req.setTimeout(this.timeoutMs, () => {
        req.destroy(
          new Error(
            `Ollama request timed out after ${this.timeoutMs}ms. ` +
            `Model may still be loading.`
          )
        );
      });

      req.write(bodyStr);
      req.end();
    });
  }

  private postStream(path: string, body: unknown): AsyncIterable<string> {
  const bodyStr = JSON.stringify(body);
  const url     = new URL(this.baseUrl + path);
  const isHttps = url.protocol === 'https:';
  const transport = isHttps ? require('https') : require('http');

  return {
    [Symbol.asyncIterator]() {
      return (async function* () {
        const queue: string[] = [];
        let notify: (() => void) | null = null;
        let done        = false;
        let streamError: Error | null = null;
        let lineBuffer  = '';

        const req = transport.request(
          {
            hostname: url.hostname,
            port:     url.port || (isHttps ? 443 : 11434),
            path:     url.pathname,
            method:   'POST',
            headers: {
              'Content-Type':   'application/json',
              'Content-Length': String(Buffer.byteLength(bodyStr))
            }
          },
          (res: any) => {
            res.on('data', (chunk: Buffer) => {
              lineBuffer += chunk.toString();
              const parts = lineBuffer.split('\n');
              lineBuffer  = parts.pop() || '';

              for (const part of parts) {
                if (part.trim()) {
                  queue.push(part.trim());
                  if (notify) { notify(); notify = null; }
                }
              }
            });

            res.on('end', () => {
              done = true;
              if (notify) { notify(); notify = null; }
            });

            res.on('error', (err: Error) => {
              streamError = err;
              done = true;
              if (notify) { notify(); notify = null; }
            });
          }
        );

        // ✅ CRITICAL — handle error event on req
        req.on('error', (err: Error) => {
          streamError = new Error(
            `Cannot connect to Ollama at ${url.origin}. ` +
            `Start Ollama with: ollama serve`
          );
          done = true;
          if (notify) { notify(); notify = null; }
        });

        req.write(bodyStr);
        req.end();

        while (!done || queue.length > 0) {
          if (queue.length > 0) {
            yield queue.shift()!;
          } else if (!done) {
            await new Promise<void>(r => { notify = r; });
          }
        }

        if (streamError) throw streamError;
      })();
    }
  };
}
}