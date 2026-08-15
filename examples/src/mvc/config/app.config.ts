/**
 * AxilJS MVC Example — App Configuration
 */

import { loadEnv, defineConfig } from '@axiljs/config'

loadEnv()

export const config = defineConfig({
  PORT:       { type: 'number', default: 3001 },
  HOST:       { type: 'string', default: '127.0.0.1' },
  NODE_ENV:   { type: 'string', default: 'development' },
  JWT_SECRET: { type: 'string', default: 'axiljs-mvc-secret-minimum-32-chars!!' }
})