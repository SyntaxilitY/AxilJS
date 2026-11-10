/**
 * Chat domain state: rooms, members (nick per room) and bounded history.
 * Transport-agnostic — the WebSocket gateway and the REST routes both use it.
 */

import { randomUUID } from 'node:crypto'
import type { ChatMessage, ErrorCode } from './protocol.js'

export class ChatError extends Error {
  constructor(readonly code: ErrorCode, message: string) {
    super(message)
    this.name = 'ChatError'
  }
}

export interface RoomSummary {
  name: string
  members: number
  messages: number
  lastMessageAt: string | null
}

interface Room {
  name: string
  /** clientId → nick */
  members: Map<string, string>
  history: ChatMessage[]
}

export interface ChatServiceOptions {
  /** Messages kept per room and replayed on join (default 50). */
  historyLimit?: number
  /** Upper bound on rooms, so clients can't allocate unbounded state (default 100). */
  maxRooms?: number
}

export class ChatService {
  private readonly rooms = new Map<string, Room>()
  private readonly historyLimit: number
  private readonly maxRooms: number

  constructor(options: ChatServiceOptions = {}) {
    this.historyLimit = options.historyLimit ?? 50
    this.maxRooms = options.maxRooms ?? 100
  }

  /** Add a client to a room; returns the member list and the history to replay. */
  join(roomName: string, clientId: string, nick: string): { members: string[], history: ChatMessage[] } {
    let room = this.rooms.get(roomName)
    if (!room) {
      if (this.rooms.size >= this.maxRooms) {
        throw new ChatError('TOO_MANY_ROOMS', `Room limit reached (${this.maxRooms})`)
      }
      room = { name: roomName, members: new Map(), history: [] }
      this.rooms.set(roomName, room)
    }

    for (const [id, taken] of room.members) {
      if (id !== clientId && taken.toLowerCase() === nick.toLowerCase()) {
        throw new ChatError('NICK_TAKEN', `"${nick}" is already in #${roomName}`)
      }
    }

    room.members.set(clientId, nick)
    return { members: this.sortedMembers(room), history: [...room.history] }
  }

  /** Remove a client from a room; returns its nick, or undefined if it wasn't there. */
  leave(roomName: string, clientId: string): string | undefined {
    const room = this.rooms.get(roomName)
    const nick = room?.members.get(clientId)
    if (!room || nick === undefined) return undefined

    room.members.delete(clientId)
    // Empty rooms without history carry no state worth keeping
    if (room.members.size === 0 && room.history.length === 0) this.rooms.delete(roomName)
    return nick
  }

  /** Append a message from a member to the room history. */
  post(roomName: string, clientId: string, text: string): ChatMessage {
    const room = this.rooms.get(roomName)
    const nick = room?.members.get(clientId)
    if (!room || nick === undefined) {
      throw new ChatError('NOT_IN_ROOM', `Join #${roomName} before sending messages`)
    }

    const message: ChatMessage = {
      id: randomUUID(),
      room: roomName,
      nick,
      text,
      at: new Date().toISOString()
    }
    room.history.push(message)
    if (room.history.length > this.historyLimit) room.history.splice(0, room.history.length - this.historyLimit)
    return message
  }

  nickIn(roomName: string, clientId: string): string | undefined {
    return this.rooms.get(roomName)?.members.get(clientId)
  }

  members(roomName: string): string[] {
    const room = this.rooms.get(roomName)
    return room ? this.sortedMembers(room) : []
  }

  history(roomName: string): ChatMessage[] | undefined {
    const room = this.rooms.get(roomName)
    return room ? [...room.history] : undefined
  }

  listRooms(): RoomSummary[] {
    return [...this.rooms.values()]
      .map(room => ({
        name: room.name,
        members: room.members.size,
        messages: room.history.length,
        lastMessageAt: room.history.at(-1)?.at ?? null
      }))
      .sort((a, b) => b.members - a.members || a.name.localeCompare(b.name))
  }

  private sortedMembers(room: Room): string[] {
    return [...room.members.values()].sort((a, b) => a.localeCompare(b))
  }
}
