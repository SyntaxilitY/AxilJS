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
 *
 *   await store.save('./data/vectors.json')   // persist
 *   await new VectorStore().load('./data/vectors.json')
 */
export interface VectorDocument {
    id: string;
    content: string;
    embedding: number[];
    metadata?: Record<string, unknown>;
}
export interface SearchResult {
    document: VectorDocument;
    /**
     * Similarity score, higher = more similar. The scale depends on the metric:
     *   - 'cosine'    (default): raw cosine similarity, -1..1
     *                 (1 = same direction, 0 = unrelated/orthogonal, -1 = opposite)
     *   - 'dot':      raw dot product (unbounded; equals cosine for unit vectors)
     *   - 'euclidean': 1 / (1 + distance), 0..1 (1 = identical)
     */
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
export interface VectorStoreJSON {
    version: 1;
    metric: SimilarityMetric;
    maxDocuments: number | null;
    documents: VectorDocument[];
}
export declare class VectorStore {
    private documents;
    private metric;
    private maxDocuments;
    constructor(options?: VectorStoreOptions);
    /**
     * Add documents to the vector store.
     * A document whose ID already exists replaces it (keeping its position).
     */
    add(documents: VectorDocument[]): Promise<void>;
    /**
     * Insert or replace documents by ID (same semantics as add()).
     */
    upsert(documents: VectorDocument[]): Promise<void>;
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
    /**
     * Serialize the store (metric, limit and documents) to a plain object.
     */
    toJSON(): VectorStoreJSON;
    /**
     * Create a store from toJSON() output (object or JSON string).
     * `options` override the serialized metric / maxDocuments.
     */
    static fromJSON(data: VectorStoreJSON | string, options?: VectorStoreOptions): VectorStore;
    /**
     * Write the store to a JSON file (parent directories are created).
     * Writes a temp file and renames it, so a crash never leaves a
     * half-written file behind.
     */
    save(filePath: string): Promise<void>;
    /**
     * Replace this store's documents with those saved at `filePath`.
     * The store keeps its own metric / maxDocuments settings
     * (use VectorStore.fromJSON to restore those too).
     */
    load(filePath: string): Promise<this>;
    private static parseJSON;
    private replaceDocuments;
    /**
     * Enforce max document limit (remove oldest).
     */
    private enforceLimit;
    private computeSimilarity;
}
//# sourceMappingURL=vector-store.d.ts.map