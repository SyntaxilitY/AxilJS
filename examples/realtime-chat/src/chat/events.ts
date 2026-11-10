/**
 * Domain events. The gateway publishes them; anything else (logging here,
 * moderation, analytics, persistence) subscribes without touching the
 * WebSocket code.
 */

import { EventBus } from '@axiljs/events'
import type { Subscription } from '@axiljs/events'
import type { Logger } from '@axiljs/observability'
import type { ChatMessage } from './protocol.js'

export const ChatEvents = {
  Message: 'chat.message',
  Join:    'chat.join',
  Leave:   'chat.leave'
} as const

export interface PresenceEvent {
  room: string
  nick: string
  clientId: string
  members: number
}

export type MessageEvent = ChatMessage

export function createEventBus(logger: Logger): EventBus {
  return new EventBus({
    onError: (error, event) => logger.error('Event handler failed', { event: event.type, error: error.message })
  })
}

/** Log every chat.* event (message bodies are not logged, only their size). */
export function logChatEvents(bus: EventBus, logger: Logger): Subscription[] {
  return [
    bus.on<MessageEvent>(ChatEvents.Message, ({ payload }) => {
      logger.info('message', { room: payload.room, nick: payload.nick, chars: payload.text.length })
    }),
    bus.on<PresenceEvent>(ChatEvents.Join, ({ payload }) => {
      logger.info('join', { room: payload.room, nick: payload.nick, members: payload.members })
    }),
    bus.on<PresenceEvent>(ChatEvents.Leave, ({ payload }) => {
      logger.info('leave', { room: payload.room, nick: payload.nick, members: payload.members })
    })
  ]
}
