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

// ─── Types ────────────────────────────────────────────────────────────────────

export interface VectorDocument {
  // Unique document ID
  id: string;

  // Raw text content
  content: string;

  // Vector embedding (array of floats)
  embedding: number[];

  // Optional metadata (source, page, section, etc.)
  metadata?: Record<string, unknown>;
}

export interface SearchResult {
  document: VectorDocument;

  // Cosine similarity score (0-1, higher = more similar)
  score: number;
}

export interface SearchOptions {
  // Number of results to return (default: 5)
  topK?: number;

  // Minimum similarity score threshold (0-1, default: 0)
  minScore?: number;

  // Filter by metadata fields
  filter?: Record<string, unknown>;
}

// ─── Similarity Functions ─────────────────────────────────────────────────────

/**
 * Compute cosine similarity between two vectors.
 * Returns a value between -1 and 1 (1 = identical direction).
 * We normalize to 0-1 for convenience.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(
      `Vector dimension mismatch: ${a.length} vs ${b.length}`
    );
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

  if (magnitudeA === 0 || magnitudeB === 0) return 0;

  // Normalize to 0-1 range
  return (dotProduct / (magnitudeA * magnitudeB) + 1) / 2;
}

/**
 * Compute dot product similarity.
 * Faster than cosine when vectors are already normalized.
 */
function dotProduct(a: number[], b: number[]): number {
  return a.reduce((sum, val, i) => sum + val * b[i], 0);
}

// ─── Vector Store ─────────────────────────────────────────────────────────────

export type SimilarityMetric = 'cosine' | 'dot' | 'euclidean';

export interface VectorStoreOptions {
  // Similarity metric to use (default: 'cosine')
  metric?: SimilarityMetric;

  // Max documents to store (default: unlimited)
  maxDocuments?: number;
}

export class VectorStore {
  private documents: VectorDocument[] = [];
  private metric: SimilarityMetric;
  private maxDocuments: number;

  constructor(options: VectorStoreOptions = {}) {
    this.metric = options.metric || 'cosine';
    this.maxDocuments = options.maxDocuments || Infinity;
  }

  // ─── Add Documents ───────────────────────────────────────────────────────────

  /**
   * Add documents to the vector store.
   */
  async add(documents: VectorDocument[]): Promise<void> {
    for (const doc of documents) {
      // Replace existing document with same ID
      const existingIndex = this.documents.findIndex(d => d.id === doc.id);

      if (existingIndex !== -1) {
        this.documents[existingIndex] = doc;
      } else {
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
  async addOne(document: VectorDocument): Promise<void> {
    await this.add([document]);
  }

  // ─── Search ───────────────────────────────────────────────────────────────────

  /**
   * Find the most similar documents to a query embedding.
   *
   * @param queryEmbedding  Vector embedding of the search query
   * @param options         Search options (topK, minScore, filter)
   */
  async search(
    queryEmbedding: number[],
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const {
      topK = 5,
      minScore = 0,
      filter
    } = options;

    if (this.documents.length === 0) {
      return [];
    }

    // Apply metadata filter first to reduce computation
    let candidates = this.documents;

    if (filter && Object.keys(filter).length > 0) {
      candidates = this.documents.filter(doc => {
        if (!doc.metadata) return false;
        return Object.entries(filter).every(
          ([key, value]) => doc.metadata![key] === value
        );
      });
    }

    // Compute similarity for all candidates
    const results: SearchResult[] = candidates.map(doc => ({
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
  async delete(id: string): Promise<boolean> {
    const index = this.documents.findIndex(d => d.id === id);
    if (index === -1) return false;
    this.documents.splice(index, 1);
    return true;
  }

  /**
   * Get a document by ID.
   */
  async get(id: string): Promise<VectorDocument | null> {
    return this.documents.find(d => d.id === id) || null;
  }

  /**
   * Get total document count.
   */
  get size(): number {
    return this.documents.length;
  }

  /**
   * Clear all documents.
   */
  async clear(): Promise<void> {
    this.documents = [];
  }

  /**
   * Get all documents (for debugging/inspection).
   */
  getAll(): VectorDocument[] {
    return [...this.documents];
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  private computeSimilarity(a: number[], b: number[]): number {
    switch (this.metric) {
      case 'cosine':
        return cosineSimilarity(a, b);

      case 'dot':
        return dotProduct(a, b);

      case 'euclidean': {
        // Convert euclidean distance to similarity score (0-1)
        const distance = Math.sqrt(
          a.reduce((sum, val, i) => sum + Math.pow(val - b[i], 2), 0)
        );
        return 1 / (1 + distance);
      }

      default:
        return cosineSimilarity(a, b);
    }
  }
}