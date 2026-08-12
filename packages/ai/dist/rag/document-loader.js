"use strict";
/**
 * Document Loaders for RAG pipeline.
 * Load text from various sources: strings, files, URLs, etc.
 * The loaded documents are then chunked and embedded.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadFromText = loadFromText;
exports.loadFromString = loadFromString;
exports.loadFromFiles = loadFromFiles;
exports.loadFromUrls = loadFromUrls;
const fs_1 = require("fs");
const path_1 = require("path");
// ─── Text Loader ─────────────────────────────────────────────────────────────
/**
 * Load documents from plain text strings.
 * The simplest loader - just wrap strings in document format.
 */
function loadFromText(texts, source = 'text') {
    return texts.map((content, i) => ({
        id: `${source}-${i}`,
        content: content.trim(),
        metadata: { source, type: 'text', index: i }
    }));
}
/**
 * Load a single text document.
 */
function loadFromString(content, id = 'doc-1', metadata = {}) {
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
function loadFromFiles(filePaths) {
    const documents = [];
    for (const filePath of filePaths) {
        if (!(0, fs_1.existsSync)(filePath)) {
            console.warn(`[REstJS AI] File not found: ${filePath}`);
            continue;
        }
        try {
            const content = (0, fs_1.readFileSync)(filePath, 'utf-8');
            const ext = (0, path_1.extname)(filePath).toLowerCase();
            let textContent = content;
            // For JSON files, convert to readable text
            if (ext === '.json') {
                try {
                    const parsed = JSON.parse(content);
                    textContent = JSON.stringify(parsed, null, 2);
                }
                catch {
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
        }
        catch (error) {
            console.warn(`[REstJS AI] Could not load file ${filePath}:`, error.message);
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
async function loadFromUrls(urls) {
    const documents = [];
    for (const url of urls) {
        try {
            const content = await fetchUrl(url);
            const text = stripHtml(content);
            documents.push({
                id: url,
                content: text.trim(),
                metadata: { source: url, type: 'url' }
            });
        }
        catch (error) {
            console.warn(`[REstJS AI] Could not load URL ${url}:`, error.message);
        }
    }
    return documents;
}
/**
 * Fetch content from a URL using Node.js built-in https.
 */
function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        const transport = url.startsWith('https') ? require('https') : require('http');
        transport.get(url, (res) => {
            // Handle redirects
            if (res.statusCode === 301 || res.statusCode === 302) {
                fetchUrl(res.headers.location).then(resolve).catch(reject);
                return;
            }
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => resolve(data));
            res.on('error', reject);
        }).on('error', reject);
    });
}
/**
 * Strip HTML tags and decode basic entities.
 */
function stripHtml(html) {
    return html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ')
        .trim();
}
//# sourceMappingURL=document-loader.js.map