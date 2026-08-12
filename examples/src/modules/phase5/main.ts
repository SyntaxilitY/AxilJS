/**
 * Phase 5 - Complete AI Application Example.
 * Chat, streaming, RAG, agents, and MCP all working together.
 */

import { Application, cors } from '@restjs/core';
import { loadEnv, defineConfig } from '@restjs/config';
import { helmet, rateLimit } from '@restjs/security';
import { authenticate } from '@restjs/auth';
import { JWT } from '@restjs/auth';
import {
  OpenAIProvider,
  AnthropicProvider,
  OllamaProvider,
  RAGPipeline,
  VectorStore,
  Agent,
  MCPClient,
  aiChat,
  aiChatStream,
  aiEmbed,
  aiAgent,
  loadFromText,
  createTool,
  calculatorTool,
  currentDateTimeTool
} from '@restjs/ai';
import { validate, v } from '@restjs/validation';

// ── Config ────────────────────────────────────────────────────────────────────

loadEnv();

const config = defineConfig({
  PORT:            { type: 'number',  default: 3000 },
  JWT_SECRET:      { type: 'string',  default: 'dev-secret-32-characters-minimum!!' },
  OPENAI_API_KEY:  { type: 'string',  required: false },
  ANTHROPIC_KEY:   { type: 'string',  required: false },
  GOOGLE_API_KEY:  { type: 'string',  required: false },
  USE_LOCAL_LLM:   { type: 'boolean', default: false },
  MCP_SERVER_URL:  { type: 'string',  required: false }
});

// ── Choose AI Provider ────────────────────────────────────────────────────────

function buildProvider() {
  // Priority: Local (Ollama) > OpenAI > Anthropic > Gemini
  if (config.USE_LOCAL_LLM) {
    console.log('\x1b[33m[AI]\x1b[0m Using Ollama (local LLM)');
    return new OllamaProvider({ model: 'llama3.2' });
  }

  if (config.OPENAI_API_KEY) {
    console.log('\x1b[32m[AI]\x1b[0m Using OpenAI GPT-4o-mini');
    return new OpenAIProvider({ apiKey: config.OPENAI_API_KEY! });
  }

  if (config.ANTHROPIC_KEY) {
    console.log('\x1b[32m[AI]\x1b[0m Using Anthropic Claude');
    return new AnthropicProvider({ apiKey: config.ANTHROPIC_KEY! });
  }

  console.warn('\x1b[33m[AI]\x1b[0m No API key found - using Ollama fallback');
  return new OllamaProvider({ model: 'llama3.2' });
}

const provider = buildProvider();
const jwt = new JWT(config.JWT_SECRET);

// ── RAG Setup ─────────────────────────────────────────────────────────────────

const vectorStore = new VectorStore({ metric: 'cosine' });
const rag = new RAGPipeline({
  provider,
  vectorStore,
  topK: 5,
  minScore: 0.3
});

// Index some knowledge about REstJS
async function indexKnowledge() {
  const docs = loadFromText([
    `REstJS is a next-generation JavaScript backend ecosystem.
     It includes a runtime, framework, ORM, auth, AI platform, and more.
     Created by Tariq Mehmood as an R&D project.`,

    `REstJS AI platform supports OpenAI, Anthropic, Google Gemini, and local LLMs via Ollama.
     It provides RAG pipelines, vector stores, AI agents with tool calling, and MCP support.`,

    `REstJS Phase 1 includes the HTTP server, router (trie-based), middleware chain, and CLI.
     Phase 2 adds security, config, package manager, static files, and SSE.
     Phase 3 adds ORM, auth (JWT, RBAC), validation, and testing framework.
     Phase 4 adds events, WebSockets, queues, circuit breaker, and observability.
     Phase 5 adds the full AI platform.`
  ], 'restjs-docs');

  await rag.index(docs);
  console.log('\x1b[32m[AI]\x1b[0m Knowledge base indexed');
}

// ── Custom Tools ──────────────────────────────────────────────────────────────

const weatherTool = createTool({
  name: 'get_weather',
  description: 'Get current weather for a city (demo - returns mock data)',
  parameters: {
    type: 'object',
    properties: {
      city: { type: 'string', description: 'City name' }
    },
    required: ['city']
  },
  handler: async ({ city }) => ({
    city,
    temperature: '22°C',
    condition: 'Partly cloudy',
    humidity: '65%',
    note: 'Mock data - connect a real weather API in production'
  })
});

