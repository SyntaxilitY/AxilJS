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
export interface EnvLoadOptions {
    path?: string;
    override?: boolean;
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
export declare function loadEnv(options?: EnvLoadOptions): void;
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
export declare function parseEnvFile(content: string): Record<string, string>;
//# sourceMappingURL=env.d.ts.map