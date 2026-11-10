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
import { RawDocument } from './document-loader';
export interface RAGPipelineOptions {
    provider: AIProvider;
    vectorStore?: VectorStore;
    generationModel?: string;
    embeddingModel?: string;
    topK?: number;
    minScore?: number;
    chunker?: {
        chunkSize?: number;
        overlap?: number;
    };
    systemPrompt?: string;
}
export interface RAGQueryResult {
    response: string;
    sources: Array<{
        content: string;
        score: number;
        metadata: Record<string, unknown>;
    }>;
    usage: {
        retrievalEmbeddingTokens: number;
        generationTokens: number;
    };
}
export declare class RAGPipeline {
    private provider;
    private vectorStore;
    private chunker;
    private options;
    private totalEmbeddingTokens;
    constructor(options: RAGPipelineOptions);
    /**
     * Index documents into the vector store.
     * Chunks documents, generates embeddings, and stores everything.
     *
     * @param documents  Raw documents to index
     */
    index(documents: RawDocument[]): Promise<{
        documentsIndexed: number;
        chunksCreated: number;
    }>;
    /**
     * Answer a question using retrieved context.
     *
     * @param question      The user's question
     * @param conversation  Optional conversation history for multi-turn
     */
    query(question: string, conversation?: Message[]): Promise<RAGQueryResult>;
    /**
     * Query with streaming response.
     * Returns the sources immediately and streams the generated text.
     */
    queryStream(question: string, conversation?: Message[]): AsyncGenerator<{
        type: 'sources' | 'delta' | 'done';
        data: unknown;
    }>;
    /**
     * Get vector store statistics.
     */
    getStats(): {
        documentCount: number;
        embeddingTokensUsed: number;
    };
}
//# sourceMappingURL=rag-pipeline.d.ts.map