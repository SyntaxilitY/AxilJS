/**
 * Document Loaders for RAG pipeline.
 * Load text from various sources: strings, files, URLs, etc.
 * The loaded documents are then chunked and embedded.
 */

import { readFileSync, existsSync } from 'fs';
import { extname } from 'path';

// ─── Document ─────────────────────────────────────────────────────────────────

export interface RawDocument {
  // Unique identifier
  id: string;

  // Text content
  content: string;

  // Source information
  metadata: {
    source: string;
    type: string;
    [key: string]: unknown;
  };
}

// ─── Text Loader ─────────────────────────────────────────────────────────────

/**
 * Load documents from plain text strings.
 * The simplest loader - just wrap strings in document format.
 */
export function loadFromText(
  texts: string[],
  source: string = 'text'
): RawDocument[] {
  return texts.map((content, i) => ({
    id: `${source}-${i}`,
    content: content.trim(),
    metadata: { source, type: 'text', index: i }
  }));
}

/**
 * Load a single text document.
 */
export function loadFromString(
  content: string,
  id: string = 'doc-1',
  metadata: Record<string, unknown> = {}
): RawDocument {
  return {
    id,
    content: content.trim(),
    metadata: { source: 'string', type: 'text', ...metadata }
  };
}

// ─── File Loader ─────────────────────────────────────────────────────────────

/**
 * Load documents from files on disk.
 * Supports: .txt, .md, .json (as text), .csv (as text)
 */
export function loadFromFiles(filePaths: string[]): RawDocument[] {
  const documents: RawDocument[] = [];

  for (const filePath of filePaths) {
    if (!existsSync(filePath)) {
      console.warn(`[AxilJS AI] File not found: ${filePath}`);
      continue;
    }

    try {
      const content = readFileSync(filePath, 'utf-8');
      const ext = extname(filePath).toLowerCase();

      let textContent = content;

      // For JSON files, convert to readable text
      if (ext === '.json') {
        try {
          const parsed = JSON.parse(content);
          textContent = JSON.stringify(parsed, null, 2);
        } catch {
          textContent = content;
        }
      }

      documents.push({
        id: filePath,
        content: textContent.trim(),
        metadata: {
          source: filePath,
          type: ext.slice(1) || 'txt',
          size: content.length
        }
      });
    } catch (error) {
      console.warn(
        `[AxilJS AI] Could not load file ${filePath}:`,
        (error as Error).message
      );
    }
  }

  return documents;
}

// ─── URL Loader ──────────────────────────────────────────────────────────────

/**
 * Load documents from URLs.
 * Fetches the URL and extracts plain text content.
 * Strips HTML tags for web pages.
 */
export async function loadFromUrls(urls: string[]): Promise<RawDocument[]> {
  const documents: RawDocument[] = [];

  for (const url of urls) {
    try {
      const content = await fetchUrl(url);
      const text = stripHtml(content);

      documents.push({
        id: url,
        content: text.trim(),
        metadata: { source: url, type: 'url' }
      });
    } catch (error) {
      console.warn(
        `[AxilJS AI] Could not load URL ${url}:`,
        (error as Error).message
      );
    }
  }

  return documents;
}

/**
 * Fetch content from a URL using Node.js built-in https.
 */
function fetchUrl(url: string, redirects: number = 0): Promise<string> {
  return new Promise((resolve, reject) => {
    const transport = url.startsWith('https') ? require('https') : require('http');

    transport.get(url, (res: any) => {
      // Handle redirects (Location may be relative; cap hops to avoid loops)
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        if (redirects >= 10) {
          reject(new Error(`Too many redirects: ${url}`));
          return;
        }
        const next = new URL(res.headers.location, url).toString();
        fetchUrl(next, redirects + 1).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode >= 400) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
        return;
      }

      // Decode as UTF-8 stream so multi-byte chars split across chunks survive
      res.setEncoding('utf8');
      let data = '';
      res.on('data', (chunk: string) => (data += chunk));
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Strip HTML tags and decode basic entities.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    // &amp; last, so "&amp;lt;" decodes to "&lt;" rather than "<"
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}