/**
 * Document Loaders for RAG pipeline.
 * Load text from various sources: strings, files, URLs, etc.
 * The loaded documents are then chunked and embedded.
 */
export interface RawDocument {
    id: string;
    content: string;
    metadata: {
        source: string;
        type: string;
        [key: string]: unknown;
    };
}
/**
 * Load documents from plain text strings.
 * The simplest loader - just wrap strings in document format.
 */
export declare function loadFromText(texts: string[], source?: string): RawDocument[];
/**
 * Load a single text document.
 */
export declare function loadFromString(content: string, id?: string, metadata?: Record<string, unknown>): RawDocument;
/**
 * Load documents from files on disk.
 * Supports: .txt, .md, .json (as text), .csv (as text)
 */
export declare function loadFromFiles(filePaths: string[]): RawDocument[];
/**
 * Load documents from URLs.
 * Fetches the URL and extracts plain text content.
 * Strips HTML tags for web pages.
 */
export declare function loadFromUrls(urls: string[]): Promise<RawDocument[]>;
//# sourceMappingURL=document-loader.d.ts.map