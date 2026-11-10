/**
 * Google Gemini Provider.
 * Supports Gemini 1.5 Pro, Gemini 1.5 Flash, Gemini 2.0 Flash.
 * Pure Node.js https - no SDK required.
 *
 * Usage:
 *   const provider = new GeminiProvider({
 *     apiKey: process.env.GOOGLE_API_KEY
 *   })
 */

import {
  AIProvider,
  CompletionOptions,
  CompletionResponse,
  CompletionStream,
  EmbeddingOptions,
  EmbeddingResponse,
  Message,
  ToolCall
} from '../types';
import { requestJson, requestLines, linkSignal, DEFAULT_MAX_RETRIES } from './http';

export interface GeminiProviderOptions {
  apiKey: string;
  baseUrl?: string;

  // Per-attempt socket idle timeout in ms (default: 60000)
  timeoutMs?: number;

  // Retries on 429 / 5xx / network errors (default: 2)
  maxRetries?: number;

  // Base delay for exponential backoff with jitter (default: 500)
  retryBaseDelayMs?: number;
}

// Gemini caps batchEmbedContents at 100 requests per call
const EMBED_BATCH_SIZE = 100;

// Prefix for tool call IDs we synthesize (older Gemini models send no id)
const SYNTHETIC_ID_PREFIX = 'gemini-call-';

