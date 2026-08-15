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

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
