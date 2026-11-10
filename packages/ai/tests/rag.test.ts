import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RAGPipeline } from '../src/rag/rag-pipeline';
import { VectorStore } from '../src/vector/vector-store';
import {
  AIProvider, CompletionOptions, CompletionResponse, CompletionStream, EmbeddingOptions, EmbeddingResponse
} from '../src/types';
import { collect, silenceConsole } from './helpers/mock-server';

const VOCAB = ['postgres', 'mysql', 'sqlite', 'cats', 'dogs', 'framework', 'database'];

/**
 * Bag-of-words "embedding" over a tiny vocabulary: deterministic and
 * good enough for similarity to behave sensibly.
 */
function embedText(text: string): number[] {
  const lower = text.toLowerCase();
  return VOCAB.map(w => (lower.split(w).length - 1)).map(n => n + 0.01);
}

class FakeProvider implements AIProvider {
  readonly name = 'fake';
  readonly defaultModel = 'fake-gen';
  embedCalls: EmbeddingOptions[] = [];
  completeCalls: CompletionOptions[] = [];

  async embed(options: EmbeddingOptions): Promise<EmbeddingResponse> {
    this.embedCalls.push(options);
    const inputs = Array.isArray(options.input) ? options.input : [options.input];
    return { embeddings: inputs.map(embedText), model: options.model || 'fake-embed', usage: { totalTokens: inputs.length } };
  }

  async complete(options: CompletionOptions): Promise<CompletionResponse> {
    this.completeCalls.push(options);
    return {
      content: 'AxilJS supports PostgreSQL.',
      finishReason: 'stop',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
      model: options.model || this.defaultModel
    };
  }

  async *stream(options: CompletionOptions): CompletionStream {
    this.completeCalls.push(options);
    yield { delta: 'Post', done: false };
    yield { delta: 'gres', done: false };
    yield { delta: '', done: true, response: { content: 'Postgres', finishReason: 'stop', usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }, model: 'fake-gen' } };
  }
}

describe('RAGPipeline with a fake embedding provider', () => {
  let provider: FakeProvider;
  let store: VectorStore;
  let rag: RAGPipeline;

  beforeEach(async () => {
    silenceConsole(vi);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    provider = new FakeProvider();
    store = new VectorStore();
    rag = new RAGPipeline({ provider, vectorStore: store, embeddingModel: 'embed-x', topK: 2, minScore: 0.6 });

    await rag.index([
      { id: 'db', content: 'AxilJS is a framework. It supports postgres, mysql and sqlite as its database. '.repeat(3), metadata: { source: 'db.md', type: 'text' } },
      { id: 'pets', content: 'Cats and dogs are pets. Dogs bark and cats meow. '.repeat(3), metadata: { source: 'pets.md', type: 'text' } }
    ]);
  });

  it('indexes chunks with embeddings and metadata', async () => {
    expect(store.size).toBe(2);
    const docs = store.getAll();
    expect(docs[0].metadata).toMatchObject({ source: 'db.md', documentId: 'db', chunkIndex: 0 });
    expect(docs[0].embedding).toHaveLength(VOCAB.length);
    expect(provider.embedCalls[0]).toMatchObject({ model: 'embed-x' });
    expect(rag.getStats()).toEqual({ documentCount: 2, embeddingTokensUsed: 2 });
  });

  it('retrieves relevant context and generates an answer', async () => {
    const answer = await rag.query('Which database? postgres or mysql?');
    expect(answer.response).toBe('AxilJS supports PostgreSQL.');
    expect(answer.sources).toHaveLength(1);
    expect(answer.sources[0].metadata).toMatchObject({ source: 'db.md' });
    expect(answer.usage).toEqual({ retrievalEmbeddingTokens: 1, generationTokens: 15 });

    const call = provider.completeCalls[0];
    expect(call.temperature).toBe(0.3);
    expect(call.messages[call.messages.length - 1].content).toContain('Question: Which database? postgres or mysql?');
    expect(call.messages[call.messages.length - 1].content).toContain('Source: db.md');
    // query embedding used the same model as indexing
    expect(provider.embedCalls[provider.embedCalls.length - 1]).toMatchObject({ model: 'embed-x' });
  });

  it('answers "not enough information" without calling the model when nothing matches', async () => {
    const strict = new RAGPipeline({ provider, vectorStore: store, minScore: 0.999 });
    const answer = await strict.query('quantum chromodynamics');
    expect(answer.sources).toEqual([]);
    expect(answer.response).toMatch(/don't have enough information/);
    expect(provider.completeCalls).toHaveLength(0);
  });

  it('queryStream yields sources, deltas and done', async () => {
    const events = await collect(rag.queryStream('postgres database'));
    expect(events[0].type).toBe('sources');
    expect((events[0].data as any[])[0].metadata).toMatchObject({ source: 'db.md' });
    expect(events.filter(e => e.type === 'delta').map(e => e.data).join('')).toBe('Postgres');
    expect(events[events.length - 1]).toMatchObject({ type: 'done', data: { content: 'Postgres' } });
  });
});
