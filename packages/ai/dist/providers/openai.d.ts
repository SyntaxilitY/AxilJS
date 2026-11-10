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
import { AIProvider, CompletionOptions, CompletionResponse, CompletionStream, EmbeddingOptions, EmbeddingResponse } from '../types';
export interface OpenAIProviderOptions {
    apiKey: string;
    baseUrl?: string;
    organization?: string;
    timeoutMs?: number;
    maxRetries?: number;
    retryBaseDelayMs?: number;
}
export declare class OpenAIProvider implements AIProvider {
    readonly name = "openai";
    readonly defaultModel = "gpt-4o-mini";
    private apiKey;
    private baseUrl;
    private organization?;
    private timeoutMs;
    private maxRetries;
    private retryBaseDelayMs?;
    constructor(options: OpenAIProviderOptions);
    complete(options: CompletionOptions): Promise<CompletionResponse>;
    stream(options: CompletionOptions): CompletionStream;
    embed(options: EmbeddingOptions): Promise<EmbeddingResponse>;
    /**
     * Build the request body for the OpenAI API.
     */
    private buildRequestBody;
    /**
     * Build messages array, injecting system prompt if provided separately.
     */
    private buildMessages;
    /**
     * Parse OpenAI tool_calls format into our ToolCall format.
     */
    private parseToolCalls;
    private assembleToolCalls;
    private mapFinishReason;
    private headers;
    /**
     * POST to the OpenAI API (retries, abort and timeouts via ./http).
     */
    private post;
    /**
     * Streaming POST - async iterable of SSE lines.
     */
    private postStream;
}
//# sourceMappingURL=openai.d.ts.map