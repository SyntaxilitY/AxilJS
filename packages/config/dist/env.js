"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadEnv = loadEnv;
const fs_1 = require("fs");
const path_1 = require("path");
/**
 * Load environment variables from .env file(s) into process.env.
 *
 * Usage:
 *   loadEnv()
 *   loadEnv({ path: '/custom/path/.env' })
 *   loadEnv({ files: ['.env', '.env.local'] })
 */
function loadEnv(options = {}) {
    const cwd = process.cwd();
    const override = options.override ?? false;
    // Determine which files to load
    const files = options.files
        ? options.files.map(f => (0, path_1.join)(cwd, f))
        : [options.path || (0, path_1.join)(cwd, '.env')];
    for (const filePath of files) {
        if (!(0, fs_1.existsSync)(filePath)) {
            // File doesn't exist - silently skip
            continue;
        }
        try {
            const content = (0, fs_1.readFileSync)(filePath, 'utf-8');
            const parsed = parseEnvFile(content);
            // Populate process.env
            for (const [key, value] of Object.entries(parsed)) {
                if (override || !(key in process.env)) {
                    process.env[key] = value;
                }
            }
        }
        catch (error) {
            console.warn(`[@axilJS Config] Warning: Could not load env file ${filePath}:`, error.message);
        }
    }
}
/**
 * Parse the content of a .env file into key-value pairs.
 * Handles comments, quoted values, and whitespace.
 */
function parseEnvFile(content) {
    const result = {};
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        // Skip empty lines and comments
        if (!line || line.startsWith('#'))
            continue;
        // Find the first = sign
        const eqIndex = line.indexOf('=');
        if (eqIndex === -1)
            continue;
        const key = line.slice(0, eqIndex).trim();
        let value = line.slice(eqIndex + 1).trim();
        if (!key)
            continue;
        // Handle quoted values - strip surrounding quotes
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
            // Handle escape sequences in double-quoted strings
            if (value.includes('\\n')) {
                value = value.replace(/\\n/g, '\n');
            }
        }
        // Remove inline comments (value=something # comment)
        // Only for unquoted values
        else {
            const commentIndex = value.indexOf(' #');
            if (commentIndex !== -1) {
                value = value.slice(0, commentIndex).trim();
            }
        }
        result[key] = value;
    }
    return result;
}
//# sourceMappingURL=env.js.map