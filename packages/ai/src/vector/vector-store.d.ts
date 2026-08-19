/**
 * Vector Store.
 * In-memory vector database for semantic similarity search.
 * Phase 6 adds adapters for Pinecone, Weaviate, Qdrant, pgvector.
 *
 * How it works:
 *   1. Store documents with their vector embeddings
 *   2. On query: embed the query, find most similar document vectors
 *   3. Return top-k most similar documents
 *
 * Usage:
 *   const store = new VectorStore()
 *
 *   await store.add([
 *     { id: '1', content: 'JavaScript is great', embedding: [...] },
 *     { id: '2', content: 'Python is also great', embedding: [...] }
 *   ])
 *
 *   const results = await store.search(queryEmbedding, { topK: 3 })
 */
export interface VectorDocument {
    id: string;
    content: string;
    embedding: number[];
    metadata?: Record<string, unknown>;
}
export interface SearchResult {
    document: VectorDocument;
    score: number;
}
export interface SearchOptions {
    topK?: number;
    minScore?: number;
    filter?: Record<string, unknown>;
}
export type SimilarityMetric = 'cosine' | 'dot' | 'euclidean';
export interface VectorStoreOptions {
    metric?: SimilarityMetric;
    maxDocuments?: number;
}
export declare class VectorStore {
    private documents;
    private metric;
    private maxDocuments;
    constructor(options?: VectorStoreOptions);
    /**
     * Add documents to the vector store.
     */
    add(documents: VectorDocument[]): Promise<void>;
    /**
     * Add a single document.
     */
    addOne(document: VectorDocument): Promise<void>;
    /**
     * Find the most similar documents to a query embedding.
     *
     * @param queryEmbedding  Vector embedding of the search query
     * @param options         Search options (topK, minScore, filter)
     */
    search(queryEmbedding: number[], options?: SearchOptions): Promise<SearchResult[]>;
    /**
     * Delete a document by ID.
     */
    delete(id: string): Promise<boolean>;
    /**
     * Get a document by ID.
     */
    get(id: string): Promise<VectorDocument | null>;
    /**
     * Get total document count.
     */
    get size(): number;
    /**
     * Clear all documents.
     */
    clear(): Promise<void>;
    /**
     * Get all documents (for debugging/inspection).
     */
    getAll(): VectorDocument[];
    private computeSimilarity;
}
//# sourceMappingURL=vector-store.d.ts.map