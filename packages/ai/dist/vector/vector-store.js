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
 *
 *   await store.save('./data/vectors.json')   // persist
 *   await new VectorStore().load('./data/vectors.json')
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.VectorStore = void 0;
const fs_1 = require("fs");
const nodePath = __importStar(require("path"));
// ─── Similarity Functions ─────────────────────────────────────────────────────
function assertSameDimension(a, b) {
    if (a.length !== b.length) {
        throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`);
    }
}
/**
 * Compute cosine similarity between two vectors.
 * Returns a value between -1 and 1 (1 = identical direction).
 * We normalize to 0-1 for convenience.
 */
function cosineSimilarity(a, b) {
    assertSameDimension(a, b);
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
    assertSameDimension(a, b);
    let sum = 0;
    for (let i = 0; i < a.length; i++)
        sum += a[i] * b[i];
    return sum;
}
/**
 * Euclidean distance converted to a 0-1 similarity score.
 */
function euclideanSimilarity(a, b) {
    assertSameDimension(a, b);
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
        const d = a[i] - b[i];
        sum += d * d;
    }
    return 1 / (1 + Math.sqrt(sum));
}
class VectorStore {
    // Insertion-ordered id -> document index (O(1) add/get/delete/upsert)
    documents = new Map();
    metric;
    maxDocuments;
    constructor(options = {}) {
        this.metric = options.metric || 'cosine';
        this.maxDocuments = options.maxDocuments || Infinity;
    }
    // ─── Add Documents ───────────────────────────────────────────────────────────
    /**
     * Add documents to the vector store.
     * A document whose ID already exists replaces it (keeping its position).
     */
    async add(documents) {
        for (const doc of documents) {
            this.documents.set(doc.id, doc);
        }
        this.enforceLimit();
    }
    /**
     * Insert or replace documents by ID (same semantics as add()).
     */
    async upsert(documents) {
        await this.add(documents);
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
        if (this.documents.size === 0) {
            return [];
        }
        // Apply metadata filter first to reduce computation
        let candidates = Array.from(this.documents.values());
        if (filter && Object.keys(filter).length > 0) {
            candidates = candidates.filter(doc => {
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
        return this.documents.delete(id);
    }
    /**
     * Get a document by ID.
     */
    async get(id) {
        return this.documents.get(id) || null;
    }
    /**
     * Get total document count.
     */
    get size() {
        return this.documents.size;
    }
    /**
     * Clear all documents.
     */
    async clear() {
        this.documents.clear();
    }
    /**
     * Get all documents (for debugging/inspection).
     */
    getAll() {
        return Array.from(this.documents.values());
    }
    // ─── Persistence ─────────────────────────────────────────────────────────────
    /**
     * Serialize the store (metric, limit and documents) to a plain object.
     */
    toJSON() {
        return {
            version: 1,
            metric: this.metric,
            maxDocuments: Number.isFinite(this.maxDocuments) ? this.maxDocuments : null,
            documents: this.getAll()
        };
    }
    /**
     * Create a store from toJSON() output (object or JSON string).
     * `options` override the serialized metric / maxDocuments.
     */
    static fromJSON(data, options = {}) {
        const parsed = VectorStore.parseJSON(data);
        const store = new VectorStore({
            metric: options.metric || parsed.metric,
            maxDocuments: options.maxDocuments ?? parsed.maxDocuments ?? undefined
        });
        store.replaceDocuments(parsed.documents);
        return store;
    }
    /**
     * Write the store to a JSON file (parent directories are created).
     * Writes a temp file and renames it, so a crash never leaves a
     * half-written file behind.
     */
    async save(filePath) {
        await fs_1.promises.mkdir(nodePath.dirname(filePath), { recursive: true });
        const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
        try {
            await fs_1.promises.writeFile(tmp, JSON.stringify(this.toJSON()), 'utf8');
            await fs_1.promises.rename(tmp, filePath);
        }
        catch (err) {
            await fs_1.promises.rm(tmp, { force: true }).catch(() => { });
            throw err;
        }
    }
    /**
     * Replace this store's documents with those saved at `filePath`.
     * The store keeps its own metric / maxDocuments settings
     * (use VectorStore.fromJSON to restore those too).
     */
    async load(filePath) {
        const parsed = VectorStore.parseJSON(await fs_1.promises.readFile(filePath, 'utf8'));
        this.replaceDocuments(parsed.documents);
        return this;
    }
    // ─── Internal ────────────────────────────────────────────────────────────────
    static parseJSON(data) {
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        if (!parsed || !Array.isArray(parsed.documents)) {
            throw new Error('Invalid VectorStore data: expected { documents: [...] }');
        }
        return parsed;
    }
    replaceDocuments(documents) {
        const next = new Map();
        for (const doc of documents) {
            if (!doc || typeof doc.id !== 'string' || !Array.isArray(doc.embedding)) {
                throw new Error('Invalid VectorStore document: id and embedding are required');
            }
            next.set(doc.id, doc);
        }
        this.documents = next;
        this.enforceLimit();
    }
    /**
     * Enforce max document limit (remove oldest).
     */
    enforceLimit() {
        let excess = this.documents.size - this.maxDocuments;
        if (excess <= 0)
            return;
        for (const id of this.documents.keys()) {
            if (excess-- <= 0)
                break;
            this.documents.delete(id);
        }
    }
    computeSimilarity(a, b) {
        switch (this.metric) {
            case 'cosine':
                return cosineSimilarity(a, b);
            case 'dot':
                return dotProduct(a, b);
            case 'euclidean':
                return euclideanSimilarity(a, b);
            default:
                return cosineSimilarity(a, b);
        }
    }
}
exports.VectorStore = VectorStore;
//# sourceMappingURL=vector-store.js.map