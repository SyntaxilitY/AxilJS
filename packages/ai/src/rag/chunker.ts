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

// ─── Chunk ────────────────────────────────────────────────────────────────────

export interface DocumentChunk {
  // Unique chunk ID: `${documentId}-chunk-${index}`
  id: string;

  // The chunk text
  content: string;

  // Source document ID
  documentId: string;

  // Position within source document
  chunkIndex: number;

  // Character offset in original document
  startChar: number;
  endChar: number;

  // Inherited from parent document
  metadata: Record<string, unknown>;
}

// ─── Chunker Options ──────────────────────────────────────────────────────────

export interface ChunkerOptions {
  // Maximum chunk size in characters (default: 1000)
  chunkSize?: number;

  // Overlap between consecutive chunks in characters (default: 200)
  // Overlap helps preserve context at chunk boundaries
  overlap?: number;

  // Splitting strategy (default: 'recursive')
  strategy?: 'fixed' | 'sentence' | 'paragraph' | 'recursive';

  // Minimum chunk size - discard chunks smaller than this (default: 50)
  minChunkSize?: number;
}

// ─── Chunker ─────────────────────────────────────────────────────────────────

export class DocumentChunker {
  private chunkSize: number;
  private overlap: number;
  private strategy: string;
  private minChunkSize: number;

  constructor(options: ChunkerOptions = {}) {
    this.chunkSize    = options.chunkSize    ?? 1000;
    this.overlap      = options.overlap      ?? 200;
    this.strategy     = options.strategy     ?? 'recursive';
    this.minChunkSize = options.minChunkSize ?? 50;
  }

  /**
   * Split an array of documents into chunks.
   */
  chunk(documents: RawDocument[]): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];

    for (const doc of documents) {
      const docChunks = this.chunkDocument(doc);
      chunks.push(...docChunks);
    }

    return chunks;
  }

  /**
   * Split a single document into chunks.
   */
  chunkDocument(document: RawDocument): DocumentChunk[] {
    const texts = this.splitText(document.content);
    const chunks: DocumentChunk[] = [];
    let charOffset = 0;

    texts.forEach((text, index) => {
      if (text.length < this.minChunkSize) return;

      const startChar = document.content.indexOf(text, charOffset);
      const endChar = startChar + text.length;

      chunks.push({
        id: `${document.id}-chunk-${index}`,
        content: text,
        documentId: document.id,
        chunkIndex: index,
        startChar: Math.max(0, startChar),
        endChar,
        metadata: { ...document.metadata }
      });

      charOffset = Math.max(0, endChar - this.overlap);
    });

    return chunks;
  }

  // ─── Split Strategies ────────────────────────────────────────────────────────

  private splitText(text: string): string[] {
    switch (this.strategy) {
      case 'fixed':     return this.fixedSplit(text);
      case 'sentence':  return this.sentenceSplit(text);
      case 'paragraph': return this.paragraphSplit(text);
      case 'recursive': return this.recursiveSplit(text);
      default:          return this.recursiveSplit(text);
    }
  }

  /**
   * Fixed-size splitting: split every N characters with overlap.
   */
  private fixedSplit(text: string): string[] {
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + this.chunkSize, text.length);
      chunks.push(text.slice(start, end));
      start += this.chunkSize - this.overlap;
      if (start >= text.length) break;
    }

    return chunks;
  }

  /**
   * Sentence-aware splitting.
   * Tries to keep sentences together.
   */
  private sentenceSplit(text: string): string[] {
    // Split on sentence boundaries: ., !, ? followed by space or newline
    const sentences = text.split(/(?<=[.!?])\s+/);
    return this.mergeSmallChunks(sentences);
  }

  /**
   * Paragraph-aware splitting.
   * Splits on double newlines.
   */
  private paragraphSplit(text: string): string[] {
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim());
    return this.mergeSmallChunks(paragraphs);
  }

  /**
   * Recursive splitting.
   * Tries separators in order of preference:
   *   paragraph → sentence → line → word → character
   */
  private recursiveSplit(text: string): string[] {
    // If text fits in one chunk, return it
    if (text.length <= this.chunkSize) {
      return text.trim() ? [text] : [];
    }

    // Separators tried in order
    const separators = ['\n\n', '\n', '. ', ' ', ''];

    for (const sep of separators) {
      if (!text.includes(sep) && sep !== '') continue;

      const parts = sep ? text.split(sep) : text.split('');
      const chunks = this.mergeSmallChunks(parts);

      // Check if chunks are now small enough
      if (chunks.every(c => c.length <= this.chunkSize)) {
        return chunks;
      }

      // Some chunks are still too large - recurse on them
      const finalChunks: string[] = [];
      for (const chunk of chunks) {
        if (chunk.length > this.chunkSize) {
          finalChunks.push(...this.recursiveSplit(chunk));
        } else {
          finalChunks.push(chunk);
        }
      }
      return finalChunks;
    }

    // Last resort: fixed split
    return this.fixedSplit(text);
  }

  /**
   * Merge small pieces into chunks of target size.
   */
  private mergeSmallChunks(pieces: string[]): string[] {
    const chunks: string[] = [];
    let current = '';

    for (const piece of pieces) {
      const trimmed = piece.trim();
      if (!trimmed) continue;

      const candidate = current ? `${current} ${trimmed}` : trimmed;

      if (candidate.length > this.chunkSize && current) {
        // Current chunk is full - save it and start new one
        chunks.push(current.trim());

        // Include overlap from end of current chunk
        const overlapText = current.slice(-this.overlap).trim();
        current = overlapText
          ? `${overlapText} ${trimmed}`
          : trimmed;
      } else {
        current = candidate;
      }
    }

    // Don't forget the last chunk
    if (current.trim()) {
      chunks.push(current.trim());
    }

    return chunks;
  }
}