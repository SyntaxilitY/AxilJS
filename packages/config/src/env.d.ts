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
//# sourceMappingURL=env.d.ts.map