export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  readonly defaultModel = 'gemini-1.5-flash';

  private apiKey: string;
  private baseUrl: string;
  private timeoutMs: number;
  private maxRetries: number;
  private retryBaseDelayMs?: number;
  private callCounter = 0;

  constructor(options: GeminiProviderOptions) {
    if (!options.apiKey) {
      throw new Error(
        'Google API key required.\n' +
        'Set GOOGLE_API_KEY in your .env file.'
      );
    }
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
    this.timeoutMs = options.timeoutMs || 60000;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryBaseDelayMs = options.retryBaseDelayMs;
  }

  async complete(options: CompletionOptions): Promise<CompletionResponse> {
    const model = options.model || this.defaultModel;
    const body = this.buildRequestBody(options);

    const data = await this.post(
      `/models/${model}:generateContent?key=${this.apiKey}`,
      body,
      options
    );

    const candidate = data.candidates?.[0];
    const parts: any[] = candidate?.content?.parts || [];
    const content = parts
      .filter((p: any) => p.text)
      .map((p: any) => p.text)
      .join('');
    const toolCalls = this.parseFunctionCalls(parts);

    return {
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason: toolCalls.length > 0
        ? 'tool_use'
        : this.mapFinishReason(candidate?.finishReason),
      usage: {
        promptTokens: data.usageMetadata?.promptTokenCount || 0,
        completionTokens: data.usageMetadata?.candidatesTokenCount || 0,
        totalTokens: data.usageMetadata?.totalTokenCount || 0
      },
      model
    };
  }

  async *stream(options: CompletionOptions): CompletionStream {
    const model = options.model || this.defaultModel;
    const body = this.buildRequestBody(options);

    let fullContent = '';
    const toolCalls: ToolCall[] = [];

    const lines = this.postStream(
      `/models/${model}:streamGenerateContent?key=${this.apiKey}&alt=sse`,
      body,
      options
    );

    for await (const line of lines) {
      if (!line.startsWith('data: ')) continue;

      const jsonStr = line.slice(6).trim();
      if (!jsonStr) continue;

      let chunk: any;
      try {
        chunk = JSON.parse(jsonStr);
      } catch {
        continue;
      }

      const parts: any[] = chunk.candidates?.[0]?.content?.parts || [];
      const delta = parts
        .filter((p: any) => p.text)
        .map((p: any) => p.text)
        .join('');

      if (delta) {
        fullContent += delta;
        yield { delta, done: false };
      }

      // Gemini sends each functionCall complete, in a single part
      for (const call of this.parseFunctionCalls(parts)) {
        toolCalls.push(call);
        yield {
          delta: '',
          done: false,
          toolCallIndex: toolCalls.length - 1,
          toolCallDelta: { ...call }
        };
      }

      const finishReason = chunk.candidates?.[0]?.finishReason;
      // Any finish reason (STOP, MAX_TOKENS, SAFETY, RECITATION, ...) ends the stream
      if (finishReason) {
        yield {
          delta: '',
          done: true,
          response: {
            content: fullContent,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            finishReason: toolCalls.length > 0
              ? 'tool_use'
              : this.mapFinishReason(finishReason),
            usage: {
              promptTokens: chunk.usageMetadata?.promptTokenCount || 0,
              completionTokens: chunk.usageMetadata?.candidatesTokenCount || 0,
              totalTokens: chunk.usageMetadata?.totalTokenCount || 0
            },
            model
          }
        };
        return;
      }
    }
  }

  /**
   * Embed via batchEmbedContents (up to 100 texts per request).
   */
  async embed(options: EmbeddingOptions): Promise<EmbeddingResponse> {
    const inputs = Array.isArray(options.input) ? options.input : [options.input];
    const model = options.model || 'text-embedding-004';
    const embeddings: number[][] = [];

    // One deadline / signal for the whole call, across batches
    const { signal, cleanup } = linkSignal('Gemini', options.signal, options.timeoutMs);

    try {
      for (let i = 0; i < inputs.length; i += EMBED_BATCH_SIZE) {
        const batch = inputs.slice(i, i + EMBED_BATCH_SIZE);
        const data = await this.post(
          `/models/${model}:batchEmbedContents?key=${this.apiKey}`,
          {
            requests: batch.map(text => ({
              model: `models/${model}`,
              content: { parts: [{ text }] }
            }))
          },
          { signal }
        );

        const returned: any[] = data.embeddings || [];
        for (let j = 0; j < batch.length; j++) {
          embeddings.push(returned[j]?.values || []);
        }
      }
    } finally {
      cleanup();
    }

    return {
      embeddings,
      model,
      usage: { totalTokens: inputs.join(' ').split(' ').length }
    };
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  private buildRequestBody(options: CompletionOptions): Record<string, unknown> {
    const contents = this.buildContents(options.messages);

    // System prompt
    const systemMsg = options.messages.find(m => m.role === 'system');
    const systemInstruction = options.system || systemMsg?.content;

    const body: Record<string, unknown> = { contents };

    if (systemInstruction) {
      body.systemInstruction = {
        parts: [{ text: systemInstruction }]
      };
    }

    body.generationConfig = {
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxTokens,
      topP: options.topP,
      stopSequences: options.stopSequences
    };

    // Tool definitions
    if (options.tools && options.tools.length > 0) {
      body.tools = [{
        functionDeclarations: options.tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters
        }))
      }];

      if (options.toolChoice) {
        body.toolConfig = {
          functionCallingConfig:
            options.toolChoice === 'auto' ? { mode: 'AUTO' } :
            options.toolChoice === 'none' ? { mode: 'NONE' } :
            { mode: 'ANY', allowedFunctionNames: [options.toolChoice.name] }
        };
      }
    }

    return body;
  }

  /**
   * Convert messages to Gemini `contents`.
   * Assistant tool calls -> model `functionCall` parts; tool results ->
   * user `functionResponse` parts (consecutive results share one turn).
   */
  private buildContents(messages: Message[]): any[] {
    // Gemini identifies function responses by name, so remember which
    // tool call ID belongs to which function
    const callNames = new Map<string, string>();
    const contents: any[] = [];

    for (const m of messages) {
      if (m.role === 'system') continue;

      if (m.role === 'assistant' && m.toolCalls && m.toolCalls.length > 0) {
        const parts: any[] = [];
        if (m.content) parts.push({ text: m.content });
        for (const tc of m.toolCalls) {
          callNames.set(tc.id, tc.name);
          const functionCall: Record<string, unknown> = { name: tc.name, args: tc.arguments || {} };
          if (tc.id && !tc.id.startsWith(SYNTHETIC_ID_PREFIX)) functionCall.id = tc.id;
          parts.push({ functionCall });
        }
        contents.push({ role: 'model', parts });
        continue;
      }

      if (m.role === 'tool') {
        const name = m.name || (m.toolCallId ? callNames.get(m.toolCallId) : undefined) || 'tool';
        const functionResponse: Record<string, unknown> = {
          name,
          response: toResponseObject(m.content)
        };
        if (m.toolCallId && !m.toolCallId.startsWith(SYNTHETIC_ID_PREFIX)) {
          functionResponse.id = m.toolCallId;
        }

        const last = contents[contents.length - 1];
        if (
          last && last.role === 'user' &&
          last.parts.every((p: any) => p.functionResponse)
        ) {
          last.parts.push({ functionResponse });
        } else {
          contents.push({ role: 'user', parts: [{ functionResponse }] });
        }
        continue;
      }

      contents.push({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      });
    }

    return contents;
  }

  private parseFunctionCalls(parts: any[]): ToolCall[] {
    return parts
      .filter(p => p && p.functionCall)
      .map(p => ({
        id: p.functionCall.id || `${SYNTHETIC_ID_PREFIX}${++this.callCounter}`,
        name: p.functionCall.name,
        arguments: p.functionCall.args || {}
      }));
  }

  private mapFinishReason(reason: string): CompletionResponse['finishReason'] {
    const map: Record<string, CompletionResponse['finishReason']> = {
      'STOP': 'stop',
      'MAX_TOKENS': 'length',
      'SAFETY': 'stop'
    };
    return map[reason] || 'stop';
  }

  private post(
    path: string,
    body: unknown,
    call: { signal?: AbortSignal; timeoutMs?: number } = {}
  ): Promise<any> {
    return requestJson({
      label: 'Gemini',
      url: this.baseUrl + path,
      body,
      maxRetries: this.maxRetries,
      retryBaseDelayMs: this.retryBaseDelayMs,
      idleTimeoutMs: this.timeoutMs,
      signal: call.signal,
      timeoutMs: call.timeoutMs,
      invalidJson: () => new Error('Gemini: Invalid JSON response')
    });
  }

  private postStream(
    path: string,
    body: unknown,
    call: { signal?: AbortSignal; timeoutMs?: number } = {}
  ): AsyncIterable<string> {
    return requestLines({
      label: 'Gemini',
      url: this.baseUrl + path,
      body,
      maxRetries: this.maxRetries,
      retryBaseDelayMs: this.retryBaseDelayMs,
      signal: call.signal,
      timeoutMs: call.timeoutMs
    });
  }
}

/**
 * functionResponse.response must be a JSON object.
 */
function toResponseObject(content: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed;
    return { result: parsed };
  } catch {
    return { result: content };
  }
}
