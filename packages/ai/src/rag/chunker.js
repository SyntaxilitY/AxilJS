"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentChunker = void 0;
// ─── Chunker ─────────────────────────────────────────────────────────────────
class DocumentChunker {
    chunkSize;
    overlap;
    strategy;
    minChunkSize;
    constructor(options = {}) {
        this.chunkSize = options.chunkSize ?? 1000;
        this.overlap = options.overlap ?? 200;
        this.strategy = options.strategy ?? 'recursive';
        this.minChunkSize = options.minChunkSize ?? 50;
    }
    /**
     * Split an array of documents into chunks.
     */
    chunk(documents) {
        const chunks = [];
        for (const doc of documents) {
            const docChunks = this.chunkDocument(doc);
            chunks.push(...docChunks);
        }
        return chunks;
    }
    /**
     * Split a single document into chunks.
     */
    chunkDocument(document) {
        const texts = this.splitText(document.content);
        const chunks = [];
        let charOffset = 0;
        texts.forEach((text, index) => {
            if (text.length < this.minChunkSize)
                return;
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
    splitText(text) {
        switch (this.strategy) {
            case 'fixed': return this.fixedSplit(text);
            case 'sentence': return this.sentenceSplit(text);
            case 'paragraph': return this.paragraphSplit(text);
            case 'recursive': return this.recursiveSplit(text);
            default: return this.recursiveSplit(text);
        }
    }
    /**
     * Fixed-size splitting: split every N characters with overlap.
     */
    fixedSplit(text) {
        const chunks = [];
        let start = 0;
        while (start < text.length) {
            const end = Math.min(start + this.chunkSize, text.length);
            chunks.push(text.slice(start, end));
            start += this.chunkSize - this.overlap;
            if (start >= text.length)
                break;
        }
        return chunks;
    }
    /**
     * Sentence-aware splitting.
     * Tries to keep sentences together.
     */
    sentenceSplit(text) {
        // Split on sentence boundaries: ., !, ? followed by space or newline
        const sentences = text.split(/(?<=[.!?])\s+/);
        return this.mergeSmallChunks(sentences);
    }
    /**
     * Paragraph-aware splitting.
     * Splits on double newlines.
     */
    paragraphSplit(text) {
        const paragraphs = text.split(/\n\n+/).filter(p => p.trim());
        return this.mergeSmallChunks(paragraphs);
    }
    /**
     * Recursive splitting.
     * Tries separators in order of preference:
     *   paragraph → sentence → line → word → character
     */
    recursiveSplit(text) {
        // If text fits in one chunk, return it
        if (text.length <= this.chunkSize) {
            return text.trim() ? [text] : [];
        }
        // Separators tried in order
        const separators = ['\n\n', '\n', '. ', ' ', ''];
        for (const sep of separators) {
            if (!text.includes(sep) && sep !== '')
                continue;
            const parts = sep ? text.split(sep) : text.split('');
            const chunks = this.mergeSmallChunks(parts);
            // Check if chunks are now small enough
            if (chunks.every(c => c.length <= this.chunkSize)) {
                return chunks;
            }
            // Some chunks are still too large - recurse on them
            const finalChunks = [];
            for (const chunk of chunks) {
                if (chunk.length > this.chunkSize) {
                    finalChunks.push(...this.recursiveSplit(chunk));
                }
                else {
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
    mergeSmallChunks(pieces) {
        const chunks = [];
        let current = '';
        for (const piece of pieces) {
            const trimmed = piece.trim();
            if (!trimmed)
                continue;
            const candidate = current ? `${current} ${trimmed}` : trimmed;
            if (candidate.length > this.chunkSize && current) {
                // Current chunk is full - save it and start new one
                chunks.push(current.trim());
                // Include overlap from end of current chunk
                const overlapText = current.slice(-this.overlap).trim();
                current = overlapText
                    ? `${overlapText} ${trimmed}`
                    : trimmed;
            }
            else {
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
exports.DocumentChunker = DocumentChunker;
//# sourceMappingURL=chunker.js.map