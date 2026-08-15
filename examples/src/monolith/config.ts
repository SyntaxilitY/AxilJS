/**
 * Monolith Config — E-Commerce API
 */

import { loadEnv, defineConfig } from '@axiljs/config'

loadEnv()

export const config = defineConfig({
  PORT:         { type: 'number', default: 3002 },
  HOST:         { type: 'string', default: '127.0.0.1' },
  NODE_ENV:     { type: 'string', default: 'development' },
  JWT_SECRET:   { type: 'string', default: 'axiljs-monolith-secret-32-chars!!' },
  DATABASE_URL: { type: 'string', default: 'postgresql://neondb_owner:npg_Cht0cBTzoDi2@ep-spring-silence-azxw55ks-pooler.c-3.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require' }
})