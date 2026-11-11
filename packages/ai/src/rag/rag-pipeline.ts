/**
 * RAG (Retrieval-Augmented Generation) Pipeline.
 * Combines document retrieval with LLM generation.
 *
 * Full RAG flow:
 *   1. Index: Load documents → chunk → embed → store in vector DB
 *   2. Query: Embed query → retrieve similar chunks → generate answer
 *
 * Usage:
 *   const rag = new RAGPipeline({ provider, vectorStore })
 *
 *   // Index documents
 *   await rag.index([
 *     { id: '1', content: 'AxilJS is a backend framework...', metadata: {} }
 *   ])
 *
 *   // Query
 *   const answer = await rag.query('What is AxilJS?')
 *   console.log(answer.response)
 *   console.log(answer.sources) // Which documents were used
 */

import { AIProvider, Message } from '../types';
import { VectorStore } from '../vector/vector-store';
import { DocumentChunker } from './chunker';
import { RawDocument } from './document-loader';
import { AILogger, resolveLogger } from '../logger';

// ─── Options ──────────────────────────────────────────────────────────────────

export interface RAGPipelineOptions {
  // AI provider for completions (and embeddings, unless embeddingProvider is set)
  provider: AIProvider;

  // Provider used for embeddings (index + query). Defaults to `provider`.
  // Needed when `provider` has no embeddings API, e.g. AnthropicProvider:
  //   new RAGPipeline({ provider: anthropic, embeddingProvider: openai })
  embeddingProvider?: AIProvider;

  // Vector store (created externally or defaults to in-memory)
  vectorStore?: VectorStore;

  // Model for generating answers (default: provider default)
  generationModel?: string;

  // Model for generating embeddings (default: provider specific)
  embeddingModel?: string;

  // Number of documents to retrieve per query (default: 5)
  topK?: number;

  // Minimum similarity score for retrieved documents (default: 0.3).
  // Uses the vector store's scale; for the default cosine metric that is raw
  // cosine similarity (-1..1, 0 = unrelated), see SearchResult.score.
  minScore?: number;

  // Chunker options
  chunker?: {
    chunkSize?: number;
    overlap?: number;
    // Discard chunks shorter than this (default: 50). A document shorter
    // than this is still indexed as one chunk.
    minChunkSize?: number;
  };

  // Progress logging. Default: coloured console output. false = silent.
  logger?: AILogger | false;

  // System prompt template for RAG
  systemPrompt?: string;
}

// ─── Query Result ─────────────────────────────────────────────────────────────

export interface RAGQueryResult {
  // Generated answer
  response: string;

  // Source documents used to generate the answer
  sources: Array<{
    content: string;
    score: number;
    metadata: Record<string, unknown>;
  }>;

  // Token usage
  usage: {
    retrievalEmbeddingTokens: number;
    generationTokens: number;
  };
}

// ─── Default System Prompt ────────────────────────────────────────────────────

const DEFAULT_SYSTEM_PROMPT = `You are a helpful assistant that answers questions based on the provided context documents.

Instructions:
- Answer the question using ONLY the information provided in the context below
- If the context doesn't contain enough information to answer the question, say so clearly
- Be concise and accurate
- Cite relevant parts of the context when appropriate`;

// ─── RAG Pipeline ────────────────────────────────────────────────────────────

export class RAGPipeline {
  private provider: AIProvider;
  private embeddingProvider: AIProvider;
  private vectorStore: VectorStore;
  private chunker: DocumentChunker;
  private logger: AILogger;
  // The in-place progress line is only drawn for the default console logger
  private logProgress: boolean;
  private options: Required<Omit<RAGPipelineOptions, 'vectorStore' | 'chunker' | 'provider' | 'embeddingProvider' | 'logger'>>;

  // Track total tokens used
  private totalEmbeddingTokens = 0;

  constructor(options: RAGPipelineOptions) {
    this.provider = options.provider;
    this.embeddingProvider = options.embeddingProvider || options.provider;
    this.vectorStore = options.vectorStore || new VectorStore();
    this.logger = resolveLogger(options.logger, 'AxilJS AI');
    this.logProgress = options.logger === undefined;

    this.chunker = new DocumentChunker({
      chunkSize:    options.chunker?.chunkSize    ?? 800,
      overlap:      options.chunker?.overlap      ?? 150,
      minChunkSize: options.chunker?.minChunkSize ?? 50
    });

    this.options = {
      generationModel: options.generationModel || this.provider.defaultModel,
      embeddingModel:  options.embeddingModel  || '',
      topK:            options.topK            ?? 5,
      minScore:        options.minScore        ?? 0.3,
      systemPrompt:    options.systemPrompt    || DEFAULT_SYSTEM_PROMPT
    };
  }

  // ─── Indexing ─────────────────────────────────────────────────────────────────

