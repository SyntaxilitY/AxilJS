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

import { promises as fsp } from 'fs';
import * as nodePath from 'path';

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
  // Number of results to return (default: 5)
  topK?: number;

  // Minimum similarity score threshold, on the metric's scale (see
  // SearchResult.score). Default: no threshold (top-K regardless of score)
  minScore?: number;

  // Filter by metadata fields
  filter?: Record<string, unknown>;
}

// ─── Similarity Functions ─────────────────────────────────────────────────────

function assertSameDimension(a: number[], b: number[]): void {
  if (a.length !== b.length) {
    throw new Error(
      `Vector dimension mismatch: ${a.length} vs ${b.length}`
    );
  }
}

/**
 * Compute cosine similarity between two vectors.
 * Returns the raw value between -1 and 1 (1 = identical direction,
 * 0 = orthogonal/unrelated, -1 = opposite). Not rescaled, so thresholds
 * mean the same thing as in other vector databases.
 */
function cosineSimilarity(a: number[], b: number[]): number {
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

  if (magnitudeA === 0 || magnitudeB === 0) return 0;

  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * Compute dot product similarity.
 * Faster than cosine when vectors are already normalized.
 */
function dotProduct(a: number[], b: number[]): number {
  assertSameDimension(a, b);
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

/**
 * Euclidean distance converted to a 0-1 similarity score.
 */
function euclideanSimilarity(a: number[], b: number[]): number {
  assertSameDimension(a, b);
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return 1 / (1 + Math.sqrt(sum));
}

// ─── Vector Store ─────────────────────────────────────────────────────────────

export type SimilarityMetric = 'cosine' | 'dot' | 'euclidean';

export interface VectorStoreOptions {
  // Similarity metric to use (default: 'cosine')
  metric?: SimilarityMetric;

  // Max documents to store (default: unlimited)
  maxDocuments?: number;
}

// Serialized form produced by toJSON() / save()
export interface VectorStoreJSON {
  version: 1;
  metric: SimilarityMetric;
  // null = unlimited
  maxDocuments: number | null;
  documents: VectorDocument[];
}

export class VectorStore {
  // Insertion-ordered id -> document index (O(1) add/get/delete/upsert)
  private documents: Map<string, VectorDocument> = new Map();
  private metric: SimilarityMetric;
  private maxDocuments: number;

  constructor(options: VectorStoreOptions = {}) {
    this.metric = options.metric || 'cosine';
    this.maxDocuments = options.maxDocuments || Infinity;
  }

  // ─── Add Documents ───────────────────────────────────────────────────────────

  /**
   * Add documents to the vector store.
   * A document whose ID already exists replaces it (keeping its position).
   */
  async add(documents: VectorDocument[]): Promise<void> {
    for (const doc of documents) {
      this.documents.set(doc.id, doc);
    }

    this.enforceLimit();
  }

  /**
   * Insert or replace documents by ID (same semantics as add()).
   */
  async upsert(documents: VectorDocument[]): Promise<void> {
    await this.add(documents);
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
      minScore = -Infinity,
      filter
    } = options;

    if (this.documents.size === 0) {
      return [];
    }

    // Apply metadata filter first to reduce computation
    let candidates = Array.from(this.documents.values());

    if (filter && Object.keys(filter).length > 0) {
      candidates = candidates.filter(doc => {
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
    return this.documents.delete(id);
  }

  /**
   * Get a document by ID.
   */
  async get(id: string): Promise<VectorDocument | null> {
    return this.documents.get(id) || null;
  }

  /**
   * Get total document count.
   */
  get size(): number {
    return this.documents.size;
  }

  /**
   * Clear all documents.
   */
  async clear(): Promise<void> {
    this.documents.clear();
  }

  /**
   * Get all documents (for debugging/inspection).
   */
  getAll(): VectorDocument[] {
    return Array.from(this.documents.values());
  }

  // ─── Persistence ─────────────────────────────────────────────────────────────

  /**
   * Serialize the store (metric, limit and documents) to a plain object.
   */
  toJSON(): VectorStoreJSON {
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
  static fromJSON(
    data: VectorStoreJSON | string,
    options: VectorStoreOptions = {}
  ): VectorStore {
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
  async save(filePath: string): Promise<void> {

    await fsp.mkdir(nodePath.dirname(filePath), { recursive: true });
    const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fsp.writeFile(tmp, JSON.stringify(this.toJSON()), 'utf8');
      await fsp.rename(tmp, filePath);
    } catch (err) {
      await fsp.rm(tmp, { force: true }).catch(() => {});
      throw err;
    }
  }

  /**
   * Replace this store's documents with those saved at `filePath`.
   * The store keeps its own metric / maxDocuments settings
   * (use VectorStore.fromJSON to restore those too).
   */
  async load(filePath: string): Promise<this> {
    const parsed = VectorStore.parseJSON(await fsp.readFile(filePath, 'utf8'));
    this.replaceDocuments(parsed.documents);
    return this;
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  private static parseJSON(data: VectorStoreJSON | string): VectorStoreJSON {
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    if (!parsed || !Array.isArray(parsed.documents)) {
      throw new Error('Invalid VectorStore data: expected { documents: [...] }');
    }
    return parsed;
  }

  private replaceDocuments(documents: VectorDocument[]): void {
    const next = new Map<string, VectorDocument>();
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
  private enforceLimit(): void {
    let excess = this.documents.size - this.maxDocuments;
    if (excess <= 0) return;

    for (const id of this.documents.keys()) {
      if (excess-- <= 0) break;
      this.documents.delete(id);
    }
  }

  private computeSimilarity(a: number[], b: number[]): number {
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