// ── Application ───────────────────────────────────────────────────────────────

const app = new Application({ server: { port: config.PORT } });

app.use(helmet());
app.use(cors());
app.use(rateLimit({ max: 60, windowMs: 60000 }));

// ── Validation Schemas ────────────────────────────────────────────────────────

const chatSchema = v.object({
  messages: v.array(
    v.object({
      role:    v.enum(['system', 'user', 'assistant', 'tool']),
      content: v.string().min(1)
    })
  ).min(1),
  model:       v.string().optional(),
  temperature: v.number().min(0).max(2).optional(),
  stream:      v.boolean().optional()
});

const ragSchema = v.object({
  question: v.string().min(1).max(1000),
  stream:   v.boolean().optional()
});

const agentSchema = v.object({
  task:    v.string().min(1).max(2000),
  stream:  v.boolean().optional()
});

const indexSchema = v.object({
  texts:  v.array(v.string().min(1)).min(1),
  source: v.string().optional()
});

// ── Routes ────────────────────────────────────────────────────────────────────

// Standard chat completion
app.post(
  '/ai/chat',
  validate({ body: chatSchema }),
  aiChat({ provider, temperature: 0.7 })
);

// Streaming chat
app.post(
  '/ai/chat/stream',
  validate({ body: chatSchema }),
  aiChatStream({ provider })
);

// Embeddings
app.post('/ai/embed', aiEmbed({ provider }));

// RAG - query knowledge base
app.post(
  '/ai/rag/query',
  validate({ body: ragSchema }),
  async (req, res) => {
    const { question, stream } = req.body as any;

    if (stream) {
      // Streaming RAG response
      const { createSSE } = require('@restjs/core');
      const sse = createSSE(res);

      try {
        for await (const event of rag.queryStream(question)) {
          if (!sse.isOpen) break;
          sse.send(event.data, event.type);
          if (event.type === 'done') break;
        }
      } finally {
        sse.close();
      }
    } else {
      // Non-streaming RAG
      const result = await rag.query(question);
      res.json(result);
    }
  }
);

// RAG - index new documents
app.post(
  '/ai/rag/index',
  validate({ body: indexSchema }),
  async (req, res) => {
    const { texts, source } = req.body as any;
    const docs = loadFromText(texts, source || 'api-upload');
    const stats = await rag.index(docs);
    res.json({ success: true, ...stats, totalIndexed: vectorStore.size });
  }
);

// Agent with tools
app.post(
  '/ai/agent',
  validate({ body: agentSchema }),
  aiAgent({
    provider,
    tools: [calculatorTool, currentDateTimeTool, weatherTool],
    systemPrompt: 'You are a helpful assistant. Use tools when needed.',
    maxIterations: 8,
    stream: false
  })
);

// Streaming agent
app.post(
  '/ai/agent/stream',
  validate({ body: agentSchema }),
  aiAgent({
    provider,
    tools: [calculatorTool, currentDateTimeTool, weatherTool],
    maxIterations: 8,
    stream: true
  })
);

// MCP tools endpoint (if MCP server configured)
app.get('/ai/mcp/tools', async (req, res) => {
  if (!config.MCP_SERVER_URL) {
    res.json({ tools: [], message: 'MCP_SERVER_URL not configured' });
    return;
  }

  try {
    const client = new MCPClient({ serverUrl: config.MCP_SERVER_URL });
    await client.connect();
    const tools = await client.listTools();
    await client.disconnect();
    res.json({ tools });
  } catch (error) {
    res.status(503).json({
      error: { code: 'MCP_ERROR', message: (error as Error).message }
    });
  }
});

// AI health check
app.get('/ai/health', async (req, res) => {
  res.json({
    provider:       provider.name,
    defaultModel:   provider.defaultModel,
    vectorStoreSize: vectorStore.size,
    ragReady:       vectorStore.size > 0,
    mcpConfigured:  !!config.MCP_SERVER_URL,
    status:         'ready'
  });
});

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function bootstrap() {
  // Index built-in knowledge
  await indexKnowledge();

  await app.listen(config.PORT);
}

bootstrap().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});