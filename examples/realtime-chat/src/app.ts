/**
 * Builds the chat server: HTTP app (REST + static client) and, once it is
 * listening, the WebSocket gateway on /ws. main.ts only reads the env and
 * calls listen(); tests build their own instance on port 0.
 */

import { fileURLToPath } from 'node:url'
import { Application, serveStatic, axilError } from '@axiljs/core'
import type { axilRequest, axilResponse } from '@axiljs/core'
import { WSServer } from '@axiljs/websocket'
import type { EventBus } from '@axiljs/events'
import { Logger } from '@axiljs/observability'
import { v, validate } from '@axiljs/validation'
import { ChatService } from './chat/chat-service.js'
import { createEventBus, logChatEvents } from './chat/events.js'
import { attachChatGateway } from './chat/gateway.js'
import { ROOM_PATTERN } from './chat/protocol.js'
import type { ChatLimits } from './chat/protocol.js'

export interface ChatServerOptions {
  /** Messages kept per room and sent on join (default 50). */
  historyLimit?: number
  /** Max characters per chat message (default 500). */
  maxMessageLength?: number
  /** Per-connection message budget (default 5 per 5 s). */
  rateLimit?: { messages: number, windowMs: number }
  /** Ping interval; clients missing a pong are dropped (default 30 s, 0 disables). */
  heartbeatIntervalMs?: number
  /** Max WebSocket frame size in bytes (default 16 KiB). */
  maxPayloadBytes?: number
  /** Directory with the browser client, or false to disable (default ./public). */
  publicDir?: string | false
  logger?: Logger
  /** Per-request access log (default true). */
  requestLogging?: boolean
  env?: string
}

export interface ChatServer {
  app: Application
  chat: ChatService
  bus: EventBus
  limits: ChatLimits
  /** Start HTTP + WebSocket; resolves with the bound address (port 0 → random). */
  listen(port: number, host?: string): Promise<{ port: number, host: string }>
  /** Close every socket, then the HTTP server. */
  close(): Promise<void>
}

const DEFAULT_PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url))

export function createChatServer(options: ChatServerOptions = {}): ChatServer {
  const logger = options.logger ?? new Logger({ name: 'chat' })
  const limits: ChatLimits = {
    maxMessageLength: options.maxMessageLength ?? 500,
    historyLimit:     options.historyLimit ?? 50,
    rateLimit:        options.rateLimit ?? { messages: 5, windowMs: 5000 }
  }

  const chat = new ChatService({ historyLimit: limits.historyLimit })
  const bus = createEventBus(logger)
  logChatEvents(bus, logger)

  const app = new Application({ env: options.env, logging: options.requestLogging ?? true })
  let wss: WSServer | null = null

  const publicDir = options.publicDir ?? DEFAULT_PUBLIC_DIR
  if (publicDir) app.use(serveStatic({ root: publicDir, maxAge: 0 }))

  app.get('/health', (_req, res) => {
    res.json({
      status:    'ok',
      uptime:    Math.round(process.uptime()),
      clients:   wss?.clientCount ?? 0,
      rooms:     chat.listRooms().length,
      timestamp: new Date().toISOString()
    })
  })

  app.get('/rooms', (_req, res) => {
    res.success(chat.listRooms(), 'Rooms')
  })

  app.get(
    '/rooms/:room/history',
    validate({ params: v.object({ room: v.string().pattern(ROOM_PATTERN) }) }),
    (req, res) => {
      const room = req.params.room
      const history = chat.history(room)
      if (!history) return res.notFound(`Room "${room}" not found`)
      res.success({ room, members: chat.members(room), messages: history }, 'History')
    }
  )

  // Errors carry their details (e.g. which field failed validation)
  app.use((err: Error, _req: axilRequest, res: axilResponse, _next: (error?: Error) => void) => {
    const status = err instanceof axilError ? err.statusCode : 500
    if (status >= 500) logger.error('Request failed', { error: err.message })
    res.status(status).json({
      error: {
        code:    err instanceof axilError ? err.code : 'INTERNAL_ERROR',
        message: status >= 500 ? 'Internal server error' : err.message,
        ...(err instanceof axilError && err.details !== undefined ? { details: err.details } : {})
      }
    })
  })

  return {
    app,
    chat,
    bus,
    limits,

    async listen(port, host = '127.0.0.1') {
      const address = await app.listen(port, host)
      wss = new WSServer(app.getServer()!, {
        path:                '/ws',
        maxPayload:          options.maxPayloadBytes ?? 16 * 1024,
        heartbeatIntervalMs: options.heartbeatIntervalMs ?? 30_000
      })
      attachChatGateway({ wss, chat, bus, logger, limits })
      return address
    },

    async close() {
      wss?.close(1001, 'Server shutting down')
      wss = null
      await app.close()
    }
  }
}
