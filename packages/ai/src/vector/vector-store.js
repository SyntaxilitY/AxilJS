"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.VectorStore = void 0;
// ─── Similarity Functions ─────────────────────────────────────────────────────
/**
 * Compute cosine similarity between two vectors.
 * Returns a value between -1 and 1 (1 = identical direction).
 * We normalize to 0-1 for convenience.
 */
function cosineSimilarity(a, b) {
    if (a.length !== b.length) {
        throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
    }
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;
    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        magnitudeA += a[i] * a[i];
        magnitudeB += b[i] * b[i];
    }
    magnitudeA = Math.sqrt(magnitudeA);
    magnitudeB = Math.sqrt(magnitudeB);
    if (magnitudeA === 0 || magnitudeB === 0)
        return 0;
    // Normalize to 0-1 range
    return (dotProduct / (magnitudeA * magnitudeB) + 1) / 2;
}
/**
 * Compute dot product similarity.
 * Faster than cosine when vectors are already normalized.
 */
function dotProduct(a, b) {
    return a.reduce((sum, val, i) => sum + val * b[i], 0);
}
class VectorStore {
    documents = [];
    metric;
    maxDocuments;
    constructor(options = {}) {
        this.metric = options.metric || 'cosine';
        this.maxDocuments = options.maxDocuments || Infinity;
    }
    // ─── Add Documents ───────────────────────────────────────────────────────────
    /**
     * Add documents to the vector store.
     */
    async add(documents) {
        for (const doc of documents) {
            // Replace existing document with same ID
            const existingIndex = this.documents.findIndex(d => d.id === doc.id);
            if (existingIndex !== -1) {
                this.documents[existingIndex] = doc;
            }
            else {
                this.documents.push(doc);
            }
        }
        // Enforce max document limit (remove oldest)
        if (this.documents.length > this.maxDocuments) {
            this.documents = this.documents.slice(-this.maxDocuments);
        }
    }
    /**
     * Add a single document.
     */
    async addOne(document) {
        await this.add([document]);
    }
    // ─── Search ───────────────────────────────────────────────────────────────────
    /**
     * Find the most similar documents to a query embedding.
     *
     * @param queryEmbedding  Vector embedding of the search query
     * @param options         Search options (topK, minScore, filter)
     */
    async search(queryEmbedding, options = {}) {
        const { topK = 5, minScore = 0, filter } = options;
        if (this.documents.length === 0) {
            return [];
        }
        // Apply metadata filter first to reduce computation
        let candidates = this.documents;
        if (filter && Object.keys(filter).length > 0) {
            candidates = this.documents.filter(doc => {
                if (!doc.metadata)
                    return false;
                return Object.entries(filter).every(([key, value]) => doc.metadata[key] === value);
            });
        }
        // Compute similarity for all candidates
        const results = candidates.map(doc => ({
            document: doc,
            score: this.computeSimilarity(queryEmbedding, doc.embedding)
        }));
        // Sort by score descending
        results.sort((a, b) => b.score - a.score);
        // Apply score threshold and take top-k
        return results
            .filter(r => r.score >= minScore)
            .slice(0, topK);
    }
    // ─── Management ───────────────────────────────────────────────────────────────
    /**
     * Delete a document by ID.
     */
    async delete(id) {
        const index = this.documents.findIndex(d => d.id === id);
        if (index === -1)
            return false;
        this.documents.splice(index, 1);
        return true;
    }
    /**
     * Get a document by ID.
     */
    async get(id) {
        return this.documents.find(d => d.id === id) || null;
    }
    /**
     * Get total document count.
     */
    get size() {
        return this.documents.length;
    }
    /**
     * Clear all documents.
     */
    async clear() {
        this.documents = [];
    }
    /**
     * Get all documents (for debugging/inspection).
     */
    getAll() {
        return [...this.documents];
    }
    // ─── Internal ────────────────────────────────────────────────────────────────
    computeSimilarity(a, b) {
        switch (this.metric) {
            case 'cosine':
                return cosineSimilarity(a, b);
            case 'dot':
                return dotProduct(a, b);
            case 'euclidean': {
                // Convert euclidean distance to similarity score (0-1)
                const distance = Math.sqrt(a.reduce((sum, val, i) => sum + Math.pow(val - b[i], 2), 0));
                return 1 / (1 + distance);
            }
            default:
                return cosineSimilarity(a, b);
        }
    }
}
exports.VectorStore = VectorStore;
//# sourceMappingURL=vector-store.js.map