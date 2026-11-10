/**
 * Core AI types used across all providers, agents, and tools.
 * These are the foundation of the entire AI platform.
 * Provider-specific types extend these base types.
 */
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';
export interface Message {
    role: MessageRole;
    content: string;
    toolCallId?: string;
    toolCalls?: ToolCall[];
    name?: string;
}
export interface ToolCall {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
}
export interface ToolDefinition {
    name: string;
    description: string;
    parameters: {
        type: 'object';
        properties: Record<string, {
            type: string;
            description?: string;
            enum?: string[];
            items?: {
                type: string;
            };
        }>;
        required?: string[];
    };
}
export interface CompletionOptions {
    messages: Message[];
    model?: string;
    temperature?: number;
    maxTokens?: number;
    stopSequences?: string[];
    tools?: ToolDefinition[];
    toolChoice?: 'auto' | 'none' | {
        name: string;
    };
    system?: string;
    topP?: number;
    signal?: AbortSignal;
    timeoutMs?: number;
}
export interface CompletionResponse {
    content: string;
    toolCalls?: ToolCall[];
    finishReason: 'stop' | 'tool_use' | 'length' | 'error';
    usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    model: string;
}
export interface StreamChunk {
    delta: string;
    done: boolean;
    toolCallDelta?: Partial<ToolCall>;
    toolCallIndex?: number;
    toolCallArgumentsDelta?: string;
    response?: CompletionResponse;
}
export type CompletionStream = AsyncGenerator<StreamChunk, void, unknown>;
export interface EmbeddingOptions {
    input: string | string[];
    model?: string;
    signal?: AbortSignal;
    timeoutMs?: number;
}
export interface EmbeddingResponse {
    embeddings: number[][];
    model: string;
    usage: {
        totalTokens: number;
    };
}
/**
 * All AI providers implement this interface.
 * Swap providers without changing your application code.
 */
export interface AIProvider {
    readonly name: string;
    readonly defaultModel: string;
    complete(options: CompletionOptions): Promise<CompletionResponse>;
    stream(options: CompletionOptions): CompletionStream;
    embed(options: EmbeddingOptions): Promise<EmbeddingResponse>;
}
//# sourceMappingURL=types.d.ts.map