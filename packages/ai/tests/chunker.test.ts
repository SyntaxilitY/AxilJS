import { describe, it, expect } from 'vitest';
import { DocumentChunker } from '../src/rag/chunker';

const META = { source: 'test', type: 'text' };

function para(n: number, word: string): string {
  return Array.from({ length: n }, (_, i) => `${word}${i}`).join(' ') + '.';
}

describe('DocumentChunker', () => {
  it('returns a short document as a single exact chunk', () => {
    const chunker = new DocumentChunker({ chunkSize: 100, overlap: 10, minChunkSize: 1 });
    const content = 'Hello world.\n\nSecond para.';
    const chunks = chunker.chunkDocument({ id: 'd', content, metadata: { source: 's', type: 'text' } });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      id: 'd-chunk-0', content, documentId: 'd', chunkIndex: 0, startChar: 0, endChar: content.length,
      metadata: { source: 's', type: 'text' }
    });
  });

  it('fixed strategy: offsets match slices exactly, with overlap', () => {
    const content = 'abcdefghijklmnopqrstuvwxyz'.repeat(3) + 'END';
    const chunker = new DocumentChunker({ strategy: 'fixed', chunkSize: 20, overlap: 5, minChunkSize: 1 });
    const chunks = chunker.chunkDocument({ id: 'f', content, metadata: META });
    expect(chunks.length).toBeGreaterThan(3);
    chunks.forEach((c, i) => {
      expect(c.startChar).toBe(i * 15);
      expect(content.slice(c.startChar, c.endChar)).toBe(c.content);
    });
  });

  it('recursive strategy: offsets point into the original text when separators are not single spaces', () => {
    const paragraphs = [para(12, 'alpha'), para(12, 'beta'), para(12, 'gamma'), para(12, 'delta'), para(12, 'eps')];
    const content = paragraphs.join('\n\n\n');
    const chunker = new DocumentChunker({ chunkSize: 160, overlap: 30, minChunkSize: 1 });
    const chunks = chunker.chunkDocument({ id: 'r', content, metadata: META });

    expect(chunks.length).toBeGreaterThan(2);
    // Chunk content is merged with single spaces (unchanged behavior)...
    expect(chunks.some(c => !content.includes(c.content))).toBe(true);

    let prevStart = -1;
    for (const c of chunks) {
      // ...but the offsets now map to the corresponding original span
      const span = content.slice(c.startChar, c.endChar);
      expect(span.replace(/\s+/g, ' ')).toBe(c.content);
      expect(c.startChar).toBeGreaterThanOrEqual(prevStart);
      prevStart = c.startChar;
    }
    expect(chunks[0].startChar).toBe(0);
    expect(chunks[chunks.length - 1].endChar).toBe(content.length);
  });

  it("handles the '. ' separator (periods dropped from merged content)", () => {
    const sentences = Array.from({ length: 30 }, (_, i) => `Sentence number ${i} talks about topic ${i}`);
    const content = sentences.join('. ') + '.';
    const chunker = new DocumentChunker({ chunkSize: 120, overlap: 0, minChunkSize: 1 });
    const chunks = chunker.chunkDocument({ id: 's', content, metadata: META });
    expect(chunks.length).toBeGreaterThan(3);

    for (const c of chunks) {
      expect(c.startChar).toBeGreaterThanOrEqual(0);
      const span = content.slice(c.startChar, c.endChar);
      // Same words in the same order; the original span just keeps its periods
      expect(span.replace(/\.(?=\s)/g, '')).toBe(c.content);
    }
    // Chunks never point back at the start of the document
    expect(chunks[1].startChar).toBeGreaterThan(0);
  });

  it('drops chunks below minChunkSize but keeps indices stable', () => {
    const chunker = new DocumentChunker({ strategy: 'paragraph', chunkSize: 30, overlap: 0, minChunkSize: 10 });
    const content = 'tiny\n\n' + 'this paragraph is long enough\n\n' + 'ok';
    const chunks = chunker.chunkDocument({ id: 'p', content, metadata: META });
    for (const c of chunks) {
      expect(c.content.length).toBeGreaterThanOrEqual(10);
      expect(content.slice(c.startChar, c.endChar).replace(/\s+/g, ' ')).toBe(c.content);
    }
  });

  it('keeps a non-empty document shorter than minChunkSize as one chunk', () => {
    const chunker = new DocumentChunker(); // minChunkSize defaults to 50
    const content = '  AxilJS supports PostgreSQL.  ';
    const chunks = chunker.chunk([
      { id: 's', content, metadata: META },
      { id: 'e', content: '  \n\n ', metadata: META }
    ]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ id: 's-chunk-0', documentId: 's', chunkIndex: 0, metadata: META });
    expect(chunks[0].content.trim()).toBe('AxilJS supports PostgreSQL.');
    expect(content.slice(chunks[0].startChar, chunks[0].endChar).trim()).toBe('AxilJS supports PostgreSQL.');

    // Same for strategies that split into pieces that are each too small
    const para = new DocumentChunker({ strategy: 'paragraph', chunkSize: 1000, minChunkSize: 500 });
    expect(para.chunkDocument({ id: 'p', content: 'a\n\nb', metadata: META })).toHaveLength(1);
  });

  it('chunk() handles multiple documents', () => {
    const chunker = new DocumentChunker({ chunkSize: 50, overlap: 0, minChunkSize: 1 });
    const chunks = chunker.chunk([
      { id: 'a', content: 'first doc', metadata: META },
      { id: 'b', content: 'second doc', metadata: META }
    ]);
    expect(chunks.map(c => c.id)).toEqual(['a-chunk-0', 'b-chunk-0']);
  });
});
