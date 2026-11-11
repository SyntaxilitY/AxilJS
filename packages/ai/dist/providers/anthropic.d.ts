/**
 * Anthropic Provider.
 * Works with any Messages API model (Claude Opus 5.5, Sonnet 5.5, Haiku 4.5, ...).
 * Pure Node.js https - no SDK required.
 *
 * Usage:
 *   const provider = new AnthropicProvider({
 *     apiKey: process.env.ANTHROPIC_API_KEY
 *   })
 *   const response = await provider.complete({
 *     messages: [{ role: 'user', content: 'Hello!' }],
 *     model: 'claude-sonnet-5-5'
 *   })
 */
import { AIProvider, CompletionOptions, CompletionResponse, CompletionStream, EmbeddingOptions, EmbeddingResponse } from '../types';
export interface AnthropicProviderOptions {
    apiKey: string;
    baseUrl?: string;
    timeoutMs?: number;
    maxRetries?: number;
    retryBaseDelayMs?: number;
}
export declare class AnthropicProvider implements AIProvider {
    readonly name = "anthropic";
    readonly defaultModel = "claude-haiku-4-5-20251001";
    private apiKey;
    private baseUrl;
    private timeoutMs;
    private maxRetries;
    private retryBaseDelayMs?;
    private readonly API_VERSION;
    constructor(options: AnthropicProviderOptions);
    complete(options: CompletionOptions): Promise<CompletionResponse>;
    stream(options: CompletionOptions): CompletionStream;
    embed(_options: EmbeddingOptions): Promise<EmbeddingResponse>;
    private buildRequestBody;
    private mapStopReason;
    private headers;
    private post;
    private postStream;
}
//# sourceMappingURL=anthropic.d.ts.map