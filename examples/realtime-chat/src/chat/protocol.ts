/**
 * Wire protocol: every WebSocket frame is a JSON text message.
 *
 * Client → server   { type: 'join' | 'leave' | 'message' | 'typing', room, nick?, text? }
 * Server → client   welcome · joined · left · presence · message · typing · error
 */

import { v } from '@axiljs/validation'
import type { ValidationError } from '@axiljs/validation'

/** Lowercase letters, digits, '-' and '_', up to 32 chars. */
export const ROOM_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/

/** Letters, digits, spaces, '.', '-' and '_', up to 24 chars. */
export const NICK_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} ._-]{0,23}$/u

export type ErrorCode =
  | 'BAD_JSON'
  | 'BAD_FRAME'
  | 'INVALID_MESSAGE'
  | 'INVALID_ROOM'
  | 'INVALID_NICK'
  | 'EMPTY_MESSAGE'
  | 'MESSAGE_TOO_LONG'
  | 'RATE_LIMITED'
  | 'NOT_IN_ROOM'
  | 'NICK_TAKEN'
  | 'TOO_MANY_ROOMS'
  | 'INTERNAL_ERROR'

export interface ChatLimits {
  maxMessageLength: number
  historyLimit: number
  rateLimit: { messages: number, windowMs: number }
}

export interface ChatMessage {
  id: string
  room: string
  nick: string
  text: string
  at: string
}

export type ClientMessage =
  | { type: 'join', room: string, nick: string }
  | { type: 'leave', room: string }
  | { type: 'message', room: string, text: string }
  | { type: 'typing', room: string }

export type ServerMessage =
  | { type: 'welcome', clientId: string, limits: ChatLimits }
  | { type: 'joined', room: string, nick: string, members: string[], history: ChatMessage[] }
  | { type: 'left', room: string }
  | { type: 'presence', room: string, event: 'join' | 'leave', nick: string, members: string[] }
  | ({ type: 'message' } & ChatMessage)
  | { type: 'typing', room: string, nick: string }
  | { type: 'error', code: ErrorCode, message: string, room?: string, retryAfterMs?: number }

export type ParseResult =
  | { ok: true, message: ClientMessage }
  | { ok: false, code: ErrorCode, message: string, room?: string }

/**
 * Build a parser for raw client frames. Limits are baked into the schemas,
 * so an over-long message is rejected before it reaches the chat service.
 */
export function createMessageParser(limits: Pick<ChatLimits, 'maxMessageLength'>): (raw: string) => ParseResult {
  const envelope = v.object({
    type: v.enum(['join', 'leave', 'message', 'typing']),
    room: v.string().trim().pattern(ROOM_PATTERN)
  })
  const join    = v.object({ nick: v.string().trim().pattern(NICK_PATTERN) })
  const message = v.object({ text: v.string().trim().min(1).max(limits.maxMessageLength) })

  return (raw) => {
    let input: unknown
    try {
      input = JSON.parse(raw)
    } catch {
      return { ok: false, code: 'BAD_JSON', message: 'Frames must be JSON objects' }
    }

    const head = envelope.parse(input)
    if (!head.success) {
      const error = head.errors![0]
      return error.path === 'room'
        ? { ok: false, code: 'INVALID_ROOM', message: 'Room names are 1-32 chars: a-z, 0-9, "-" or "_"' }
        : { ok: false, code: 'INVALID_MESSAGE', message: error.message }
    }

    const { type, room } = head.data!

    switch (type) {
      case 'join': {
        const body = join.parse(input)
        if (!body.success) {
          return { ok: false, code: 'INVALID_NICK', message: 'Nicknames are 1-24 letters, digits, spaces, ".", "-" or "_"', room }
        }
        return { ok: true, message: { type, room, nick: body.data!.nick } }
      }
      case 'message': {
        const body = message.parse(input)
        if (!body.success) return textError(body.errors![0], limits.maxMessageLength, room)
        return { ok: true, message: { type, room, text: body.data!.text } }
      }
      default:
        return { ok: true, message: { type, room } }
    }
  }
}

function textError(error: ValidationError, maxLength: number, room: string): ParseResult {
  if (error.code === 'MAX_LENGTH') {
    return { ok: false, code: 'MESSAGE_TOO_LONG', message: `Messages are limited to ${maxLength} characters`, room }
  }
  if (error.code === 'MIN_LENGTH') {
    return { ok: false, code: 'EMPTY_MESSAGE', message: 'Message text is empty', room }
  }
  return { ok: false, code: 'INVALID_MESSAGE', message: error.message, room }
}
