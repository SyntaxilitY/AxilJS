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
        // Chunks start at non-decreasing positions; search from the previous start
        let prevStart = -1;
        texts.forEach((text, index) => {
            const span = locateChunk(document.content, text, prevStart);
            if (span)
                prevStart = span.start;
            if (text.length < this.minChunkSize)
                return;
            const startChar = span ? span.start : 0;
            const endChar = span ? span.end : startChar + text.length;
            chunks.push({
                id: `${document.id}-chunk-${index}`,
                content: text,
                documentId: document.id,
                chunkIndex: index,
                startChar,
                endChar,
                metadata: { ...document.metadata }
            });
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
            // Always advance (overlap >= chunkSize would otherwise loop forever)
            start += Math.max(1, this.chunkSize - this.overlap);
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
            // Character level: merging single chars would join them with spaces
            // ("abc" -> "a b c"), so slice the text directly instead
            if (sep === '')
                break;
            const parts = text.split(sep);
            const chunks = this.mergeSmallChunks(parts);
            // Check if chunks are now small enough
            if (chunks.every(c => c.length <= this.chunkSize)) {
                return chunks;
            }
            // Some chunks are still too large - recurse on them
            const finalChunks = [];
            for (const chunk of chunks) {
                if (chunk.length > this.chunkSize) {
                    // Only recurse when the chunk shrank; otherwise (overlap + one
                    // oversized word) recursion reproduces it forever -> stack overflow
                    finalChunks.push(...(chunk.length < text.length
                        ? this.recursiveSplit(chunk)
                        : this.fixedSplit(chunk)));
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
                // (slice(-0) would return the whole chunk, so overlap 0 is special)
                const overlapText = this.overlap > 0
                    ? current.slice(-this.overlap).trim()
                    : '';
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
// ─── Offsets ─────────────────────────────────────────────────────────────────
function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
/**
 * Find where a chunk lives in the original text.
 *
 * Merged chunks join their pieces with a single space, while the original
 * pieces were separated by '\n\n', '\n', '. ' or other whitespace, so a
 * plain indexOf fails for them. Fall back to matching token by token, where
 * each space in the chunk stands for an optional '.' plus whitespace.
 * Chunk content itself is never changed - only the offsets are computed.
 */
function locateChunk(source, chunk, prevStart) {
    const starts = [prevStart + 1, Math.max(0, prevStart), 0];
    for (const from of starts) {
        const exact = source.indexOf(chunk, from);
        if (exact !== -1)
            return { start: exact, end: exact + chunk.length };
    }
    const tokens = chunk.split(/\s+/).filter(Boolean);
    if (tokens.length === 0)
        return null;
    const pattern = new RegExp(tokens.map(escapeRegExp).join('\\.?\\s+'), 'g');
    for (const from of starts) {
        pattern.lastIndex = from;
        const match = pattern.exec(source);
        if (match)
            return { start: match.index, end: match.index + match[0].length };
    }
    return null;
}
//# sourceMappingURL=chunker.js.map