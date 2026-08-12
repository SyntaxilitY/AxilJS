/**
 * AI middleware for REstJS applications.
 * Provides AI-powered HTTP endpoints out of the box.
 *
 * Usage:
 *   app.post('/chat', aiChat({ provider }))
 *   app.post('/chat/stream', aiChatStream({ provider }))
 *   app.post('/embed', aiEmbed({ provider }))
 */
import { RouteHandler } from '@restjs/common';
import { AIProvider } from '../types';
import { Tool } from '../agents/tool';
export interface AIChatOptions {
    provider: AIProvider;
    model?: string;
    system?: string;
    temperature?: number;
    maxTokens?: number;
}
/**
 * Create a chat completion route handler.
 * Accepts: POST body { messages: Message[], model?: string }
 * Returns:  { content, usage, model }
 */
export declare function aiChat(options: AIChatOptions): RouteHandler;
/**
 * Create a streaming chat completion route handler.
 * Uses Server-Sent Events to stream tokens to the client.
 * Accepts: POST body { messages: Message[] }
 * Streams:  SSE events with delta tokens
 */
export declare function aiChatStream(options: AIChatOptions): RouteHandler;
/**
 * Create an embedding route handler.
 * Accepts: POST body { input: string | string[], model?: string }
 * Returns:  { embeddings, model, usage }
 */
export declare function aiEmbed(options: {
    provider: AIProvider;
    model?: string;
}): RouteHandler;
/**
 * Create an agent route handler.
 * Accepts: POST body { task: string, context?: Message[] }
 * Returns:  { response, steps, usage }
 */
export declare function aiAgent(options: {
    provider: AIProvider;
    tools: Tool[];
    systemPrompt?: string;
    maxIterations?: number;
    model?: string;
    stream?: boolean;
}): RouteHandler;
//# sourceMappingURL=ai-middleware.d.ts.map