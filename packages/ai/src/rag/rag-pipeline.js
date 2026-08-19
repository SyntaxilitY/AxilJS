"use strict";
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
 *     { id: '1', content: '@axiljsJS is a backend framework...', metadata: {} }
 *   ])
 *
 *   // Query
 *   const answer = await rag.query('What is @axiljsJS?')
 *   console.log(answer.response)
 *   console.log(answer.sources) // Which documents were used
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.RAGPipeline = void 0;
const vector_store_1 = require("../vector/vector-store");
const chunker_1 = require("./chunker");
// ─── Default System Prompt ────────────────────────────────────────────────────
const DEFAULT_SYSTEM_PROMPT = `You are a helpful assistant that answers questions based on the provided context documents.

Instructions:
- Answer the question using ONLY the information provided in the context below
- If the context doesn't contain enough information to answer the question, say so clearly
- Be concise and accurate
- Cite relevant parts of the context when appropriate`;
// ─── RAG Pipeline ────────────────────────────────────────────────────────────
class RAGPipeline {
    provider;
    vectorStore;
    chunker;
    options;
    // Track total tokens used
    totalEmbeddingTokens = 0;
    constructor(options) {
        this.provider = options.provider;
        this.vectorStore = options.vectorStore || new vector_store_1.VectorStore();
        this.chunker = new chunker_1.DocumentChunker({
            chunkSize: options.chunker?.chunkSize ?? 800,
            overlap: options.chunker?.overlap ?? 150
        });
        this.options = {
            generationModel: options.generationModel || this.provider.defaultModel,
            embeddingModel: options.embeddingModel || '',
            topK: options.topK ?? 5,
            minScore: options.minScore ?? 0.3,
            systemPrompt: options.systemPrompt || DEFAULT_SYSTEM_PROMPT
        };
    }
    // ─── Indexing ─────────────────────────────────────────────────────────────────
    /**
     * Index documents into the vector store.
     * Chunks documents, generates embeddings, and stores everything.
     *
     * @param documents  Raw documents to index
     */
    async index(documents) {
        console.log(`\x1b[36m[@axiljsJS AI]\x1b[0m Indexing ${documents.length} document(s)...`);
        // Step 1: Chunk documents
        const chunks = this.chunker.chunk(documents);
        console.log(`\x1b[90m[@axiljsJS AI]\x1b[0m Created ${chunks.length} chunk(s)`);
        // Step 2: Generate embeddings for all chunks
        // Batch in groups of 20 to avoid rate limits
        const BATCH_SIZE = 20;
        let processed = 0;
        for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
            const batch = chunks.slice(i, i + BATCH_SIZE);
            const texts = batch.map(c => c.content);
            const embeddingOptions = { input: texts };
            if (this.options.embeddingModel) {
                embeddingOptions.model = this.options.embeddingModel;
            }
            const result = await this.provider.embed(embeddingOptions);
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
            process.stdout.write(`\r\x1b[90m[@axiljsJS AI]\x1b[0m Embedded ${processed}/${chunks.length} chunks`);
        }
        console.log('');
        console.log(`\x1b[32m[@axiljsJS AI]\x1b[0m Indexed ${documents.length} documents ` +
            `(${chunks.length} chunks, ${this.totalEmbeddingTokens} tokens)`);
        return { documentsIndexed: documents.length, chunksCreated: chunks.length };
    }
    // ─── Query ────────────────────────────────────────────────────────────────────
    /**
     * Answer a question using retrieved context.
     *
     * @param question      The user's question
     * @param conversation  Optional conversation history for multi-turn
     */
    async query(question, conversation = []) {
        // Step 1: Embed the query
        const embeddingOptions = { input: question };
        if (this.options.embeddingModel) {
            embeddingOptions.model = this.options.embeddingModel;
        }
        const queryEmbedding = await this.provider.embed(embeddingOptions);
        const embeddingTokens = queryEmbedding.usage.totalTokens;
        // Step 2: Retrieve most similar chunks
        const searchResults = await this.vectorStore.search(queryEmbedding.embeddings[0], {
            topK: this.options.topK,
            minScore: this.options.minScore
        });
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
        const messages = [
            // Previous conversation (if any)
            ...conversation,
            // Current question with context
            {
                role: 'user',
                content: `Context Documents:\n\n${context}\n\n` +
                    `---\n\nQuestion: ${question}`
            }
        ];
        // Step 5: Generate answer
        const completion = await this.provider.complete({
            messages,
            model: this.options.generationModel,
            system: this.options.systemPrompt,
            temperature: 0.3 // Lower temperature for factual answers
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
    async *queryStream(question, conversation = []) {
        // Retrieve context (same as query())
        const queryEmbedding = await this.provider.embed({ input: question });
        const searchResults = await this.vectorStore.search(queryEmbedding.embeddings[0], { topK: this.options.topK, minScore: this.options.minScore });
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
        const messages = [
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
    getStats() {
        return {
            documentCount: this.vectorStore.size,
            embeddingTokensUsed: this.totalEmbeddingTokens
        };
    }
}
exports.RAGPipeline = RAGPipeline;
//# sourceMappingURL=rag-pipeline.js.map