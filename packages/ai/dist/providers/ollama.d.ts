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
import { AIProvider, CompletionOptions, CompletionResponse, CompletionStream, EmbeddingOptions, EmbeddingResponse } from '../types';
export interface OllamaProviderOptions {
    baseUrl?: string;
    model?: string;
    timeoutMs?: number;
}
export declare class OllamaProvider implements AIProvider {
    readonly name = "ollama";
    readonly defaultModel: string;
    private baseUrl;
    private timeoutMs;
    constructor(options?: OllamaProviderOptions);
    complete(options: CompletionOptions): Promise<CompletionResponse>;
    stream(options: CompletionOptions): CompletionStream;
    embed(options: EmbeddingOptions): Promise<EmbeddingResponse>;
    private formatMessages;
    private post;
    private postStream;
}
//# sourceMappingURL=ollama.d.ts.map