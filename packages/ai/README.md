# @axiljs/ai

AI platform — OpenAI, Anthropic, Gemini, Ollama, RAG pipeline, agents, and MCP.

Part of the [AxilJS](https://github.com/SyntaxilitY/AxilJS) ecosystem.

## Install

```bash
npm install @axiljs/ai
```

## Usage

```typescript
import { OpenAIProvider, OllamaProvider, RAGPipeline,
         VectorStore, Agent, loadFromText } from '@axiljs/ai'

// Cloud provider
const ai = new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY })

// Local provider — no API key needed
const ai = new OllamaProvider({ model: 'llama3.2' })

const res = await ai.complete({
  messages: [{ role: 'user', content: 'What is AxilJS?' }],
  system:   'You are a helpful assistant.'
})

const rag = new RAGPipeline({ provider: ai, vectorStore: new VectorStore() })
await rag.index(loadFromText(['AxilJS supports PostgreSQL...']))
const answer = await rag.query('What databases are supported?')

const agent = new Agent({ provider: ai, tools: [calculatorTool] })
const result = await agent.run('What is 25 * 4?')
```

Default models: OpenAI `gpt-4o-mini`, Anthropic `claude-haiku-4-5-20251001`,
Gemini `gemini-1.5-flash`, Ollama `llama3.2`. Pass `model` per call to override.

## RAG options

```typescript
const rag = new RAGPipeline({
  provider: new AnthropicProvider({ apiKey }),            // generates answers
  embeddingProvider: new OpenAIProvider({ apiKey: oaKey }), // embeds chunks + queries (default: provider)
  minScore: 0.3,                                          // raw cosine similarity, see below
  chunker: { chunkSize: 800, overlap: 150, minChunkSize: 50 },
  logger: false                                           // silence progress output
})
```

- `embeddingProvider` is required when `provider` has no embeddings API
  (`AnthropicProvider.embed()` always throws).
- Chunks shorter than `chunker.minChunkSize` are dropped, but a non-empty document
  shorter than that is still indexed as one chunk.
- `logger` (also on `Agent`): omit for the default coloured console output, pass
  `false` for silence, or `{ info(msg), warn(msg) }` to route messages elsewhere.

## Similarity scores

`VectorStore.search()` results (and `RAGQueryResult.sources[].score`) use the
metric's own scale, higher = more similar:

| metric | `score` |
|---|---|
| `cosine` (default) | raw cosine similarity, **-1..1** (1 = same direction, 0 = unrelated, -1 = opposite) |
| `dot` | raw dot product (equals cosine for unit-length vectors) |
| `euclidean` | `1 / (1 + distance)`, 0..1 |

`minScore` thresholds use the same scale. `VectorStore.search()` has no threshold by
default; `RAGPipeline` defaults to `minScore: 0.3`. (Up to 0.3.2 cosine scores were
rescaled to `(cos + 1) / 2`, so 0.5 meant "unrelated"; a stored threshold `t` from
that scale corresponds to `2t - 1` now.)

## Retries, cancellation and timeouts

All four providers retry 408/409/425/429/5xx (incl. Anthropic's 529) and transient
network errors with exponential backoff + jitter, honoring `retry-after` /
`retry-after-ms`. Streams are only retried before the first line is received.
Failed calls reject with `AIHttpError` (`.status`, `.body`).

```typescript
const ai = new OpenAIProvider({ apiKey, maxRetries: 2, retryBaseDelayMs: 500 }) // defaults shown; 0 disables

const controller = new AbortController()
const res = await ai.complete({
  messages,
  signal:    controller.signal, // abort() tears the HTTP request down (AbortError)
  timeoutMs: 15_000             // overall deadline across retries (TimeoutError)
})
// signal / timeoutMs work for stream() and embed() too.
// The provider-level `timeoutMs` option stays a per-attempt socket idle timeout.
```

## Tool calling

`tools` / `toolChoice` work with OpenAI, Anthropic, Gemini (`functionDeclarations`)
and Ollama (`tools` on `/api/chat`), so `Agent` runs on any of them. Results come
back as `response.toolCalls: ToolCall[]` with `finishReason: 'tool_use'`.

When streaming, tool calls arrive as chunks with `toolCallDelta` (first `{ id, name }`,
then `toolCallArgumentsDelta` JSON fragments for OpenAI/Anthropic; Gemini and Ollama
send one complete `{ id, name, arguments }`), plus `toolCallIndex`. The final
`done` chunk's `response.toolCalls` holds the assembled, parsed calls.

`Agent.runStream()` always ends with a `done: true` step; if `maxIterations` is
hit, its `finalResult` matches `run()`'s (`success: false`).

`calculatorTool` evaluates with a small arithmetic parser (no `eval`/`new Function`):
`+ - * / % ^ **`, parentheses, unary minus, decimals/exponents, and Math
functions/constants with or without `Math.` (`sqrt`, `pow`, `log`, `sin`, `max`, `PI`, `E`, ...).
It is also exported as `evaluateMathExpression(expr)`.

## Embeddings

- Ollama uses the batched `/api/embed` (`input: string[]`) and falls back to the
  legacy one-request-per-text `/api/embeddings` when the server returns 404
  (Ollama < 0.3.4). Note `/api/embed` returns L2-normalized vectors.
- Gemini uses `batchEmbedContents` (100 texts per request).

## VectorStore persistence

```typescript
const store = new VectorStore({ metric: 'cosine' })
await store.upsert(docs)                      // add() also replaces by id; O(1) id index
await store.save('./data/vectors.json')        // atomic write, creates directories
await new VectorStore().load('./data/vectors.json')
const copy = VectorStore.fromJSON(store.toJSON())   // keeps metric + maxDocuments
```

All metrics (`cosine`, `dot`, `euclidean`) throw on vector dimension mismatch.

## MCP

`MCPClient` POSTs to `serverUrl` exactly as given (path, trailing slash and query
string preserved) and resolves Streamable HTTP SSE responses as soon as the
matching JSON-RPC message arrives.

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