  /**
   * Index documents into the vector store.
   * Chunks documents, generates embeddings, and stores everything.
   *
   * @param documents  Raw documents to index
   */
  async index(documents: RawDocument[]): Promise<{
    documentsIndexed: number;
    chunksCreated: number;
  }> {
    this.logger.info(`Indexing ${documents.length} document(s)...`);

    // Step 1: Chunk documents
    const chunks = this.chunker.chunk(documents);
    this.logger.info(`Created ${chunks.length} chunk(s)`);

    // Step 2: Generate embeddings for all chunks
    // Batch in groups of 20 to avoid rate limits
    const BATCH_SIZE = 20;
    let processed = 0;

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const texts = batch.map(c => c.content);

      const embeddingOptions: any = { input: texts };
      if (this.options.embeddingModel) {
        embeddingOptions.model = this.options.embeddingModel;
      }

      const result = await this.embeddingProvider.embed(embeddingOptions);

      this.totalEmbeddingTokens += result.usage.totalTokens;

      // Step 3: Store chunks with their embeddings
      const vectorDocs = batch.map((chunk, j) => ({
        id: chunk.id,
        content: chunk.content,
        embedding: result.embeddings[j],
        metadata: {
          ...chunk.metadata,
          documentId: chunk.documentId,
          chunkIndex: chunk.chunkIndex
        }
      }));

      await this.vectorStore.add(vectorDocs);
      processed += batch.length;

      if (this.logProgress) {
        process.stdout.write(
          `\r\x1b[90m[AxilJS AI]\x1b[0m Embedded ${processed}/${chunks.length} chunks`
        );
      }
    }

    if (this.logProgress) console.log('');
    this.logger.info(
      `Indexed ${documents.length} documents ` +
      `(${chunks.length} chunks, ${this.totalEmbeddingTokens} tokens)`
    );

    return { documentsIndexed: documents.length, chunksCreated: chunks.length };
  }

  // ─── Query ────────────────────────────────────────────────────────────────────

  /**
   * Answer a question using retrieved context.
   *
   * @param question      The user's question
   * @param conversation  Optional conversation history for multi-turn
   */
  async query(
    question: string,
    conversation: Message[] = []
  ): Promise<RAGQueryResult> {
    // Step 1: Embed the query
    const embeddingOptions: any = { input: question };
    if (this.options.embeddingModel) {
      embeddingOptions.model = this.options.embeddingModel;
    }

    const queryEmbedding = await this.embeddingProvider.embed(embeddingOptions);
    const embeddingTokens = queryEmbedding.usage.totalTokens;

    // Step 2: Retrieve most similar chunks
    const searchResults = await this.vectorStore.search(
      queryEmbedding.embeddings[0],
      {
        topK: this.options.topK,
        minScore: this.options.minScore
      }
    );

    if (searchResults.length === 0) {
      return {
        response: "I don't have enough information in my knowledge base to answer that question.",
        sources: [],
        usage: {
          retrievalEmbeddingTokens: embeddingTokens,
          generationTokens: 0
        }
      };
    }

    // Step 3: Build context from retrieved chunks
    const context = searchResults
      .map((result, i) => {
        const source = result.document.metadata?.source || 'Unknown';
        return `[Context ${i + 1}] (Source: ${source}, Relevance: ${(result.score * 100).toFixed(0)}%)\n${result.document.content}`;
      })
      .join('\n\n---\n\n');

    // Step 4: Build messages for the LLM
    const messages: Message[] = [
      // Previous conversation (if any)
      ...conversation,
      // Current question with context
      {
        role: 'user',
        content:
          `Context Documents:\n\n${context}\n\n` +
          `---\n\nQuestion: ${question}`
      }
    ];

    // Step 5: Generate answer
    const completion = await this.provider.complete({
      messages,
      model: this.options.generationModel,
      system: this.options.systemPrompt,
      temperature: 0.3  // Lower temperature for factual answers
    });

    return {
      response: completion.content,
      sources: searchResults.map(r => ({
        content: r.document.content,
        score: r.score,
        metadata: r.document.metadata || {}
      })),
      usage: {
        retrievalEmbeddingTokens: embeddingTokens,
        generationTokens: completion.usage.totalTokens
      }
    };
  }

  /**
   * Query with streaming response.
   * Returns the sources immediately and streams the generated text.
   */
  async *queryStream(
    question: string,
    conversation: Message[] = []
  ): AsyncGenerator<{
    type: 'sources' | 'delta' | 'done';
    data: unknown;
  }> {
    // Retrieve context (same as query())
    // Must use the same embedding model as index(), or dimensions mismatch
    const queryEmbedding = await this.embeddingProvider.embed(
      this.options.embeddingModel
        ? { input: question, model: this.options.embeddingModel }
        : { input: question }
    );
    const searchResults = await this.vectorStore.search(
      queryEmbedding.embeddings[0],
      { topK: this.options.topK, minScore: this.options.minScore }
    );

    // Emit sources first so UI can show them immediately
    yield {
      type: 'sources',
      data: searchResults.map(r => ({
        content: r.document.content.slice(0, 200) + '...', // Preview
        score: r.score,
        metadata: r.document.metadata
      }))
    };

    if (searchResults.length === 0) {
      yield {
        type: 'delta',
        data: "I don't have enough information to answer that question."
      };
      yield { type: 'done', data: null };
      return;
    }

    // Build context and messages
    const context = searchResults
      .map((r, i) => `[${i + 1}] ${r.document.content}`)
      .join('\n\n');

    const messages: Message[] = [
      ...conversation,
      {
        role: 'user',
        content: `Context:\n\n${context}\n\nQuestion: ${question}`
      }
    ];

    // Stream the generation
    const stream = this.provider.stream({
      messages,
      model: this.options.generationModel,
      system: this.options.systemPrompt,
      temperature: 0.3
    });

    for await (const chunk of stream) {
      if (chunk.delta) {
        yield { type: 'delta', data: chunk.delta };
      }

      if (chunk.done) {
        yield { type: 'done', data: chunk.response };
        return;
      }
    }
  }

  /**
   * Get vector store statistics.
   */
  getStats(): { documentCount: number; embeddingTokensUsed: number } {
    return {
      documentCount:        this.vectorStore.size,
      embeddingTokensUsed:  this.totalEmbeddingTokens
    };
  }
}