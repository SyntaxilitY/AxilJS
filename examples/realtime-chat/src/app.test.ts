import { describe, it, expect } from '@axiljs/testing'
import { createTestClient } from '@axiljs/testing'
import { createTestServer } from './test-helpers.js'
import { TokenBucket } from './chat/rate-limiter.js'
import { createMessageParser } from './chat/protocol.js'

describe('REST API', () => {
  const server = createTestServer()
  const client = createTestClient(server.app)

  it('GET /health reports ok', async () => {
    const res = await client.get('/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.clients).toBe(0)
  })

  it('GET /rooms lists rooms with member and message counts', async () => {
    const empty = await client.get('/rooms')
    expect(empty.status).toBe(200)
    expect(empty.body.data).toEqual([])

    server.chat.join('general', 'c1', 'alice')
    server.chat.join('general', 'c2', 'bob')
    server.chat.join('random', 'c1', 'alice')
    server.chat.post('general', 'c1', 'hello')

    const res = await client.get('/rooms')
    expect(res.body.data).toHaveLength(2)
    expect(res.body.data[0]).toMatchObject({ name: 'general', members: 2, messages: 1 })
    expect(res.body.data[1]).toMatchObject({ name: 'random', members: 1, messages: 0 })
  })

  it('GET /rooms/:room/history returns members and messages', async () => {
    const res = await client.get('/rooms/general/history')
    expect(res.status).toBe(200)
    expect(res.body.data.members).toEqual(['alice', 'bob'])
    expect(res.body.data.messages[0]).toMatchObject({ nick: 'alice', text: 'hello', room: 'general' })
  })

  it('GET /rooms/:room/history 404s for unknown rooms', async () => {
    const res = await client.get('/rooms/nowhere/history')
    expect(res.status).toBe(404)
  })

  it('GET /rooms/:room/history 422s for invalid room names', async () => {
    const res = await client.get('/rooms/NOT%20VALID/history')
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })
})

describe('ChatService', () => {
  it('keeps only the last N messages per room', () => {
    const server = createTestServer({ historyLimit: 3 })
    server.chat.join('lobby', 'c1', 'alice')
    for (let i = 1; i <= 5; i++) server.chat.post('lobby', 'c1', `msg ${i}`)
    expect(server.chat.history('lobby')!.map(m => m.text)).toEqual(['msg 3', 'msg 4', 'msg 5'])
  })

  it('rejects a nick already used in the room', () => {
    const server = createTestServer()
    server.chat.join('lobby', 'c1', 'alice')
    expect(() => server.chat.join('lobby', 'c2', 'Alice')).toThrow('already in #lobby')
  })
})

describe('TokenBucket', () => {
  it('allows a burst, then refills over the window', () => {
    let now = 0
    const bucket = new TokenBucket(2, 1000, () => now)
    expect(bucket.take()).toBe(true)
    expect(bucket.take()).toBe(true)
    expect(bucket.take()).toBe(false)
    expect(bucket.retryAfterMs()).toBe(500)
    now = 500
    expect(bucket.take()).toBe(true)
  })
})

describe('protocol', () => {
  const parse = createMessageParser({ maxMessageLength: 10 })

  it('accepts and trims valid frames', () => {
    const result = parse(JSON.stringify({ type: 'message', room: 'general', text: '  hi  ' }))
    expect(result).toEqual({ ok: true, message: { type: 'message', room: 'general', text: 'hi' } })
  })

  it('maps validation failures to protocol error codes', () => {
    const code = (frame: unknown): string | undefined => {
      const result = parse(typeof frame === 'string' ? frame : JSON.stringify(frame))
      return result.ok ? undefined : result.code
    }
    expect(code('{nope')).toBe('BAD_JSON')
    expect(code({ type: 'shout', room: 'general' })).toBe('INVALID_MESSAGE')
    expect(code({ type: 'join', room: 'Bad Room', nick: 'alice' })).toBe('INVALID_ROOM')
    expect(code({ type: 'join', room: 'general', nick: '' })).toBe('INVALID_NICK')
    expect(code({ type: 'message', room: 'general', text: '   ' })).toBe('EMPTY_MESSAGE')
    expect(code({ type: 'message', room: 'general', text: 'x'.repeat(11) })).toBe('MESSAGE_TOO_LONG')
  })
})
