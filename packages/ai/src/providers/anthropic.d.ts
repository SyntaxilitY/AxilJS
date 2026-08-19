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
import { AIProvider, CompletionOptions, CompletionResponse, CompletionStream, EmbeddingOptions, EmbeddingResponse } from '../types';
export interface AnthropicProviderOptions {
    apiKey: string;
    baseUrl?: string;
    timeoutMs?: number;
}
export declare class AnthropicProvider implements AIProvider {
    readonly name = "anthropic";
    readonly defaultModel = "claude-3-5-haiku-20241022";
    private apiKey;
    private baseUrl;
    private timeoutMs;
    private readonly API_VERSION;
    constructor(options: AnthropicProviderOptions);
    complete(options: CompletionOptions): Promise<CompletionResponse>;
    stream(options: CompletionOptions): CompletionStream;
    embed(_options: EmbeddingOptions): Promise<EmbeddingResponse>;
    private buildRequestBody;
    private mapStopReason;
    private post;
    private postStream;
}
//# sourceMappingURL=anthropic.d.ts.map