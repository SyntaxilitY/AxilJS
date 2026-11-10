/**
 * Test helpers: a quiet server factory and a small promise-based wrapper
 * around Node's built-in WebSocket client.
 */

import { Logger } from '@axiljs/observability'
import { createChatServer } from './app.js'
import type { ChatServer, ChatServerOptions } from './app.js'
import type { ServerMessage } from './chat/protocol.js'

export function createTestServer(options: ChatServerOptions = {}): ChatServer {
  return createChatServer({
    logger:          new Logger({ name: 'chat-test', level: 'fatal' }),
    requestLogging:  false,
    publicDir:       false,
    ...options
  })
}

type Received = ServerMessage & Record<string, unknown>

export class TestSocket {
  private readonly inbox: Received[] = []
  private readonly waiters: Array<{ match: (m: Received) => boolean, resolve: (m: Received) => void }> = []

  private constructor(private readonly ws: WebSocket) {
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as Received
      const i = this.waiters.findIndex(w => w.match(message))
      if (i === -1) this.inbox.push(message)
      else this.waiters.splice(i, 1)[0].resolve(message)
    })
  }

  static connect(port: number): Promise<TestSocket> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`)
      const socket = new TestSocket(ws)
      ws.addEventListener('open', () => resolve(socket), { once: true })
      ws.addEventListener('error', () => reject(new Error('WebSocket connection failed')), { once: true })
    })
  }

  send(message: Record<string, unknown>): void {
    this.ws.send(JSON.stringify(message))
  }

  /** Next message of the given type (buffered or future). */
  next<T extends ServerMessage['type']>(type: T, timeoutMs = 2000): Promise<Extract<ServerMessage, { type: T }>> {
    const match = (m: Received): boolean => m.type === type
    const i = this.inbox.findIndex(match)
    if (i !== -1) return Promise.resolve(this.inbox.splice(i, 1)[0] as Extract<ServerMessage, { type: T }>)

    return new Promise((resolve, reject) => {
      const waiter = {
        match,
        resolve: (m: Received) => {
          clearTimeout(timer)
          resolve(m as Extract<ServerMessage, { type: T }>)
        }
      }
      const timer = setTimeout(() => {
        this.waiters.splice(this.waiters.indexOf(waiter), 1)
        reject(new Error(`Timed out waiting for "${type}"`))
      }, timeoutMs)
      this.waiters.push(waiter)
    })
  }

  close(): Promise<void> {
    if (this.ws.readyState === WebSocket.CLOSED) return Promise.resolve()
    return new Promise(resolve => {
      this.ws.addEventListener('close', () => resolve(), { once: true })
      this.ws.close()
    })
  }
}
