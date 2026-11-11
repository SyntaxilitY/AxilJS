/**
 * Core AI types used across all providers, agents, and tools.
 * These are the foundation of the entire AI platform.
 * Provider-specific types extend these base types.
 */

// ─── Message Types ────────────────────────────────────────────────────────────

// Who sent a message in a conversation
export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

// A single message in a conversation
export interface Message {
  role: MessageRole;
  content: string;

  // For tool result messages - which tool call this is the result of
  toolCallId?: string;

  // For assistant messages that include tool calls
  toolCalls?: ToolCall[];

  // Optional name (for multi-agent scenarios)
  name?: string;
}

// ─── Tool Calling ─────────────────────────────────────────────────────────────

// A tool call requested by the model
export interface ToolCall {
  // Unique ID for this specific tool call
  id: string;

  // Name of the tool to call
  name: string;

  // Arguments to pass to the tool (already parsed from JSON)
  arguments: Record<string, unknown>;
}

// Definition of a tool the model can use
export interface ToolDefinition {
  // Tool name (must match what agent registers)
  name: string;

  // Human-readable description (the model reads this to decide when to use it)
  description: string;

  // JSON Schema defining the parameters the tool accepts
  parameters: {
    type: 'object';
    properties: Record<string, {
      type: string;
      description?: string;
      enum?: string[];
      items?: { type: string };
    }>;
    required?: string[];
  };
}

// ─── Completion Options ───────────────────────────────────────────────────────

export interface CompletionOptions {
  // Messages in the conversation
  messages: Message[];

  // Model to use (provider-specific, e.g. 'gpt-4o', 'claude-sonnet-5-5')
  model?: string;

  // Temperature: 0 = deterministic, 1 = creative (default: 0.7)
  temperature?: number;

  // Max tokens to generate (default: provider-specific)
  maxTokens?: number;

  // Stop sequences - model stops generating at these strings
  stopSequences?: string[];

  // Tools the model can call
  tools?: ToolDefinition[];

  // Tool choice: 'auto', 'none', or force a specific tool
  toolChoice?: 'auto' | 'none' | { name: string };

  // System prompt (alternative to putting it in messages)
  system?: string;

  // Top-p nucleus sampling (default: 1)
  topP?: number;

  // Cancel the request (and any pending retries). Aborting tears the
  // underlying HTTP request down and rejects with an AbortError.
  signal?: AbortSignal;

  // Overall deadline for this call in ms, across all retries
  // (rejects with a TimeoutError). Independent of the provider's
  // per-attempt socket timeout.
  timeoutMs?: number;
}

// ─── Completion Response ─────────────────────────────────────────────────────

export interface CompletionResponse {
  // The generated text content
  content: string;

  // Tool calls requested by the model (if any)
  toolCalls?: ToolCall[];

  // Why the model stopped generating
  // 'stop' = natural end, 'tool_use' = wants to use a tool, 'length' = hit maxTokens
  finishReason: 'stop' | 'tool_use' | 'length' | 'error';

  // Token usage statistics
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };

  // Which model was actually used
  model: string;
}

// ─── Streaming ────────────────────────────────────────────────────────────────

// A chunk of a streaming response
export interface StreamChunk {
  // Text delta (new characters generated)
  delta: string;

  // True when this is the last chunk
  done: boolean;

  // Tool call being built (for streaming tool calls).
  // The first delta for a call carries { id, name }; later deltas carry { id }
  // plus `toolCallArgumentsDelta`. Providers that deliver complete calls
  // (Gemini, Ollama) emit one delta with { id, name, arguments }.
  // The assembled calls are in `response.toolCalls` on the final chunk.
  toolCallDelta?: Partial<ToolCall>;

  // Position of the tool call `toolCallDelta` refers to (0-based)
  toolCallIndex?: number;

  // Raw JSON fragment of the tool call's arguments (OpenAI / Anthropic)
  toolCallArgumentsDelta?: string;

  // Final response metadata (only on last chunk)
  response?: CompletionResponse;
}

// Async generator that yields stream chunks
export type CompletionStream = AsyncGenerator<StreamChunk, void, unknown>;

// ─── Embedding ────────────────────────────────────────────────────────────────

export interface EmbeddingOptions {
  // Text to embed
  input: string | string[];

  // Embedding model (provider-specific)
  model?: string;

  // Cancel the request (see CompletionOptions.signal)
  signal?: AbortSignal;

  // Overall deadline in ms across all retries / batches
  timeoutMs?: number;
}

export interface EmbeddingResponse {
  // Vector embeddings (one per input string)
  embeddings: number[][];

  // Model used
  model: string;

  // Token usage
  usage: { totalTokens: number };
}

// ─── Provider Interface ───────────────────────────────────────────────────────

/**
 * All AI providers implement this interface.
 * Swap providers without changing your application code.
 */
export interface AIProvider {
  // Provider name for logging/debugging
  readonly name: string;

  // Default model for this provider
  readonly defaultModel: string;

  // Generate a completion (non-streaming)
  complete(options: CompletionOptions): Promise<CompletionResponse>;

  // Generate a streaming completion
  stream(options: CompletionOptions): CompletionStream;

  // Generate embeddings for text
  embed(options: EmbeddingOptions): Promise<EmbeddingResponse>;
}