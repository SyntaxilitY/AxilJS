/**
 * Typed configuration, read from environment variables.
 * loadEnv() in src/main.ts fills process.env from .env first.
 */

import { defineConfig } from '@axiljs/config'

export function loadConfig(source: Record<string, string | undefined> = process.env) {
  return defineConfig({
    PORT:        { type: 'number', default: 3000, min: 0, max: 65535 },
    HOST:        { type: 'string', default: '127.0.0.1' },
    NODE_ENV:    { type: 'string', default: 'development', enum: ['development', 'production', 'test'] },
    // "*" or a comma-separated list of allowed origins
    CORS_ORIGIN: { type: 'string', default: '*' }
  }, source)
}

export type Config = ReturnType<typeof loadConfig>
