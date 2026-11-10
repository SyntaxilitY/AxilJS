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
import { AIProvider, CompletionOptions, CompletionResponse, CompletionStream, EmbeddingOptions, EmbeddingResponse } from '../types';
export interface GeminiProviderOptions {
    apiKey: string;
    baseUrl?: string;
    timeoutMs?: number;
    maxRetries?: number;
    retryBaseDelayMs?: number;
}
export declare class GeminiProvider implements AIProvider {
    readonly name = "gemini";
    readonly defaultModel = "gemini-1.5-flash";
    private apiKey;
    private baseUrl;
    private timeoutMs;
    private maxRetries;
    private retryBaseDelayMs?;
    private callCounter;
    constructor(options: GeminiProviderOptions);
    complete(options: CompletionOptions): Promise<CompletionResponse>;
    stream(options: CompletionOptions): CompletionStream;
    /**
     * Embed via batchEmbedContents (up to 100 texts per request).
     */
    embed(options: EmbeddingOptions): Promise<EmbeddingResponse>;
    private buildRequestBody;
    /**
     * Convert messages to Gemini `contents`.
     * Assistant tool calls -> model `functionCall` parts; tool results ->
     * user `functionResponse` parts (consecutive results share one turn).
     */
    private buildContents;
    private parseFunctionCalls;
    private mapFinishReason;
    private post;
    private postStream;
}
//# sourceMappingURL=gemini.d.ts.map