/**
 * __APP_NAME__
 * Entry point: read the environment, start the chat server, shut down cleanly.
 */

import { loadEnv, defineConfig } from '@axiljs/config'
import { Logger } from '@axiljs/observability'
import type { LogLevel } from '@axiljs/observability'
import { createChatServer } from './app.js'

loadEnv()

const config = defineConfig({
  PORT:                    { type: 'number', default: 3002 },
  HOST:                    { type: 'string', default: '127.0.0.1' },
  NODE_ENV:                { type: 'string', default: 'development' },
  LOG_LEVEL:               { type: 'string', default: 'info', enum: ['debug', 'info', 'warn', 'error'] },
  CHAT_HISTORY_LIMIT:      { type: 'number', default: 50, min: 0, max: 1000 },
  CHAT_MAX_MESSAGE_LENGTH: { type: 'number', default: 500, min: 1, max: 4000 },
  CHAT_RATE_LIMIT:         { type: 'number', default: 5, min: 1 },
  CHAT_RATE_WINDOW_MS:     { type: 'number', default: 5000, min: 100 },
  WS_HEARTBEAT_MS:         { type: 'number', default: 30000, min: 0 }
})

const logger = new Logger({
  name:   'chat',
  level:  config.LOG_LEVEL as LogLevel,
  format: config.NODE_ENV === 'production' ? 'json' : 'pretty'
})

const server = createChatServer({
  logger,
  env:                 config.NODE_ENV,
  historyLimit:        config.CHAT_HISTORY_LIMIT,
  maxMessageLength:    config.CHAT_MAX_MESSAGE_LENGTH,
  rateLimit:           { messages: config.CHAT_RATE_LIMIT, windowMs: config.CHAT_RATE_WINDOW_MS },
  heartbeatIntervalMs: config.WS_HEARTBEAT_MS
})

const { port } = await server.listen(config.PORT, config.HOST)
logger.info('Chat ready', { ui: `http://localhost:${port}`, ws: `ws://localhost:${port}/ws` })

let shuttingDown = false
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  logger.info('Shutting down', { signal })
  await server.close()
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
