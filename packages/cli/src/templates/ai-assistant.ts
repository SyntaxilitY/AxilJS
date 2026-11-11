/**
 * Template: ai-assistant
 *
 * An AI assistant backend on @axiljs/ai: SDK-free providers picked by env
 * (Anthropic, OpenAI, Gemini, Ollama), chat with per-session history, SSE
 * token streaming, RAG over ingested text with sources, and a tool-using
 * agent. Tests run against a deterministic fake provider, never the network.
 */

import type { ProjectTemplate, TemplateContext } from './types'

export const aiAssistantTemplate: ProjectTemplate = {
  id:       'ai-assistant',
  title:    'AI Assistant',
  summary:  'LLM chat, SSE streaming, RAG with sources and an agent',
  category: 'AI',
  highlights: [
    'Anthropic, OpenAI, Gemini or Ollama, picked by env',
    'Chat with session history and SSE token streaming',
    'RAG: ingest text, answers cite the chunks used',
    'Tool-using agent: calculator and document search',
    'Tests use a fake provider: no keys, no network'
  ],
  packages: ['@axiljs/ai', '@axiljs/core', '@axiljs/config', '@axiljs/validation', '@axiljs/security', '@axiljs/testing'],
  port:     3004,

  dependencies: ctx => ({
    '@axiljs/ai':         ctx.axilRange,
    '@axiljs/config':     ctx.axilRange,
    '@axiljs/core':       ctx.axilRange,
    '@axiljs/security':   ctx.axilRange,
    '@axiljs/validation': ctx.axilRange
  }),

  files: (ctx: TemplateContext) => ({
    'README.md': `# ${ctx.name}

An AI assistant backend on [AxilJS](https://github.com/SyntaxilitY/AxilJS), created with
\`axil create ${ctx.name} --template ai-assistant\`.

It shows how to put an LLM behind a small, safe HTTP API without any provider SDK:

- **@axiljs/ai providers**: Anthropic, OpenAI, Gemini or Ollama behind one \`AIProvider\` interface, chosen with \`AI_PROVIDER\`
- **Chat**: \`POST /chat\` returns the reply, token usage and the documents it used; history is kept per \`sessionId\` (in memory, capped)
- **Streaming**: \`POST /chat/stream\` sends tokens as Server-Sent Events (\`createSSE\` from @axiljs/core)
- **RAG**: \`POST /documents\` chunks, embeds and stores text with \`RAGPipeline\` + \`VectorStore\`; chat answers are grounded in the best-matching chunks and return them as \`sources\`
- **Agent**: \`POST /agent\` runs an \`Agent\` with \`createTool\` tools (calculator, document search, current time)
- **Guard rails**: request validation (@axiljs/validation), per-IP rate limiting on the AI routes (@axiljs/security), provider errors mapped to 502
- **Tests**: a deterministic fake provider is injected into \`createApp()\`, so tests need no API key and never touch the network

## Choose a provider

Copy \`.env.example\` to \`.env\` and set \`AI_PROVIDER\` plus that provider's key. The app refuses to start
(with a message naming the missing variable) when the key is not set.

| \`AI_PROVIDER\` | Key variable          | Default model (\`AI_MODEL\` overrides) | Embeddings for RAG (\`EMBEDDING_PROVIDER=auto\`) |
|---------------|-----------------------|--------------------------------------|-----------------------------------------------|
| \`anthropic\`   | \`ANTHROPIC_API_KEY\`   | \`claude-sonnet-5-5\`                  | local (Anthropic has no embeddings API)        |
| \`openai\`      | \`OPENAI_API_KEY\`      | the @axiljs/ai default (\`gpt-4o-mini\`) | OpenAI                                        |
| \`gemini\`      | \`GEMINI_API_KEY\`      | the @axiljs/ai default               | Gemini                                         |
| \`ollama\`      | none                  | \`llama3.2\`                           | Ollama (\`nomic-embed-text\`)                    |

Other Claude models: \`AI_MODEL=claude-opus-5-5\` (most capable) or \`AI_MODEL=claude-haiku-4-5-20251001\` (fastest).

\`\`\`bash
# Anthropic (default)
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=<your key>          # https://console.anthropic.com/settings/keys

# OpenAI
AI_PROVIDER=openai
OPENAI_API_KEY=<your key>             # https://platform.openai.com/api-keys

# Google Gemini
AI_PROVIDER=gemini
GEMINI_API_KEY=<your key>             # https://aistudio.google.com/apikey

# Ollama (local, no key)
AI_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
# ollama pull llama3.2 && ollama pull nomic-embed-text
\`\`\`

**Embeddings.** RAG needs an embeddings model. With \`EMBEDDING_PROVIDER=auto\` the chat provider is used when it
has one; with Anthropic a built-in local embedder is used instead (\`src/ai/local-embeddings.ts\`: word hashing,
offline, matches shared words rather than meaning). For semantic search with Claude, set
\`EMBEDDING_PROVIDER=openai\` (needs \`OPENAI_API_KEY\`), \`gemini\` or \`ollama\`.

## Run

\`\`\`bash
npm install
cp .env.example .env        # PowerShell: Copy-Item .env.example .env
# edit .env: AI_PROVIDER and its API key
npm run dev                 # watch mode, http://localhost:3004
\`\`\`

Production build:

\`\`\`bash
npm run build
npm start
\`\`\`

## Test

\`\`\`bash
npm test                    # axil test: compiles with tsc, runs src/**/*.test.ts
\`\`\`

No API key needed: the tests pass a \`FakeProvider\` (\`src/testing/fake-provider.ts\`) to \`createApp()\`.

## Endpoints

| Method | Path              | Description                                              | Success | Errors             |
|--------|-------------------|----------------------------------------------------------|---------|--------------------|
| GET    | \`/\`               | Service info, provider, model and endpoints              | 200     |                    |
| GET    | \`/health\`         | Liveness: status, uptime, timestamp                      | 200     |                    |
| POST   | \`/chat\`           | Reply as JSON, with \`sessionId\`, \`sources\`, \`usage\`      | 200     | 422, 429, 502      |
| POST   | \`/chat/stream\`    | Same, streamed as SSE: \`start\`, \`delta\`..., \`done\`       | 200     | 422, 429           |
| GET    | \`/sessions/:id\`   | Conversation history of a session                        | 200     | 404, 422           |
| DELETE | \`/sessions/:id\`   | Forget a session                                         | 200     | 404, 422           |
| POST   | \`/documents\`      | Ingest text for RAG (chunk, embed, store)                | 201     | 422, 429, 502      |
| GET    | \`/documents\`      | Ingested documents and chunk counts                      | 200     |                    |
| DELETE | \`/documents/:id\`  | Remove a document and its chunks                         | 200     | 404, 422           |
| POST   | \`/agent\`          | Run the tool-using agent on a task                       | 200     | 422, 429, 502      |

Rate limited per client IP (\`RATE_LIMIT_MAX\` requests per \`RATE_LIMIT_WINDOW_MS\`, shared by the
POST routes above): \`429 RATE_LIMIT_EXCEEDED\` with a \`Retry-After\` header.

\`POST /chat\` and \`POST /chat/stream\` body:

| Field          | Type    | Rules                                                           |
|----------------|---------|-----------------------------------------------------------------|
| \`message\`      | string  | required, trimmed, 1-8000 characters                            |
| \`sessionId\`    | string  | optional, \`[A-Za-z0-9_-]\`, 1-64; omitted = new session (returned) |
| \`useDocuments\` | boolean | default \`true\`: ground the answer in ingested documents         |
| \`temperature\`  | number  | optional, 0-1                                                   |

\`POST /documents\` body: \`content\` (required, 50-200000 characters), \`title\` (optional, 1-200),
\`id\` (optional, \`[A-Za-z0-9_.-]\`, 1-64; ingesting an existing id replaces it).
\`POST /agent\` body: \`task\` (required, 1-4000 characters).

A chat reply:

\`\`\`json
{
  "status": 200, "code": "HTTP_200_OK", "message": "Chat reply",
  "data": {
    "sessionId": "1f0c...",
    "reply": "Refunds are accepted within 30 days [1].",
    "sources": [ { "documentId": "refunds", "title": "Refund policy", "score": 0.41, "excerpt": "Refunds are accepted..." } ],
    "model": "claude-sonnet-5-5",
    "finishReason": "stop",
    "usage": { "promptTokens": 412, "completionTokens": 18, "totalTokens": 430, "embeddingTokens": 6 }
  }
}
\`\`\`

The stream sends \`event: start\` (\`sessionId\`, \`sources\`), one \`event: delta\` per token batch (\`{ "text": "..." }\`)
and \`event: done\` (\`reply\`, \`usage\`, \`model\`), or \`event: error\` if the provider fails mid-stream.

Errors share one shape: \`{ "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }\`.
A failing provider call (bad key, provider outage) is \`502 AI_PROVIDER_ERROR\`.

### curl

\`\`\`bash
curl http://localhost:3004/

# Ingest a document, then ask about it
curl -X POST http://localhost:3004/documents -H "Content-Type: application/json" \\
  -d '{"id":"refunds","title":"Refund policy","content":"Refunds are accepted within 30 days of purchase. Items must be unused and in their original packaging."}'
curl -X POST http://localhost:3004/chat -H "Content-Type: application/json" \\
  -d '{"message":"How long do I have to return something?","sessionId":"demo"}'

# Follow-up in the same session (history is kept)
curl -X POST http://localhost:3004/chat -H "Content-Type: application/json" \\
  -d '{"message":"And what condition must the item be in?","sessionId":"demo"}'

# Stream tokens as they arrive (-N disables curl's buffering)
curl -N -X POST http://localhost:3004/chat/stream -H "Content-Type: application/json" \\
  -d '{"message":"Write a haiku about backends"}'

# Agent with tools
curl -X POST http://localhost:3004/agent -H "Content-Type: application/json" \\
  -d '{"task":"What is (17 * 23) / 4? Then check the refund policy for the return window."}'

curl http://localhost:3004/sessions/demo
curl -X POST http://localhost:3004/chat -H "Content-Type: application/json" -d '{"message":""}'    # 422
\`\`\`

### PowerShell

\`curl\` is an alias for \`Invoke-WebRequest\` in Windows PowerShell, so use \`curl.exe\` or \`Invoke-RestMethod\`:

\`\`\`powershell
Invoke-RestMethod http://localhost:3004/chat -Method Post -ContentType 'application/json' \`
  -Body (@{ message = 'Hello!'; sessionId = 'demo' } | ConvertTo-Json)
curl.exe -N -X POST http://localhost:3004/chat/stream -H "Content-Type: application/json" -d '{\\"message\\":\\"Hello\\"}'
\`\`\`

## Configuration

| Variable               | Default                  | Description                                                   |
|------------------------|--------------------------|---------------------------------------------------------------|
| \`PORT\`                 | \`3004\`                   | HTTP port                                                     |
| \`HOST\`                 | \`127.0.0.1\`              | Bind address (\`0.0.0.0\` in containers)                        |
| \`NODE_ENV\`             | \`development\`            | \`development\`, \`production\` or \`test\`                         |
| \`CORS_ORIGIN\`          | \`*\`                      | \`*\` or a comma-separated list of origins                      |
| \`TRUST_PROXY\`          | \`0\`                      | Proxy hops in front of the app (for the client IP in rate limits) |
| \`AI_PROVIDER\`          | \`anthropic\`              | \`anthropic\`, \`openai\`, \`gemini\` or \`ollama\`                   |
| \`AI_MODEL\`             | per provider (see above) | Chat model                                                    |
| \`AI_MAX_TOKENS\`        | \`1024\`                   | Max tokens per reply                                          |
| \`AI_TIMEOUT_MS\`        | \`60000\`                  | Provider socket idle timeout                                  |
| \`SYSTEM_PROMPT\`        | a short assistant prompt | System prompt for \`/chat\`                                     |
| \`ANTHROPIC_API_KEY\`    |                          | Required when \`AI_PROVIDER=anthropic\`                         |
| \`OPENAI_API_KEY\`       |                          | Required for \`openai\` (chat or embeddings)                    |
| \`GEMINI_API_KEY\`       |                          | Required for \`gemini\` (chat or embeddings)                    |
| \`OLLAMA_BASE_URL\`      | \`http://localhost:11434\` | Ollama server                                                 |
| \`EMBEDDING_PROVIDER\`   | \`auto\`                   | \`auto\`, \`local\`, \`openai\`, \`gemini\` or \`ollama\`               |
| \`EMBEDDING_MODEL\`      | provider default         | Embeddings model                                              |
| \`RAG_TOP_K\`            | \`4\`                      | Chunks retrieved per question                                 |
| \`RAG_MIN_SCORE\`        | \`0.1\` local, \`0.3\` other | Minimum cosine similarity for a chunk to be used              |
| \`RAG_MAX_CHUNKS\`       | \`5000\`                   | Chunks kept in memory (oldest dropped first)                  |
| \`HISTORY_MAX_MESSAGES\` | \`20\`                     | Messages kept per session (oldest dropped first)              |
| \`MAX_SESSIONS\`         | \`1000\`                   | Sessions kept in memory (least recently used dropped first)   |
| \`AGENT_MAX_ITERATIONS\` | \`5\`                      | Max model/tool round trips per \`/agent\` task                  |
| \`RATE_LIMIT_MAX\`       | \`20\`                     | AI requests per client IP per window                          |
| \`RATE_LIMIT_WINDOW_MS\` | \`60000\`                  | Rate limit window                                             |

## Project structure

\`\`\`
src/
  main.ts                      entry point: loadEnv, createApp (clear error on a missing key), listen
  app.ts                       createApp(config, { provider? }): routes, validation, rate limit, SSE
  config.ts                    typed config (defineConfig)
  ai/providers.ts              AI_PROVIDER / EMBEDDING_PROVIDER -> AIProvider, MissingApiKeyError
  ai/local-embeddings.ts       offline word-hashing embeddings (Anthropic fallback, tests)
  ai/knowledge.ts              RAGPipeline + VectorStore: ingest, search, grounding prompt
  ai/sessions.ts               capped in-memory conversation history
  ai/tools.ts                  agent tools (createTool): calculate, search_documents, current time
  middleware/error-handler.ts  thrown errors -> { error: { code, message, details } }
  testing/fake-provider.ts     deterministic AIProvider for tests
  app.test.ts                  route tests: chat, history, streaming, RAG, agent, validation, limits
  ai/ai.test.ts                provider selection, missing keys, embeddings, sessions
\`\`\`

## Next steps

- Persist documents with \`VectorStore.save(path)\` / \`load(path)\`, or move history to a database (\`axil create --template rest-api\` shows @axiljs/orm)
- Add your own agent tools in \`src/ai/tools.ts\`; each is a JSON-schema description plus an async handler
- Put authentication in front of the AI routes before exposing them (see \`@axiljs/auth\`)
- Behind a load balancer, the in-memory rate limit and sessions are per process: use a shared store
`,

    '.env.example': `# Server
PORT=3004
HOST=127.0.0.1
NODE_ENV=development
CORS_ORIGIN=*
# Proxy hops in front of the app (0 = use the socket address for rate limiting)
TRUST_PROXY=0

# Provider: anthropic | openai | gemini | ollama
AI_PROVIDER=anthropic
# Empty = provider default (Anthropic: claude-sonnet-5-5).
# Other Claude models: claude-opus-5-5, claude-haiku-4-5-20251001
AI_MODEL=
AI_MAX_TOKENS=1024
AI_TIMEOUT_MS=60000

# API keys: only the one for your provider is needed (ollama needs none)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434

# RAG embeddings: auto | local | openai | gemini | ollama
# auto = the chat provider's embeddings, or the offline local embedder for anthropic
EMBEDDING_PROVIDER=auto
EMBEDDING_MODEL=
RAG_TOP_K=4

# Memory and limits
HISTORY_MAX_MESSAGES=20
MAX_SESSIONS=1000
AGENT_MAX_ITERATIONS=5
RATE_LIMIT_MAX=20
RATE_LIMIT_WINDOW_MS=60000
`,

    'src/config.ts': `/**
 * Typed configuration, read from environment variables.
 * loadEnv() in src/main.ts fills process.env from .env first.
 */

import { defineConfig } from '@axiljs/config'

export const PROVIDERS = ['anthropic', 'openai', 'gemini', 'ollama'] as const
export type ProviderName = typeof PROVIDERS[number]

export const EMBEDDING_PROVIDERS = ['auto', 'local', 'openai', 'gemini', 'ollama'] as const
export type EmbeddingProviderName = typeof EMBEDDING_PROVIDERS[number]

export function loadConfig(source: Record<string, string | undefined> = process.env) {
  const config = defineConfig({
    PORT:        { type: 'number', default: 3004, min: 0, max: 65535 },
    HOST:        { type: 'string', default: '127.0.0.1' },
    NODE_ENV:    { type: 'string', default: 'development', enum: ['development', 'production', 'test'] },
    // "*" or a comma-separated list of allowed origins
    CORS_ORIGIN: { type: 'string', default: '*' },
    // Proxy hops in front of the app; 0 = trust nobody, use the socket address
    TRUST_PROXY: { type: 'number', default: 0, min: 0, max: 10 },

    // ─── Model ───────────────────────────────────────────────────────────────
    AI_PROVIDER:   { type: 'string', default: 'anthropic', enum: [...PROVIDERS] },
    AI_MODEL:      { type: 'string' },
    AI_MAX_TOKENS: { type: 'number', default: 1024, min: 1, max: 64000 },
    AI_TIMEOUT_MS: { type: 'number', default: 60000, min: 1000 },
    SYSTEM_PROMPT: { type: 'string', default: 'You are a helpful, concise assistant.' },

    // ─── Credentials (only the selected provider's key is required) ─────────
    ANTHROPIC_API_KEY: { type: 'string' },
    OPENAI_API_KEY:    { type: 'string' },
    GEMINI_API_KEY:    { type: 'string' },
    OLLAMA_BASE_URL:   { type: 'string', default: 'http://localhost:11434' },

    // ─── RAG ─────────────────────────────────────────────────────────────────
    EMBEDDING_PROVIDER: { type: 'string', default: 'auto', enum: [...EMBEDDING_PROVIDERS] },
    EMBEDDING_MODEL:    { type: 'string' },
    RAG_TOP_K:          { type: 'number', default: 4, min: 1, max: 20 },
    // Empty = 0.1 for the local embedder, 0.3 for provider embeddings
    RAG_MIN_SCORE:      { type: 'number', min: 0, max: 1 },
    RAG_MAX_CHUNKS:     { type: 'number', default: 5000, min: 1 },

    // ─── Memory and limits ───────────────────────────────────────────────────
    HISTORY_MAX_MESSAGES: { type: 'number', default: 20, min: 2, max: 200 },
    MAX_SESSIONS:         { type: 'number', default: 1000, min: 1 },
    AGENT_MAX_ITERATIONS: { type: 'number', default: 5, min: 1, max: 20 },
    RATE_LIMIT_MAX:       { type: 'number', default: 20, min: 1 },
    RATE_LIMIT_WINDOW_MS: { type: 'number', default: 60000, min: 1000 }
  }, source)

  return {
    ...config,
    // defineConfig already rejected anything outside the enums
    AI_PROVIDER:        config.AI_PROVIDER as ProviderName,
    EMBEDDING_PROVIDER: config.EMBEDDING_PROVIDER as EmbeddingProviderName
  }
}

export type Config = ReturnType<typeof loadConfig>
`,

    'src/ai/providers.ts': `/**
 * Provider setup.
 *
 * AI_PROVIDER picks the chat model, EMBEDDING_PROVIDER the embeddings used
 * for RAG. Every @axiljs/ai provider is SDK-free (plain node:https) and
 * implements the same AIProvider interface, so the rest of the app never
 * knows which one it is talking to, and tests can pass in a fake.
 */

import { AnthropicProvider, GeminiProvider, OllamaProvider, OpenAIProvider } from '@axiljs/ai'
import type { AIProvider } from '@axiljs/ai'
import type { Config } from '../config.js'
import { LocalEmbeddings } from './local-embeddings.js'

/** Default when AI_MODEL is empty (the other providers use their package default). */
export const ANTHROPIC_DEFAULT_MODEL = 'claude-sonnet-5-5'

const KEYS = {
  anthropic: { env: 'ANTHROPIC_API_KEY', url: 'https://console.anthropic.com/settings/keys' },
  openai:    { env: 'OPENAI_API_KEY',    url: 'https://platform.openai.com/api-keys' },
  gemini:    { env: 'GEMINI_API_KEY',    url: 'https://aistudio.google.com/apikey' }
} as const

type KeyedProvider = keyof typeof KEYS

/** Thrown at startup when the selected provider has no API key. */
export class MissingApiKeyError extends Error {
  constructor(readonly envVar: string, setting: string, url: string) {
    super(
      \`\${setting} needs \${envVar}, but it is not set.\\n\` +
      \`  Add it to .env:   \${envVar}=<your key>   (create one at \${url})\\n\` +
      '  Or choose another provider: AI_PROVIDER=anthropic | openai | gemini | ollama (ollama needs no key)'
    )
    this.name = 'MissingApiKeyError'
  }
}

export interface ChatSetup {
  provider: AIProvider
  model:    string
}

/** The chat provider and model selected by AI_PROVIDER / AI_MODEL. */
export function createChatProvider(config: Config): ChatSetup {
  const timeoutMs = config.AI_TIMEOUT_MS

  switch (config.AI_PROVIDER) {
    case 'anthropic': {
      const apiKey = requireKey(config, 'anthropic', 'AI_PROVIDER=anthropic')
      return { provider: new AnthropicProvider({ apiKey, timeoutMs }), model: config.AI_MODEL ?? ANTHROPIC_DEFAULT_MODEL }
    }
    case 'openai': {
      const provider = new OpenAIProvider({ apiKey: requireKey(config, 'openai', 'AI_PROVIDER=openai'), timeoutMs })
      return { provider, model: config.AI_MODEL ?? provider.defaultModel }
    }
    case 'gemini': {
      const provider = new GeminiProvider({ apiKey: requireKey(config, 'gemini', 'AI_PROVIDER=gemini'), timeoutMs })
      return { provider, model: config.AI_MODEL ?? provider.defaultModel }
    }
    case 'ollama': {
      const provider = new OllamaProvider({ baseUrl: config.OLLAMA_BASE_URL, model: config.AI_MODEL, timeoutMs })
      return { provider, model: provider.defaultModel }
    }
  }
}

/**
 * The embeddings provider for RAG. "auto" reuses the chat provider when it
 * has embeddings; Anthropic has none, so it falls back to LocalEmbeddings.
 */
export function createEmbeddingProvider(config: Config, chat: AIProvider): AIProvider {
  const choice = config.EMBEDDING_PROVIDER === 'auto'
    ? (config.AI_PROVIDER === 'anthropic' ? 'local' : config.AI_PROVIDER)
    : config.EMBEDDING_PROVIDER

  if (chat.name === choice) return chat

  const timeoutMs = config.AI_TIMEOUT_MS
  switch (choice) {
    case 'local':  return new LocalEmbeddings()
    case 'openai': return new OpenAIProvider({ apiKey: requireKey(config, 'openai', 'EMBEDDING_PROVIDER=openai'), timeoutMs })
    case 'gemini': return new GeminiProvider({ apiKey: requireKey(config, 'gemini', 'EMBEDDING_PROVIDER=gemini'), timeoutMs })
    case 'ollama': return new OllamaProvider({ baseUrl: config.OLLAMA_BASE_URL, timeoutMs })
  }
}

/**
 * One provider that chats with \`chat\` and embeds with \`embeddings\`:
 * RAGPipeline takes a single provider for both.
 */
export function withEmbeddings(chat: AIProvider, embeddings: AIProvider, model: string): AIProvider {
  if (chat === embeddings) return chat
  return {
    name:         chat.name,
    defaultModel: model,
    complete:     options => chat.complete(options),
    stream:       options => chat.stream(options),
    embed:        options => embeddings.embed(options)
  }
}

/** Word-hashing scores run lower than semantic embeddings, so use a lower threshold. */
export function defaultMinScore(embeddings: AIProvider): number {
  return embeddings instanceof LocalEmbeddings ? 0.1 : 0.3
}

function requireKey(config: Config, provider: KeyedProvider, setting: string): string {
  const { env, url } = KEYS[provider]
  const key = config[env]
  if (!key) throw new MissingApiKeyError(env, setting, url)
  return key
}
`,

    'src/ai/local-embeddings.ts': `/**
 * Local embeddings: an offline, dependency-free fallback for RAG.
 *
 * Anthropic has no embeddings API, so with AI_PROVIDER=anthropic (and
 * EMBEDDING_PROVIDER=auto) text is embedded here: each word is hashed into
 * one of 512 buckets (the "hashing trick") and the vector is normalised.
 * Similar texts share words, so cosine similarity still finds them, but it
 * matches words, not meaning. Use EMBEDDING_PROVIDER=openai | gemini | ollama
 * for semantic search. The tests use it because it never touches the network.
 */

import type { AIProvider, CompletionResponse, CompletionStream, EmbeddingOptions, EmbeddingResponse } from '@axiljs/ai'

const DIMENSIONS = 512

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'can', 'do', 'does', 'for', 'from', 'has', 'have',
  'how', 'i', 'if', 'in', 'is', 'it', 'its', 'me', 'my', 'of', 'on', 'or', 'our', 'so', 'that', 'the', 'their',
  'there', 'this', 'to', 'was', 'we', 'what', 'when', 'where', 'which', 'who', 'why', 'will', 'with', 'you', 'your'
])

export class LocalEmbeddings implements AIProvider {
  readonly name = 'local'
  readonly defaultModel = \`local-hashing-\${DIMENSIONS}\`

  async complete(): Promise<CompletionResponse> {
    throw new Error('LocalEmbeddings only embeds text; use a chat provider for completions')
  }

  async *stream(): CompletionStream {
    throw new Error('LocalEmbeddings only embeds text; use a chat provider for completions')
  }

  async embed(options: EmbeddingOptions): Promise<EmbeddingResponse> {
    const inputs = Array.isArray(options.input) ? options.input : [options.input]
    let totalTokens = 0

    const embeddings = inputs.map(text => {
      const words = tokenize(text)
      totalTokens += words.length
      return toVector(words)
    })

    return { embeddings, model: this.defaultModel, usage: { totalTokens } }
  }
}

/** Lower-cased words (any script) without stop words; a plural "s" is dropped. */
export function tokenize(text: string): string[] {
  const words = text.toLowerCase().match(/[\\p{L}\\p{N}]+/gu) ?? []
  return words
    .filter(word => word.length > 1 && !STOP_WORDS.has(word))
    .map(word => (word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word))
}

function toVector(words: string[]): number[] {
  const vector = new Array<number>(DIMENSIONS).fill(0)
  for (const word of words) vector[hash(word) % DIMENSIONS] += 1

  const norm = Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0))
  return norm === 0 ? vector : vector.map(x => x / norm)
}

/** 32-bit FNV-1a. */
function hash(word: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < word.length; i++) {
    h ^= word.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}
`,

    'src/ai/knowledge.ts': `/**
 * Knowledge base for RAG.
 *
 * Ingest: RAGPipeline.index() chunks a document (800 characters, 150 overlap),
 * embeds the chunks and stores them in an in-memory VectorStore.
 * Search: the question is embedded with the same model and the closest chunks
 * come back as sources, which /chat puts in the system prompt and returns.
 */

import { RAGPipeline, VectorStore } from '@axiljs/ai'
import type { AIProvider } from '@axiljs/ai'

export interface KnowledgeOptions {
  /** Provider whose embed() is used (RAGPipeline needs complete() too). */
  provider:        AIProvider
  embeddingModel?: string
  topK:            number
  minScore:        number
  maxChunks:       number
}

export interface Source {
  chunkId:    string
  documentId: string
  title:      string
  score:      number
  content:    string
}

export interface DocumentInfo {
  id:     string
  title:  string
  chunks: number
}

// Thresholds and reported scores here are plain cosine similarity (-1..1).
// Older @axiljs/ai versions reported cosine rescaled to 0..1, (cosine + 1) / 2,
// newer ones report it plain. Probe once so both work.
let rescaledScores: Promise<boolean> | undefined

function storeRescalesCosine(): Promise<boolean> {
  rescaledScores ??= (async () => {
    const probe = new VectorStore({ metric: 'cosine' })
    await probe.add([{ id: 'probe', content: '', embedding: [1, 0] }])
    // Opposite vectors: plain cosine is -1, the rescaled score is 0
    const [hit] = await probe.search([-1, 0], { topK: 1, minScore: -1 })
    return (hit?.score ?? -1) > -0.5
  })()
  return rescaledScores
}

export class KnowledgeBase {
  private readonly store: VectorStore
  private readonly rag:   RAGPipeline

  constructor(private readonly options: KnowledgeOptions) {
    this.store = new VectorStore({ metric: 'cosine', maxDocuments: options.maxChunks })
    this.rag   = new RAGPipeline({
      provider:       options.provider,
      vectorStore:    this.store,
      embeddingModel: options.embeddingModel,
      topK:           options.topK,
      // Only used by rag.query(), which this app doesn't call: search() below
      // applies the threshold itself, on the right scale
      minScore:       options.minScore,
      chunker:        { chunkSize: 800, overlap: 150 }
    })
  }

  get isEmpty(): boolean {
    return this.store.size === 0
  }

  /** Chunk, embed and store a document; an existing id is replaced. */
  async ingest(doc: { id: string; title: string; content: string }): Promise<{ chunks: number; replaced: boolean }> {
    const replaced = await this.remove(doc.id)
    const result = await this.rag.index([
      { id: doc.id, content: doc.content, metadata: { source: doc.title, type: 'text', title: doc.title } }
    ])
    return { chunks: result.chunksCreated, replaced }
  }

  /** The chunks closest to \`query\`, best first. */
  async search(query: string): Promise<{ sources: Source[]; embeddingTokens: number }> {
    if (this.isEmpty) return { sources: [], embeddingTokens: 0 }

    const { embeddingModel, topK, minScore } = this.options
    // Same embeddings model as ingest, or the vectors are not comparable
    const embedded = await this.options.provider.embed(
      embeddingModel ? { input: query, model: embeddingModel } : { input: query }
    )
    const rescaled = await storeRescalesCosine()
    const toStore = (cosine: number) => (rescaled ? (cosine + 1) / 2 : cosine)
    const toCosine = (score: number) => (rescaled ? score * 2 - 1 : score)
    const results = await this.store.search(embedded.embeddings[0], { topK, minScore: toStore(minScore) })

    return {
      embeddingTokens: embedded.usage.totalTokens,
      sources: results.map(({ document, score }) => ({
        chunkId:    document.id,
        documentId: String(document.metadata?.documentId ?? document.id),
        title:      String(document.metadata?.title ?? document.metadata?.source ?? document.id),
        score:      Math.round(toCosine(score) * 1000) / 1000,
        content:    document.content
      }))
    }
  }

  documents(): DocumentInfo[] {
    const byId = new Map<string, DocumentInfo>()
    for (const chunk of this.store.getAll()) {
      const id = String(chunk.metadata?.documentId ?? chunk.id)
      const info = byId.get(id) ?? { id, title: String(chunk.metadata?.title ?? id), chunks: 0 }
      info.chunks++
      byId.set(id, info)
    }
    return [...byId.values()]
  }

  /** Remove every chunk of a document. False when it was not there. */
  async remove(documentId: string): Promise<boolean> {
    const chunks = this.store.getAll().filter(chunk => chunk.metadata?.documentId === documentId)
    for (const chunk of chunks) await this.store.delete(chunk.id)
    return chunks.length > 0
  }

  stats(): { documents: number; chunks: number; embeddingTokensUsed: number } {
    return {
      documents:           this.documents().length,
      chunks:              this.store.size,
      embeddingTokensUsed: this.rag.getStats().embeddingTokensUsed
    }
  }
}

/** System prompt section that grounds the answer in the retrieved chunks. */
export function groundingPrompt(sources: Source[]): string {
  return [
    'Use the context documents below when they are relevant and cite them as [1], [2], ...',
    'If they do not contain the answer, say so instead of guessing.',
    '',
    ...sources.map((s, i) => \`[\${i + 1}] \${s.title}\\n\${s.content}\`)
  ].join('\\n')
}
`,

    'src/ai/sessions.ts': `/**
 * Conversation history per session id, in memory.
 *
 * Each session keeps its last HISTORY_MAX_MESSAGES messages, and at most
 * MAX_SESSIONS sessions are kept: the least recently used one goes first.
 * Swap this class for a database table to survive restarts.
 */

import type { Message } from '@axiljs/ai'

export class SessionStore {
  // Map iteration order is insertion order: re-inserting on every write
  // keeps the least recently used session first
  private readonly sessions = new Map<string, Message[]>()
  private readonly maxMessages: number

  constructor(maxMessages: number, private readonly maxSessions: number) {
    // Even, so a trimmed history still starts with a user message
    this.maxMessages = Math.max(2, maxMessages - (maxMessages % 2))
  }

  has(id: string): boolean {
    return this.sessions.has(id)
  }

  history(id: string): Message[] {
    return [...(this.sessions.get(id) ?? [])]
  }

  append(id: string, ...messages: Message[]): Message[] {
    const next = [...(this.sessions.get(id) ?? []), ...messages].slice(-this.maxMessages)
    this.sessions.delete(id)
    this.sessions.set(id, next)

    while (this.sessions.size > this.maxSessions) {
      const oldest = this.sessions.keys().next().value
      if (oldest === undefined) break
      this.sessions.delete(oldest)
    }
    return next
  }

  delete(id: string): boolean {
    return this.sessions.delete(id)
  }

  get size(): number {
    return this.sessions.size
  }
}
`,

    'src/ai/tools.ts': `/**
 * Agent tools.
 *
 * A tool is a name, a description and a JSON schema the model reads, plus an
 * async handler the Agent runs when the model asks for it. Handler errors are
 * reported back to the model as { error } instead of failing the request.
 */

import { createTool, currentDateTimeTool, evaluateMathExpression } from '@axiljs/ai'
import type { Tool } from '@axiljs/ai'
import type { KnowledgeBase } from './knowledge.js'

export function createTools(knowledge: KnowledgeBase): Tool[] {
  const calculate = createTool({
    name:        'calculate',
    description: 'Evaluate an arithmetic expression exactly, e.g. "(17 * 23) / 4" or "sqrt(2) ^ 2". ' +
                 'Use it instead of doing arithmetic yourself.',
    parameters: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'Expression with + - * / % ^, parentheses and Math functions' }
      },
      required: ['expression']
    },
    handler: async ({ expression }) => {
      if (typeof expression !== 'string' || !expression.trim()) throw new Error('expression must be a non-empty string')
      // A small parser, never eval
      return { expression, result: evaluateMathExpression(expression) }
    }
  })

  const searchDocuments = createTool({
    name:        'search_documents',
    description: 'Search the documents ingested through POST /documents and return the most relevant passages.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to look for' }
      },
      required: ['query']
    },
    handler: async ({ query }) => {
      if (typeof query !== 'string' || !query.trim()) throw new Error('query must be a non-empty string')
      const { sources } = await knowledge.search(query)
      if (sources.length === 0) return { results: [], note: 'No matching documents' }
      return { results: sources.map(s => ({ title: s.title, documentId: s.documentId, score: s.score, content: s.content })) }
    }
  })

  return [calculate, searchDocuments, currentDateTimeTool]
}
`,

    'src/app.ts': `/**
 * Application factory.
 * Builds the app without listening, so tests can drive it directly.
 *
 * createApp(config) picks the provider from AI_PROVIDER; tests pass
 * { provider } to swap in a fake and never touch the network.
 */

import { randomUUID } from 'node:crypto'
import { Application, NotFoundError, cors, createSSE } from '@axiljs/core'
import { Agent } from '@axiljs/ai'
import type { AIProvider, CompletionOptions, CompletionResponse, Message } from '@axiljs/ai'
import { rateLimit } from '@axiljs/security'
import { v, validate } from '@axiljs/validation'
import type { Config } from './config.js'
import { KnowledgeBase, groundingPrompt } from './ai/knowledge.js'
import type { Source } from './ai/knowledge.js'
import { createChatProvider, createEmbeddingProvider, defaultMinScore, withEmbeddings } from './ai/providers.js'
import { SessionStore } from './ai/sessions.js'
import { createTools } from './ai/tools.js'
import { errorHandler } from './middleware/error-handler.js'

export const SERVICE = '${ctx.name}'
export const VERSION = '1.0.0'

const AGENT_PROMPT = \`You are a capable assistant with tools.
Use calculate for any arithmetic, search_documents for questions about the user's documents
and get_current_datetime for the date or time. Answer clearly once you have what you need.\`

// ─── Schemas ──────────────────────────────────────────────────────────────────

const ID = /^[A-Za-z0-9_-]{1,64}$/

const ChatBody = v.object({
  message:      v.string().trim().min(1).max(8000),
  sessionId:    v.string().pattern(ID).optional(),
  useDocuments: v.boolean().default(true),
  temperature:  v.number().min(0).max(1).optional()
}).strip()

const DocumentBody = v.object({
  id:      v.string().pattern(/^[A-Za-z0-9_.-]{1,64}$/).optional(),
  title:   v.string().trim().min(1).max(200).optional(),
  // Shorter text is below the chunker's minimum chunk size (50) and would be dropped
  content: v.string().trim().min(50).max(200_000)
}).strip()

const AgentBody = v.object({
  task: v.string().trim().min(1).max(4000)
}).strip()

const SessionParams  = v.object({ id: v.string().pattern(ID) })
const DocumentParams = v.object({ id: v.string().pattern(/^[A-Za-z0-9_.-]{1,64}$/) })

interface ChatInput {
  message:      string
  sessionId?:   string
  useDocuments: boolean
  temperature?: number
}

interface DocumentInput {
  id?:     string
  title?:  string
  content: string
}

// ─── App ──────────────────────────────────────────────────────────────────────

export interface AppDeps {
  /** Chat provider to use instead of the one AI_PROVIDER selects (tests pass a fake). */
  provider?:   AIProvider
  /** Embeddings provider for RAG instead of the one EMBEDDING_PROVIDER selects. */
  embeddings?: AIProvider
}

/** Throws MissingApiKeyError when the selected provider has no API key. */
export function createApp(config: Config, deps: AppDeps = {}): Application {
  const chat = deps.provider
    ? { provider: deps.provider, model: config.AI_MODEL ?? deps.provider.defaultModel }
    : createChatProvider(config)
  const embeddings = deps.embeddings ?? createEmbeddingProvider(config, chat.provider)

  const knowledge = new KnowledgeBase({
    provider:       withEmbeddings(chat.provider, embeddings, chat.model),
    embeddingModel: config.EMBEDDING_MODEL,
    topK:           config.RAG_TOP_K,
    minScore:       config.RAG_MIN_SCORE ?? defaultMinScore(embeddings),
    maxChunks:      config.RAG_MAX_CHUNKS
  })
  const sessions = new SessionStore(config.HISTORY_MAX_MESSAGES, config.MAX_SESSIONS)
  const tools    = createTools(knowledge)

  // One limiter (one counter per client IP) shared by every route that calls the model
  const aiLimit = rateLimit({
    windowMs: config.RATE_LIMIT_WINDOW_MS,
    max:      config.RATE_LIMIT_MAX,
    message:  'Too many AI requests, please slow down'
  })

  const app = new Application({
    server:  { port: config.PORT, host: config.HOST, methodNotAllowed: true, trustProxy: config.TRUST_PROXY },
    env:     config.NODE_ENV,
    logging: config.NODE_ENV !== 'test'
  })

  app.use(cors({ origin: parseOrigins(config.CORS_ORIGIN) }))

  /** History + retrieved documents + the new message, ready for the provider. */
  async function prepareTurn(input: ChatInput) {
    const sessionId = input.sessionId ?? randomUUID()
    const retrieval = input.useDocuments
      ? await knowledge.search(input.message)
      : { sources: [] as Source[], embeddingTokens: 0 }

    const options: CompletionOptions = {
      messages:  [...sessions.history(sessionId), { role: 'user', content: input.message }],
      system:    retrieval.sources.length > 0
        ? \`\${config.SYSTEM_PROMPT}\\n\\n\${groundingPrompt(retrieval.sources)}\`
        : config.SYSTEM_PROMPT,
      model:     chat.model,
      maxTokens: config.AI_MAX_TOKENS,
      ...(input.temperature !== undefined ? { temperature: input.temperature } : {})
    }
    return { sessionId, retrieval, options }
  }

  function remember(sessionId: string, question: string, answer: string): void {
    const turn: Message[] = [{ role: 'user', content: question }, { role: 'assistant', content: answer }]
    sessions.append(sessionId, ...turn)
  }

  app.get('/', (_req, res) => {
    res.success({
      service:    SERVICE,
      version:    VERSION,
      provider:   chat.provider.name,
      model:      chat.model,
      embeddings: embeddings.name,
      endpoints: [
        'GET    /',
        'GET    /health',
        'POST   /chat',
        'POST   /chat/stream',
        'GET    /sessions/:id',
        'DELETE /sessions/:id',
        'POST   /documents',
        'GET    /documents',
        'DELETE /documents/:id',
        'POST   /agent'
      ]
    }, 'Service info')
  })

  app.get('/health', (_req, res) => {
    res.json({
      status:    'ok',
      uptime:    Math.round(process.uptime()),
      timestamp: new Date().toISOString()
    })
  })

  // ─── Chat ───────────────────────────────────────────────────────────────────

  app.post('/chat', aiLimit, validate({ body: ChatBody }), async (req, res) => {
    const input = req.body as ChatInput
    const turn  = await prepareTurn(input)

    const completion = await chat.provider.complete(turn.options)
    remember(turn.sessionId, input.message, completion.content)

    res.success({
      sessionId:    turn.sessionId,
      reply:        completion.content,
      sources:      publicSources(turn.retrieval.sources),
      model:        completion.model,
      finishReason: completion.finishReason,
      usage:        usage(completion, turn.retrieval.embeddingTokens)
    }, 'Chat reply')
  })

  // Validation, rate limiting and retrieval errors are still plain JSON;
  // once the stream has started, failures arrive as an "error" event.
  app.post('/chat/stream', aiLimit, validate({ body: ChatBody }), async (req, res) => {
    const input = req.body as ChatInput
    const turn  = await prepareTurn(input)

    const abort = new AbortController()
    const sse   = createSSE(res)
    // Client went away: stop paying for tokens nobody reads
    res.raw.on('close', () => abort.abort())

    sse.send({ sessionId: turn.sessionId, sources: publicSources(turn.retrieval.sources) }, 'start')

    let reply = ''
    try {
      for await (const chunk of chat.provider.stream({ ...turn.options, signal: abort.signal })) {
        if (!sse.isOpen) break
        if (chunk.delta) {
          reply += chunk.delta
          sse.send({ text: chunk.delta }, 'delta')
        }
        if (chunk.done) {
          const final = chunk.response
          remember(turn.sessionId, input.message, final?.content ?? reply)
          sse.send({
            sessionId:    turn.sessionId,
            reply:        final?.content ?? reply,
            model:        final?.model ?? chat.model,
            finishReason: final?.finishReason ?? 'stop',
            usage:        final ? usage(final, turn.retrieval.embeddingTokens) : null
          }, 'done')
        }
      }
    } catch (err) {
      if (!abort.signal.aborted) console.error('[POST /chat/stream]', err)
      sse.send({
        error: {
          code:    'AI_PROVIDER_ERROR',
          message: config.NODE_ENV === 'production' ? 'The AI provider request failed' : (err as Error).message
        }
      }, 'error')
    } finally {
      sse.close()
    }
  })

  app.get('/sessions/:id', validate({ params: SessionParams }), (req, res) => {
    const { id } = req.params
    if (!sessions.has(id)) throw new NotFoundError(\`Session \${id} not found\`)
    res.success({ sessionId: id, messages: sessions.history(id) }, 'Session history')
  })

  app.delete('/sessions/:id', validate({ params: SessionParams }), (req, res) => {
    const { id } = req.params
    if (!sessions.delete(id)) throw new NotFoundError(\`Session \${id} not found\`)
    res.success({ sessionId: id }, 'Session deleted')
  })

  // ─── Documents (RAG) ────────────────────────────────────────────────────────

  app.post('/documents', aiLimit, validate({ body: DocumentBody }), async (req, res) => {
    const input = req.body as DocumentInput
    const id    = input.id ?? randomUUID()
    const title = input.title ?? id

    const result = await knowledge.ingest({ id, title, content: input.content })
    res.created({ id, title, chunks: result.chunks, replaced: result.replaced, totals: knowledge.stats() }, 'Document ingested')
  })

  app.get('/documents', (_req, res) => {
    res.success({ documents: knowledge.documents(), totals: knowledge.stats() }, 'Documents')
  })

  app.delete('/documents/:id', validate({ params: DocumentParams }), async (req, res) => {
    const { id } = req.params
    if (!(await knowledge.remove(id))) throw new NotFoundError(\`Document \${id} not found\`)
    res.success({ id }, 'Document deleted')
  })

  // ─── Agent ──────────────────────────────────────────────────────────────────

  app.post('/agent', aiLimit, validate({ body: AgentBody }), async (req, res) => {
    const { task } = req.body as { task: string }

    const agent = new Agent({
      provider:      chat.provider,
      tools,
      model:         chat.model,
      systemPrompt:  AGENT_PROMPT,
      maxIterations: config.AGENT_MAX_ITERATIONS
    })
    const result = await agent.run(task)

    res.success({
      response:   result.response,
      success:    result.success,
      iterations: result.iterations,
      toolCalls:  result.steps.flatMap(step => (step.toolResults ?? []).map(r => ({
        iteration: step.iteration,
        tool:      r.toolName,
        arguments: step.toolCalls?.find(call => call.id === r.toolCallId)?.arguments ?? {},
        result:    r.result,
        ...(r.error ? { error: r.error } : {})
      }))),
      usage: { totalTokens: result.usage.totalTokens }
    }, result.success ? 'Task completed' : 'Task not completed')
  })

  // Unknown routes (404), wrong methods (405), validation (422), rate limits
  // (429) and provider failures (502) all end up here.
  app.use(errorHandler(config.NODE_ENV))

  return app
}

function publicSources(sources: Source[]) {
  return sources.map(s => ({
    documentId: s.documentId,
    title:      s.title,
    score:      s.score,
    excerpt:    s.content.length > 240 ? \`\${s.content.slice(0, 240)}...\` : s.content
  }))
}

function usage(completion: CompletionResponse, embeddingTokens: number) {
  return { ...completion.usage, embeddingTokens }
}

function parseOrigins(value: string): string | string[] {
  if (value.trim() === '*') return '*'
  return value.split(',').map(o => o.trim()).filter(Boolean)
}
`,

    'src/main.ts': `/**
 * ${ctx.name}
 * Entry point: load .env, build the app, listen.
 */

import { loadEnv } from '@axiljs/config'
import type { Application } from '@axiljs/core'
import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { MissingApiKeyError } from './ai/providers.js'

loadEnv()

const config = loadConfig()
const app    = buildApp()

await app.listen()

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await app.close()
    process.exit(0)
  })
}

function buildApp(): Application {
  try {
    return createApp(config)
  } catch (err) {
    // A missing API key is a setup problem, not a crash: say what to set
    if (err instanceof MissingApiKeyError) {
      console.error(\`\\nCannot start: \${err.message}\\n\`)
      process.exit(1)
    }
    throw err
  }
}
`,

    'src/middleware/error-handler.ts': `/**
 * Error handler: turns thrown errors into one JSON shape.
 *
 *   { "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }
 *
 * axilError subclasses (NotFoundError, ValidationError, the rate limiter's
 * 429, ...) keep their status and code. A failed provider call (AIHttpError:
 * bad key, quota, outage) is a 502. Anything else is a 500 whose message is
 * hidden in production.
 */

import { AIHttpError } from '@axiljs/ai'
import { axilError } from '@axiljs/core'
import type { ErrorMiddlewareFn } from '@axiljs/core'

export function errorHandler(env: string): ErrorMiddlewareFn {
  const production = env === 'production'

  // Four parameters: that is how Application.use() recognises an error handler
  return (err, req, res, _next) => {
    if (err instanceof AIHttpError) {
      console.error(\`[\${req.method} \${req.path}] AI provider error\`, err.status ?? '', err.message)
      res.status(502).json({
        error: {
          code:    'AI_PROVIDER_ERROR',
          message: production ? 'The AI provider request failed' : err.message,
          ...(err.status !== undefined ? { details: { providerStatus: err.status } } : {})
        }
      })
      return
    }

    const known  = err instanceof axilError
    const status = known ? err.statusCode : 500

    if (status >= 500) console.error(\`[\${req.method} \${req.path}]\`, err)

    res.status(status).json({
      error: {
        code:    known ? err.code : 'INTERNAL_ERROR',
        message: status >= 500 && production ? 'Internal server error' : err.message,
        ...(known && err.details !== undefined ? { details: err.details } : {})
      }
    })
  }
}
`,

    'src/testing/fake-provider.ts': `/**
 * A deterministic AIProvider for tests: no API key, no network.
 *
 *   chat       "Reply #<n> to: <message>", n = user messages it was sent,
 *              so a test can see that history was included
 *   "fail"     in the message: throws an AIHttpError, like a rejected key
 *   with tools (the agent): asks for \`calculate\` when the task contains
 *              arithmetic, \`search_documents\` otherwise, then answers with
 *              the tool's result
 *   stream()   the same reply, one word per chunk
 *
 * Every call is recorded in \`calls\` for assertions.
 */

import { AIHttpError } from '@axiljs/ai'
import type { AIProvider, CompletionOptions, CompletionResponse, CompletionStream, EmbeddingResponse, Message, ToolCall } from '@axiljs/ai'

const USAGE = { promptTokens: 12, completionTokens: 8, totalTokens: 20 }

export class FakeProvider implements AIProvider {
  readonly name = 'fake'
  readonly defaultModel = 'fake-model-1'
  readonly calls: CompletionOptions[] = []

  async complete(options: CompletionOptions): Promise<CompletionResponse> {
    this.calls.push(options)
    return this.respond(options)
  }

  async *stream(options: CompletionOptions): CompletionStream {
    this.calls.push(options)
    const response = this.respond(options)
    const words = response.content.split(' ')
    for (let i = 0; i < words.length; i++) {
      yield { delta: i === 0 ? words[i] : \` \${words[i]}\`, done: false }
    }
    yield { delta: '', done: true, response }
  }

  async embed(): Promise<EmbeddingResponse> {
    throw new Error('FakeProvider has no embeddings: the tests use LocalEmbeddings')
  }

  get lastCall(): CompletionOptions {
    return this.calls[this.calls.length - 1]
  }

  private respond(options: CompletionOptions): CompletionResponse {
    if (options.tools?.length) return this.agentStep(options.messages)

    const text = options.messages[options.messages.length - 1]?.content ?? ''
    if (text.includes('fail')) {
      throw new AIHttpError('Fake API error 401: invalid x-api-key', { status: 401 })
    }
    const turns = options.messages.filter(m => m.role === 'user').length
    return reply(\`Reply #\${turns} to: \${text}\`)
  }

  private agentStep(messages: Message[]): CompletionResponse {
    const last = messages[messages.length - 1]
    if (last.role === 'tool') return reply(\`Tool result: \${last.content}\`)

    const math = last.content.match(/\\d+(?:\\.\\d+)?(?:\\s*[-+*/^]\\s*\\d+(?:\\.\\d+)?)+/)
    const call: ToolCall = math
      ? { id: 'call_1', name: 'calculate', arguments: { expression: math[0] } }
      : { id: 'call_1', name: 'search_documents', arguments: { query: last.content } }
    return { content: '', toolCalls: [call], finishReason: 'tool_use', usage: USAGE, model: 'fake-model-1' }
  }
}

function reply(content: string): CompletionResponse {
  return { content, finishReason: 'stop', usage: USAGE, model: 'fake-model-1' }
}
`,

    'src/app.test.ts': `import { describe, it, expect, createTestClient } from '@axiljs/testing'
import { createApp, SERVICE } from './app.js'
import { loadConfig } from './config.js'
import { FakeProvider } from './testing/fake-provider.js'

// Local embeddings + an injected fake model: no keys, no network
const TEST_ENV = { NODE_ENV: 'test', EMBEDDING_PROVIDER: 'local', RATE_LIMIT_MAX: '1000' }

function setup(env: Record<string, string> = {}) {
  const provider = new FakeProvider()
  const app      = createApp(loadConfig({ ...TEST_ENV, ...env }), { provider })
  return { provider, client: createTestClient(app) }
}

interface SSEEvent { event: string; data: any }

/** Split an SSE body into events; comments (": connected") are skipped. */
function parseSSE(text: string): SSEEvent[] {
  return text.split('\\n\\n')
    .map(block => block.trim())
    .filter(block => block && !block.startsWith(':'))
    .map(block => {
      let event = 'message'
      const data: string[] = []
      for (const line of block.split('\\n')) {
        if (line.startsWith('event: ')) event = line.slice(7)
        else if (line.startsWith('data: ')) data.push(line.slice(6))
      }
      return { event, data: JSON.parse(data.join('\\n')) }
    })
}

const REFUND_POLICY = 'Refunds are accepted within 30 days of purchase. Items must be unused and returned ' +
                      'in their original packaging. Refunds are paid to the original payment method.'
const SHIPPING      = 'Orders ship within two business days. Express delivery is available in most regions ' +
                      'for an extra fee, and tracking numbers are emailed once the parcel leaves the warehouse.'

describe('GET / and /health', () => {
  const { client } = setup()

  it('describes the service and the model in use', async () => {
    const res = await client.get('/')
    expect(res.status).toBe(200)
    expect(res.body.data.service).toBe(SERVICE)
    expect(res.body.data.provider).toBe('fake')
    expect(res.body.data.model).toBe('fake-model-1')
    expect(res.body.data.embeddings).toBe('local')
    expect(res.body.data.endpoints).toContain('POST   /chat/stream')
  })

  it('reports ok', async () => {
    const res = await client.get('/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
  })
})

describe('POST /chat', () => {
  it('replies with a new session id, usage and no sources', async () => {
    const { client, provider } = setup()
    const res = await client.post('/chat').send({ message: '  Hello there  ' })
    expect(res.status).toBe(200)
    expect(res.body.data.reply).toBe('Reply #1 to: Hello there')
    expect(res.body.data.sessionId).toMatch(/^[0-9a-f-]{36}$/)
    expect(res.body.data.sources).toEqual([])
    expect(res.body.data.model).toBe('fake-model-1')
    expect(res.body.data.usage).toEqual({ promptTokens: 12, completionTokens: 8, totalTokens: 20, embeddingTokens: 0 })
    expect(provider.lastCall.maxTokens).toBe(1024)
    expect(provider.lastCall.system).toBe('You are a helpful, concise assistant.')
  })

  it('keeps conversation history per session', async () => {
    const { client, provider } = setup()
    await client.post('/chat').send({ message: 'first', sessionId: 'alice' })
    await client.post('/chat').send({ message: 'other session', sessionId: 'bob' })
    const res = await client.post('/chat').send({ message: 'second', sessionId: 'alice' })

    expect(res.body.data.reply).toBe('Reply #2 to: second')
    expect(provider.lastCall.messages.map(m => m.content)).toEqual(['first', 'Reply #1 to: first', 'second'])

    const history = await client.get('/sessions/alice')
    expect(history.status).toBe(200)
    expect(history.body.data.messages).toHaveLength(4)
    expect(history.body.data.messages[3]).toEqual({ role: 'assistant', content: 'Reply #2 to: second' })
  })

  it('caps the history at HISTORY_MAX_MESSAGES', async () => {
    const { client } = setup({ HISTORY_MAX_MESSAGES: '4' })
    for (const message of ['one', 'two', 'three']) {
      await client.post('/chat').send({ message, sessionId: 'capped' })
    }
    const history = await client.get('/sessions/capped')
    expect(history.body.data.messages).toHaveLength(4)
    expect(history.body.data.messages[0]).toEqual({ role: 'user', content: 'two' })
  })

  it('forgets a session on DELETE', async () => {
    const { client } = setup()
    await client.post('/chat').send({ message: 'hi', sessionId: 'temp' })
    expect((await client.delete('/sessions/temp')).status).toBe(200)
    const res = await client.get('/sessions/temp')
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })

  it('returns 422 for an invalid body', async () => {
    const { client, provider } = setup()
    const res = await client.post('/chat').send({ message: '', sessionId: 'not valid!', temperature: 5 })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
    const paths = res.body.error.details.map((d: { path: string }) => d.path)
    expect(paths).toContain('message')
    expect(paths).toContain('sessionId')
    expect(paths).toContain('temperature')
    expect(provider.calls).toHaveLength(0)
  })

  it('turns a provider failure into a 502', async () => {
    const { client } = setup()
    const res = await client.post('/chat').send({ message: 'please fail' })
    expect(res.status).toBe(502)
    expect(res.body.error.code).toBe('AI_PROVIDER_ERROR')
    expect(res.body.error.details.providerStatus).toBe(401)
  })
})

describe('POST /chat/stream', () => {
  it('streams start, delta and done events over SSE', async () => {
    const { client } = setup()
    const res = await client.post('/chat/stream').send({ message: 'stream me please', sessionId: 'streamer' })
    expect(res.status).toBe(200)
    expect(String(res.headers['content-type'])).toContain('text/event-stream')

    const events = parseSSE(res.text)
    expect(events[0].event).toBe('start')
    expect(events[0].data.sessionId).toBe('streamer')

    const deltas = events.filter(e => e.event === 'delta')
    expect(deltas.length).toBeGreaterThan(1)

    const done = events[events.length - 1]
    expect(done.event).toBe('done')
    expect(deltas.map(e => e.data.text).join('')).toBe(done.data.reply)
    expect(done.data.reply).toBe('Reply #1 to: stream me please')
    expect(done.data.usage.totalTokens).toBe(20)
  })

  it('saves the streamed turn in the session history', async () => {
    const { client } = setup()
    await client.post('/chat/stream').send({ message: 'remember this', sessionId: 's1' })
    const res = await client.post('/chat').send({ message: 'and this', sessionId: 's1' })
    expect(res.body.data.reply).toBe('Reply #2 to: and this')
  })

  it('validates before opening the stream (JSON 422)', async () => {
    const { client } = setup()
    const res = await client.post('/chat/stream').send({})
    expect(res.status).toBe(422)
    expect(res.body.error.details[0].path).toBe('message')
  })

  it('reports a provider failure as an error event', async () => {
    const { client } = setup()
    const res = await client.post('/chat/stream').send({ message: 'this will fail' })
    const events = parseSSE(res.text)
    const last = events[events.length - 1]
    expect(last.event).toBe('error')
    expect(last.data.error.code).toBe('AI_PROVIDER_ERROR')
  })
})

describe('RAG: /documents and grounded chat', () => {
  it('ingests documents and lists them', async () => {
    const { client } = setup()
    const res = await client.post('/documents').send({ id: 'refunds', title: 'Refund policy', content: REFUND_POLICY })
    expect(res.status).toBe(201)
    expect(res.body.data.id).toBe('refunds')
    expect(res.body.data.chunks).toBeGreaterThanOrEqual(1)
    expect(res.body.data.replaced).toBe(false)

    const list = await client.get('/documents')
    expect(list.body.data.documents).toEqual([{ id: 'refunds', title: 'Refund policy', chunks: 1 }])
  })

  it('answers from the best matching document and returns it as a source', async () => {
    const { client, provider } = setup()
    await client.post('/documents').send({ id: 'refunds', title: 'Refund policy', content: REFUND_POLICY })
    await client.post('/documents').send({ id: 'shipping', title: 'Shipping', content: SHIPPING })

    const res = await client.post('/chat').send({ message: 'How many days do I have for refunds?' })
    expect(res.status).toBe(200)
    const sources = res.body.data.sources
    expect(sources.length).toBeGreaterThanOrEqual(1)
    expect(sources[0].documentId).toBe('refunds')
    expect(sources[0].title).toBe('Refund policy')
    expect(sources[0].score).toBeGreaterThan(0)
    expect(res.body.data.usage.embeddingTokens).toBeGreaterThan(0)
    // The retrieved chunk is in the prompt the model saw
    expect(provider.lastCall.system).toContain('within 30 days')
  })

  it('sends sources in the stream start event', async () => {
    const { client } = setup()
    await client.post('/documents').send({ id: 'shipping', title: 'Shipping', content: SHIPPING })
    const res = await client.post('/chat/stream').send({ message: 'Is express delivery available?' })
    const start = parseSSE(res.text)[0]
    expect(start.data.sources[0].documentId).toBe('shipping')
  })

  it('skips retrieval for unrelated questions or useDocuments: false', async () => {
    const { client, provider } = setup()
    await client.post('/documents').send({ id: 'refunds', title: 'Refund policy', content: REFUND_POLICY })

    const unrelated = await client.post('/chat').send({ message: 'Tell me about penguins' })
    expect(unrelated.body.data.sources).toEqual([])

    const off = await client.post('/chat').send({ message: 'refunds?', useDocuments: false })
    expect(off.body.data.sources).toEqual([])
    expect(provider.lastCall.system).not.toContain('within 30 days')
  })

  it('replaces a document ingested again under the same id, and deletes it', async () => {
    const { client } = setup()
    await client.post('/documents').send({ id: 'refunds', title: 'Refund policy', content: REFUND_POLICY })
    const again = await client.post('/documents').send({ id: 'refunds', title: 'Refunds v2', content: REFUND_POLICY })
    expect(again.body.data.replaced).toBe(true)
    expect(again.body.data.totals.documents).toBe(1)

    expect((await client.delete('/documents/refunds')).status).toBe(200)
    expect((await client.delete('/documents/refunds')).status).toBe(404)
  })

  it('returns 422 for content that is too short', async () => {
    const { client } = setup()
    const res = await client.post('/documents').send({ content: 'too short' })
    expect(res.status).toBe(422)
    expect(res.body.error.details[0].path).toBe('content')
  })
})

describe('POST /agent', () => {
  it('calls the calculator tool and answers with its result', async () => {
    const { client } = setup()
    const res = await client.post('/agent').send({ task: 'What is 12 * 7?' })
    expect(res.status).toBe(200)
    expect(res.body.data.success).toBe(true)
    expect(res.body.data.iterations).toBe(2)
    expect(res.body.data.toolCalls[0].tool).toBe('calculate')
    expect(res.body.data.toolCalls[0].arguments).toEqual({ expression: '12 * 7' })
    expect(res.body.data.toolCalls[0].result).toEqual({ expression: '12 * 7', result: 84 })
    expect(res.body.data.response).toContain('84')
    expect(res.body.data.usage.totalTokens).toBe(40)
  })

  it('searches the ingested documents with a tool', async () => {
    const { client } = setup()
    await client.post('/documents').send({ id: 'shipping', title: 'Shipping', content: SHIPPING })
    const res = await client.post('/agent').send({ task: 'Find out how fast orders ship' })
    expect(res.status).toBe(200)
    const call = res.body.data.toolCalls[0]
    expect(call.tool).toBe('search_documents')
    expect(call.result.results[0].documentId).toBe('shipping')
  })

  it('returns 422 without a task', async () => {
    const { client } = setup()
    const res = await client.post('/agent').send({ task: '   ' })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })
})

describe('rate limiting', () => {
  it('limits the AI routes per client IP with a 429', async () => {
    const { client } = setup({ RATE_LIMIT_MAX: '2' })
    expect((await client.post('/chat').send({ message: 'one' })).status).toBe(200)
    expect((await client.post('/agent').send({ task: 'What is 1 + 1?' })).status).toBe(200)

    const limited = await client.post('/chat').send({ message: 'three' })
    expect(limited.status).toBe(429)
    expect(limited.body.error.code).toBe('RATE_LIMIT_EXCEEDED')
    expect(limited.headers['retry-after']).toBeDefined()

    // Non-AI routes are not limited
    expect((await client.get('/health')).status).toBe(200)
  })

  it('counts each client separately behind a trusted proxy', async () => {
    const { client } = setup({ RATE_LIMIT_MAX: '1', TRUST_PROXY: '1' })
    expect((await client.post('/chat').send({ message: 'a' }).set('x-forwarded-for', '203.0.113.1')).status).toBe(200)
    expect((await client.post('/chat').send({ message: 'b' }).set('x-forwarded-for', '203.0.113.2')).status).toBe(200)
    expect((await client.post('/chat').send({ message: 'c' }).set('x-forwarded-for', '203.0.113.1')).status).toBe(429)
  })
})

describe('errors', () => {
  it('returns a JSON 404 for unknown routes', async () => {
    const { client } = setup()
    const res = await client.get('/nope')
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })
})
`,

    'src/ai/ai.test.ts': `import { describe, it, expect } from '@axiljs/testing'
import { createApp } from '../app.js'
import { loadConfig } from '../config.js'
import { LocalEmbeddings } from './local-embeddings.js'
import {
  ANTHROPIC_DEFAULT_MODEL, MissingApiKeyError, createChatProvider, createEmbeddingProvider
} from './providers.js'
import { SessionStore } from './sessions.js'

// Constructing a provider never makes a request, so none of this touches the network
const config = (env: Record<string, string>) => loadConfig({ NODE_ENV: 'test', ...env })

describe('missing API keys (startup errors)', () => {
  it('refuses to start without ANTHROPIC_API_KEY', () => {
    expect(() => createApp(config({ AI_PROVIDER: 'anthropic' }))).toThrow(MissingApiKeyError)
    expect(() => createApp(config({ AI_PROVIDER: 'anthropic' }))).toThrow(/ANTHROPIC_API_KEY/)
  })

  it('names the variable to set for openai and gemini', () => {
    expect(() => createChatProvider(config({ AI_PROVIDER: 'openai' }))).toThrow(/OPENAI_API_KEY/)
    expect(() => createChatProvider(config({ AI_PROVIDER: 'gemini' }))).toThrow(/GEMINI_API_KEY/)
  })

  it('treats an empty value as missing', () => {
    expect(() => createChatProvider(config({ AI_PROVIDER: 'openai', OPENAI_API_KEY: '' }))).toThrow(/OPENAI_API_KEY/)
  })

  it('needs no key for ollama', () => {
    const { provider, model } = createChatProvider(config({ AI_PROVIDER: 'ollama' }))
    expect(provider.name).toBe('ollama')
    expect(model).toBe('llama3.2')
  })

  it('needs the embeddings key when EMBEDDING_PROVIDER names another provider', () => {
    const cfg = config({ AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'test-key', EMBEDDING_PROVIDER: 'openai' })
    expect(() => createApp(cfg)).toThrow(/EMBEDDING_PROVIDER=openai needs OPENAI_API_KEY/)
  })
})

describe('provider selection', () => {
  it('defaults Anthropic to a current Claude model', () => {
    const { provider, model } = createChatProvider(config({ ANTHROPIC_API_KEY: 'test-key' }))
    expect(provider.name).toBe('anthropic')
    expect(model).toBe(ANTHROPIC_DEFAULT_MODEL)
    expect(model).toBe('claude-sonnet-5-5')
  })

  it('honours AI_MODEL', () => {
    const { model } = createChatProvider(config({ ANTHROPIC_API_KEY: 'test-key', AI_MODEL: 'claude-opus-5-5' }))
    expect(model).toBe('claude-opus-5-5')
  })

  it('uses local embeddings for anthropic and the chat provider otherwise', () => {
    const anthropic = config({ ANTHROPIC_API_KEY: 'test-key' })
    expect(createEmbeddingProvider(anthropic, createChatProvider(anthropic).provider)).toBeInstanceOf(LocalEmbeddings)

    const openai = config({ AI_PROVIDER: 'openai', OPENAI_API_KEY: 'test-key' })
    const chat   = createChatProvider(openai).provider
    expect(createEmbeddingProvider(openai, chat)).toBe(chat)
  })

  it('rejects an unknown provider', () => {
    expect(() => config({ AI_PROVIDER: 'skynet' })).toThrow()
  })
})

describe('LocalEmbeddings', () => {
  const embedder = new LocalEmbeddings()

  it('returns one normalised vector per input', async () => {
    const res = await embedder.embed({ input: ['refund policy', 'shipping times'] })
    expect(res.embeddings).toHaveLength(2)
    const norm = Math.sqrt(res.embeddings[0].reduce((s, x) => s + x * x, 0))
    expect(norm).toBeCloseTo(1, 6)
    expect(res.usage.totalTokens).toBe(4)
  })

  it('scores texts that share words higher', async () => {
    const { embeddings: [query, related, unrelated] } = await embedder.embed({
      input: ['What is the refund policy?', 'Our refund policy lasts 30 days.', 'Penguins live in Antarctica.']
    })
    const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0)
    expect(dot(query, related)).toBeGreaterThan(dot(query, unrelated))
  })
})

describe('SessionStore', () => {
  it('keeps the newest messages and evicts the least recently used session', () => {
    const store = new SessionStore(4, 2)
    store.append('a', { role: 'user', content: '1' }, { role: 'assistant', content: '2' })
    store.append('a', { role: 'user', content: '3' }, { role: 'assistant', content: '4' })
    store.append('a', { role: 'user', content: '5' }, { role: 'assistant', content: '6' })
    expect(store.history('a').map(m => m.content)).toEqual(['3', '4', '5', '6'])

    store.append('b', { role: 'user', content: 'b' })
    store.append('a', { role: 'user', content: '7' })      // a is now the most recent
    store.append('c', { role: 'user', content: 'c' })      // evicts b
    expect(store.has('a')).toBe(true)
    expect(store.has('b')).toBe(false)
    expect(store.size).toBe(2)
  })
})
`
  }),

  nextSteps: () => [
    ['Edit .env', 'Set AI_PROVIDER and its API key (ollama needs none)'],
    ['npm test', 'Runs against a fake provider: no key, no network'],
    ['npm run dev', 'Then POST /documents and /chat (see README)']
  ]
}
