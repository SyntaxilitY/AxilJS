/**
 * Document Chunker.
 * Splits large documents into smaller chunks for embedding.
 *
 * Why chunk?
 *   - Embedding models have token limits (usually 8k tokens)
 *   - Smaller chunks = more precise retrieval
 *   - Overlapping chunks preserve context across boundaries
 *
 * Strategies:
 *   - Fixed size: Split by character count
 *   - Sentence: Split on sentence boundaries
 *   - Paragraph: Split on paragraph boundaries
 *   - Recursive: Try paragraphs → sentences → words → chars
 */
import { RawDocument } from './document-loader';
export interface DocumentChunk {
    id: string;
    content: string;
    documentId: string;
    chunkIndex: number;
    startChar: number;
    endChar: number;
    metadata: Record<string, unknown>;
}
export interface ChunkerOptions {
    chunkSize?: number;
    overlap?: number;
    strategy?: 'fixed' | 'sentence' | 'paragraph' | 'recursive';
    minChunkSize?: number;
}
export declare class DocumentChunker {
    private chunkSize;
    private overlap;
    private strategy;
    private minChunkSize;
    constructor(options?: ChunkerOptions);
    /**
     * Split an array of documents into chunks.
     */
    chunk(documents: RawDocument[]): DocumentChunk[];
    /**
     * Split a single document into chunks.
     */
    chunkDocument(document: RawDocument): DocumentChunk[];
    private splitText;
    /**
     * Fixed-size splitting: split every N characters with overlap.
     */
    private fixedSplit;
    /**
     * Sentence-aware splitting.
     * Tries to keep sentences together.
     */
    private sentenceSplit;
    /**
     * Paragraph-aware splitting.
     * Splits on double newlines.
     */
    private paragraphSplit;
    /**
     * Recursive splitting.
     * Tries separators in order of preference:
     *   paragraph → sentence → line → word → character
     */
    private recursiveSplit;
    /**
     * Merge small pieces into chunks of target size.
     */
    private mergeSmallChunks;
}
//# sourceMappingURL=chunker.d.ts.map