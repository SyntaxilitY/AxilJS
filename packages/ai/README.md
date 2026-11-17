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

## Governance: budgets, redaction and recorded tests

Three provider wrappers add policy to any `AIProvider`. Each one returns an
`AIProvider` again, so they compose and everything built on providers
(`Agent`, `RAGPipeline`, `aiChat`, `aiChatStream`) works unchanged.

```typescript
import { OpenAIProvider, withBudget, withRedaction, recordingProvider, replayProvider } from '@axiljs/ai'
import { getContext } from '@axiljs/runtime'

const base = process.env.CI
  ? replayProvider({ file: 'tests/fixtures/ai.json' })              // offline, deterministic
  : recordingProvider(new OpenAIProvider({ apiKey }), { file: 'tests/fixtures/ai.json' })

const ai = withBudget(
  withRedaction(base, { mode: 'tokenize', restore: true, onRedact: e => audit('ai.redact', e.counts) }),
  {
    limits: [
      { window: 'minute', requests: 30 },
      { window: 'month', costUsd: 25 }
    ],
    scope: () => getContext()?.tenantId,
    pricing: { 'gpt-4o-mini': { inputPerMTok: 0.15, outputPerMTok: 0.6 } },
    onExceeded: 'fallback-model',
    fallbackModel: 'gpt-4o-mini'
  }
)

app.post('/chat', aiChat({ provider: ai }))
```

Order matters: the outermost wrapper sees the original request. With the
order above, budgets are checked first, PII is removed next, and only the
redacted request is recorded, so fixtures never contain personal data.

### withBudget(provider, options)

- `limits`: one or more `{ window: 'minute' | 'hour' | 'day' | 'month', tokens?, costUsd?, requests? }`.
  Windows are UTC-aligned (calendar month for `'month'`).
- Every call is checked before the provider is invoked. Prompt tokens are
  estimated at about 4 characters per token; output tokens at `maxTokens`
  (or `defaultMaxTokens`, default 0). A call that would exceed a limit is
  rejected with `AIBudgetExceededError` (extends `axilError`, status 429,
  code `AI_BUDGET_EXCEEDED`, `details` with scope, window, metric, limit,
  used, requested and `retryAfterMs`).
- The estimate is reserved atomically, so concurrent calls cannot jointly
  overrun a limit. When the provider answers, the reservation is replaced by
  the usage it reported; a failed call releases it. Streams are settled from
  the final chunk; a stream abandoned by the consumer keeps the estimate.
- `scope`: budget key per call, typically a tenant id. Default: the
  `tenantId` of the active `@axiljs/runtime` request context when that
  package is installed, otherwise `'global'`. `@axiljs/runtime` is loaded
  with a lazy `require()` inside `try/catch`; `@axiljs/ai` does not depend on it.
- `pricing`: USD per million tokens, keyed by model. Lookup is exact, then the
  longest key that prefixes the model name, then `'*'`. Unpriced models cost 0.
- `onExceeded: 'fallback-model'` re-evaluates the call with `fallbackModel`
  and uses it if it fits. This helps with cost limits; token and request
  limits apply to the scope regardless of model.
- `store`: a `BudgetStore` (`add(scope, window, amounts)` returning the new
  totals, and `get(scope, window)`). The default `InMemoryBudgetStore` is per
  process. A row is identified by `(scope, window.name, window.start)`, so a
  SQL store is a single upsert with `RETURNING`.
- `ai.getUsage(scope?)` returns used, limit and remaining amounts per window.

### withRedaction(provider, options)

Scans every outgoing message (all roles), the system prompt, tool-call
arguments and embedding inputs.

| Detector | Matches |
|---|---|
| `email` | Addresses with a dotted domain and alphabetic TLD |
| `phone` | `+CC` numbers and grouped national formats such as `(415) 555-2671`; 8 to 15 digits, bare digit runs are ignored |
| `card` | 13 to 19 digits, optional spaces or dashes, network prefix 2 to 6, must pass Luhn |
| `iban` | Uppercase IBANs, must pass the mod-97 check |
| `ssn` | US SSNs in `123-45-6789` form, invalid ranges excluded |
| `apiKey` | Well-known key formats: OpenAI/Anthropic `sk-`, Stripe, AWS `AKIA`, GitHub, Slack, Google `AIza` |
| `jwt` | Three-part `eyJ...` tokens |
| `ipv4` | Dotted-quad addresses with valid octets |

- `detect` selects detectors (default: all); `custom` adds `RegExp`s, reported as `custom`.
- `mode: 'mask'` replaces matches with `[EMAIL]`, `[CARD]`, `[REDACTED]` (custom) and so on.
- `mode: 'tokenize'` replaces them with placeholders such as `‹EMAIL_1›`. The
  same value gets the same placeholder within a request and numbering follows
  the order of appearance, so identical requests stay identical (and replayable).
  With `restore: true`, placeholders in the response (text, tool-call
  arguments and streamed deltas, even when split across chunks) are mapped
  back, so users see their data while the model never does.
- `mode: 'block'` rejects the call with `AIPolicyViolationError` (status 422,
  code `AI_POLICY_VIOLATION`); the provider is not called.
- `onRedact(event)` receives `{ mode, findings: [{ type, location }], counts }`.
  Matched values are never included.
- `redactText(text, options)` applies the same detectors to any string.

Detection is pattern-based and conservative. It does not find names, postal
addresses or free-form identifiers; add `custom` patterns for
domain-specific data.

### recordingProvider / replayProvider

```typescript
// Record once against the real API
const ai = recordingProvider(new AnthropicProvider({ apiKey }), { file: 'tests/fixtures/agent.json' })

// Replay in tests: no network, no API key
const ai = replayProvider({ file: 'tests/fixtures/agent.json' })            // strict by default
const ai = replayProvider({ file, strict: false, fallback: realProvider })  // record misses as they happen
```

- Requests are keyed by a SHA-256 hash of the normalized request: kind
  (`complete`, `stream`, `embed`), model, system, messages, tools, toolChoice,
  temperature, maxTokens, stopSequences and topP. Object key order, `signal`
  and `timeoutMs` do not affect the key. Requests without an explicit `model`
  are keyed with `model: null`.
- Streams are recorded as their complete chunk list (only when the stream
  finishes) and replayed as an async iterable.
- A strict replay miss throws `AIReplayMissError` naming the request kind,
  hash, model, last user message and fixture file. Non-strict replay sends
  misses to `fallback` and records the result, or returns an empty `stop`
  response when there is no fallback.
- The fixture is plain JSON (`{ version: 1, entries }`), written atomically,
  and is meant to be committed. Recording the same request again overwrites it.

`aiChat`, `aiEmbed` and `aiAgent` answer governance errors with their own
status and code (429 with `Retry-After`, 422) instead of a generic 500.

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
