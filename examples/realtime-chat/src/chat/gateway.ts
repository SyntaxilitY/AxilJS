/**
 * WebSocket gateway: turns client frames into ChatService calls, fans the
 * results out with WSServer rooms and publishes domain events.
 */

import type { WSServer, WSClient } from '@axiljs/websocket'
import type { EventBus } from '@axiljs/events'
import type { Logger } from '@axiljs/observability'
import { ChatError, ChatService } from './chat-service.js'
import { ChatEvents, type PresenceEvent } from './events.js'
import { TokenBucket } from './rate-limiter.js'
import { createMessageParser } from './protocol.js'
import type { ChatLimits, ClientMessage, ErrorCode, ServerMessage } from './protocol.js'

export interface GatewayDeps {
  wss: WSServer
  chat: ChatService
  bus: EventBus
  logger: Logger
  limits: ChatLimits
}

/** Typing notifications are relayed at most once per this interval per client. */
const TYPING_THROTTLE_MS = 1000

export function attachChatGateway({ wss, chat, bus, logger, limits }: GatewayDeps): void {
  const parse = createMessageParser(limits)

  const send = (client: WSClient, message: ServerMessage): void => {
    if (client.isOpen) client.sendJSON(message)
  }

  const sendError = (client: WSClient, code: ErrorCode, message: string, extra: { room?: string, retryAfterMs?: number } = {}): void => {
    send(client, { type: 'error', code, message, ...extra })
  }

  const leaveRoom = (client: WSClient, room: string): void => {
    wss.leave(client, room)
    const nick = chat.leave(room, client.id)
    if (nick === undefined) return

    const members = chat.members(room)
    wss.toRoomJSON(room, { type: 'presence', room, event: 'leave', nick, members } satisfies ServerMessage)
    void bus.emit<PresenceEvent>(ChatEvents.Leave, { room, nick, clientId: client.id, members: members.length })
  }

  const handle = (client: WSClient, msg: ClientMessage, bucket: TokenBucket, lastTyping: Map<string, number>): void => {
    switch (msg.type) {
      case 'join': {
        const { members, history } = chat.join(msg.room, client.id, msg.nick)
        const isNew = !client.rooms.has(msg.room)
        wss.join(client, msg.room)
        send(client, { type: 'joined', room: msg.room, nick: msg.nick, members, history })
        if (isNew) {
          wss.toRoomJSON(msg.room, { type: 'presence', room: msg.room, event: 'join', nick: msg.nick, members } satisfies ServerMessage, [client.id])
          void bus.emit<PresenceEvent>(ChatEvents.Join, { room: msg.room, nick: msg.nick, clientId: client.id, members: members.length })
        }
        return
      }

      case 'leave': {
        if (!client.rooms.has(msg.room)) throw new ChatError('NOT_IN_ROOM', `You are not in #${msg.room}`)
        leaveRoom(client, msg.room)
        send(client, { type: 'left', room: msg.room })
        return
      }

      case 'message': {
        if (!bucket.take()) {
          sendError(client, 'RATE_LIMITED', 'Slow down: too many messages', { room: msg.room, retryAfterMs: bucket.retryAfterMs() })
          return
        }
        const message = chat.post(msg.room, client.id, msg.text)
        lastTyping.delete(msg.room)
        wss.toRoomJSON(msg.room, { type: 'message', ...message } satisfies ServerMessage)
        void bus.emit(ChatEvents.Message, message)
        return
      }

      case 'typing': {
        const nick = chat.nickIn(msg.room, client.id)
        if (nick === undefined) throw new ChatError('NOT_IN_ROOM', `You are not in #${msg.room}`)
        const now = Date.now()
        if (now - (lastTyping.get(msg.room) ?? 0) < TYPING_THROTTLE_MS) return
        lastTyping.set(msg.room, now)
        wss.toRoomJSON(msg.room, { type: 'typing', room: msg.room, nick } satisfies ServerMessage, [client.id])
        return
      }
    }
  }

  wss.on('connection', (client) => {
    const bucket = new TokenBucket(limits.rateLimit.messages, limits.rateLimit.windowMs)
    const lastTyping = new Map<string, number>()

    send(client, { type: 'welcome', clientId: client.id, limits })

    client.on('message', (data, isBinary) => {
      if (isBinary) {
        sendError(client, 'BAD_FRAME', 'Binary frames are not supported')
        return
      }

      const parsed = parse(String(data))
      if (!parsed.ok) {
        sendError(client, parsed.code, parsed.message, { room: parsed.room })
        return
      }

      try {
        handle(client, parsed.message, bucket, lastTyping)
      } catch (error) {
        if (error instanceof ChatError) {
          sendError(client, error.code, error.message, { room: parsed.message.room })
        } else {
          logger.error('Gateway error', { clientId: client.id, error: (error as Error).message })
          sendError(client, 'INTERNAL_ERROR', 'Something went wrong')
        }
      }
    })

    client.on('error', (error) => {
      logger.warn('Socket error', { clientId: client.id, error: error.message })
    })

    // WSServer has already dropped the client from its rooms; announce the
    // departure in every room it was in (client.rooms is left intact).
    client.on('close', () => {
      for (const room of [...client.rooms]) leaveRoom(client, room)
    })
  })
}
