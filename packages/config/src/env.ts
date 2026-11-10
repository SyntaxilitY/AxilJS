/**
 * Environment variable loader.
 * Reads .env files and populates process.env.
 * No external dependencies - pure Node.js.
 *
 * Supports:
 *   KEY=value
 *   KEY="value with spaces"
 *   KEY='value with spaces'
 *   # comments
 *   multiline values (quoted)
 */

import { readFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';

// ─── Env Loader ───────────────────────────────────────────────────────────────

export interface EnvLoadOptions {
  // Path to .env file (default: process.cwd()/.env)
  path?: string;

  // If true, existing process.env values are NOT overwritten
  // (default: false - .env takes priority over system env)
  override?: boolean;

  // Additional .env files to load in order
  // e.g. ['.env', '.env.local', '.env.production']
  files?: string[];
}

/**
 * Load environment variables from .env file(s) into process.env.
 *
 * Usage:
 *   loadEnv()
 *   loadEnv({ path: '/custom/path/.env' })
 *   loadEnv({ files: ['.env', '.env.local'] })
 */
export function loadEnv(options: EnvLoadOptions = {}): void {
  const cwd = process.cwd();
  const override = options.override ?? false;

  // Determine which files to load
  const files = options.files
    ? options.files.map(f => resolve(cwd, f))
    : [options.path || join(cwd, '.env')];

  for (const filePath of files) {
    if (!existsSync(filePath)) {
      // File doesn't exist - silently skip
      continue;
    }

    try {
      const content = readFileSync(filePath, 'utf-8');
      const parsed = parseEnvFile(content);

      // Populate process.env
      for (const [key, value] of Object.entries(parsed)) {
        if (override || !(key in process.env)) {
          process.env[key] = value;
        }
      }
    } catch (error) {
      console.warn(
        `[AxilJS Config] Warning: Could not load env file ${filePath}:`,
        (error as Error).message
      );
    }
  }
}

/**
 * Index of the first unescaped `quote` in str at or after `from`, or -1.
 * Backslash escapes only exist inside double quotes.
 */
function findClosingQuote(str: string, quote: string, from: number): number {
  for (let i = from; i < str.length; i++) {
    if (quote === '"' && str[i] === '\\') {
      i++; // skip the escaped character
      continue;
    }
    if (str[i] === quote) return i;
  }
  return -1;
}

/**
 * Parse the content of a .env file into key-value pairs.
 * Handles comments, quoted values, multiline quoted values and whitespace.
 *
 *   KEY=value # comment   -> value
 *   KEY="a\nb"            -> a<newline>b   (\n is expanded in double quotes)
 *   KEY='a\nb'            -> a\nb          (single quotes are literal)
 *   KEY="line 1
 *   line 2"               -> line 1<newline>line 2
 */
export function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  // Accept CRLF and LF files alike
  const lines = content.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Skip empty lines and comments
    if (!line || line.startsWith('#')) continue;

    // Find the first = sign
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;

    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();

    if (!key) continue;

    const quote = value[0];
    let quoted: string | null = null;

    if (quote === '"' || quote === "'") {
      const closeIndex = findClosingQuote(value, quote, 1);

      if (closeIndex !== -1) {
        const rest = value.slice(closeIndex + 1).trim();
        if (!rest || rest.startsWith('#')) {
          // KEY="value"  or  KEY="value" # comment
          quoted = value.slice(1, closeIndex);
        } else if (value.endsWith(quote)) {
          quoted = value.slice(1, -1);
        }
      } else if (value.length > 1 && value.endsWith(quote)) {
        // e.g. KEY="ends with \" - the last quote still closes the value
        quoted = value.slice(1, -1);
      } else {
        // No closing quote on this line: the value continues on the
        // following lines (kept verbatim) up to the closing quote.
        const lineBreaks: string[] = [value.slice(1)];
        for (let j = i + 1; j < lines.length; j++) {
          const close = findClosingQuote(lines[j], quote, 0);
          if (close === -1) {
            lineBreaks.push(lines[j]);
            continue;
          }
          lineBreaks.push(lines[j].slice(0, close));
          quoted = lineBreaks.join('\n');
          i = j;
          break;
        }
        // Never closed: fall back to the single-line handling below
      }
    }

    if (quoted !== null) {
      // Escape sequences are processed in double-quoted values only
      if (quote === '"' && quoted.includes('\\n')) {
        quoted = quoted.replace(/\\n/g, '\n');
      }
      result[key] = quoted;
      continue;
    }

    // Remove inline comments (value=something # comment)
    // Only for unquoted values
    const commentIndex = value.indexOf(' #');
    if (commentIndex !== -1) {
      value = value.slice(0, commentIndex).trim();
    }

    result[key] = value;
  }

  return result;
}
