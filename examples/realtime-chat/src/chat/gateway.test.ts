import { describe, it, expect, beforeAll, afterAll } from '@axiljs/testing'
import { createTestClient } from '@axiljs/testing'
import { createTestServer, TestSocket } from '../test-helpers.js'
import type { ChatServer } from '../app.js'
import type { axilEvent } from '@axiljs/events'

describe('WebSocket chat', () => {
  let server: ChatServer
  let port: number
  let alice: TestSocket
  let bob: TestSocket
  const events: string[] = []

  beforeAll(async () => {
    server = createTestServer({ maxMessageLength: 50 })
    server.bus.on('chat.*', (event: axilEvent) => { events.push(event.type) })
    port = (await server.listen(0)).port
    alice = await TestSocket.connect(port)
    bob = await TestSocket.connect(port)
  })

  afterAll(async () => {
    await alice.close()
    await bob.close()
    await server.close()
  })

  it('greets new connections with their id and the server limits', async () => {
    const welcome = await alice.next('welcome')
    expect(typeof welcome.clientId).toBe('string')
    expect(welcome.limits.maxMessageLength).toBe(50)
    await bob.next('welcome')
  })

  it('joins a room and announces presence to existing members', async () => {
    alice.send({ type: 'join', room: 'general', nick: 'alice' })
    const joined = await alice.next('joined')
    expect(joined.members).toEqual(['alice'])
    expect(joined.history).toEqual([])

    bob.send({ type: 'join', room: 'general', nick: 'bob' })
    const bobJoined = await bob.next('joined')
    expect(bobJoined.members).toEqual(['alice', 'bob'])

    const presence = await alice.next('presence')
    expect(presence).toMatchObject({ room: 'general', event: 'join', nick: 'bob', members: ['alice', 'bob'] })
  })

  it('broadcasts messages to everyone in the room', async () => {
    alice.send({ type: 'message', room: 'general', text: 'hello bob' })
    const [toAlice, toBob] = await Promise.all([alice.next('message'), bob.next('message')])
    expect(toBob).toMatchObject({ room: 'general', nick: 'alice', text: 'hello bob' })
    expect(toAlice.id).toBe(toBob.id)
  })

  it('relays typing notifications to the other members only', async () => {
    bob.send({ type: 'typing', room: 'general' })
    const typing = await alice.next('typing')
    expect(typing).toMatchObject({ room: 'general', nick: 'bob' })
  })

  it('sends the room history to clients that join later', async () => {
    const carol = await TestSocket.connect(port)
    carol.send({ type: 'join', room: 'general', nick: 'carol' })
    const joined = await carol.next('joined')
    expect(joined.history.map(m => m.text)).toEqual(['hello bob'])
    expect(joined.members).toEqual(['alice', 'bob', 'carol'])
    await alice.next('presence')
    await bob.next('presence')

    await carol.close()
    const left = await alice.next('presence')
    expect(left).toMatchObject({ event: 'leave', nick: 'carol', members: ['alice', 'bob'] })
    await bob.next('presence')
  })

  it('rejects invalid frames with an error message', async () => {
    alice.send({ type: 'message', room: 'general', text: 'x'.repeat(51) })
    expect((await alice.next('error')).code).toBe('MESSAGE_TOO_LONG')

    alice.send({ type: 'message', room: 'elsewhere', text: 'hi' })
    expect((await alice.next('error')).code).toBe('NOT_IN_ROOM')

    const intruder = await TestSocket.connect(port)
    intruder.send({ type: 'join', room: 'general', nick: 'Alice' })
    expect((await intruder.next('error')).code).toBe('NICK_TAKEN')
    await intruder.close()
  })

  it('leaves a room on request', async () => {
    bob.send({ type: 'leave', room: 'general' })
    expect((await bob.next('left')).room).toBe('general')
    expect((await alice.next('presence')).event).toBe('leave')

    const res = await createTestClient(server.app).get('/rooms')
    expect(res.body.data[0]).toMatchObject({ name: 'general', members: 1, messages: 1 })
  })

  it('publishes domain events on the EventBus', () => {
    expect(events).toContain('chat.join')
    expect(events).toContain('chat.message')
    expect(events).toContain('chat.leave')
  })
})

describe('WebSocket rate limiting', () => {
  it('rejects messages beyond the per-client budget', async () => {
    const server = createTestServer({ rateLimit: { messages: 2, windowMs: 60_000 } })
    const { port } = await server.listen(0)
    const socket = await TestSocket.connect(port)
    try {
      socket.send({ type: 'join', room: 'busy', nick: 'spammer' })
      await socket.next('joined')

      for (let i = 0; i < 3; i++) socket.send({ type: 'message', room: 'busy', text: `msg ${i}` })
      await socket.next('message')
      await socket.next('message')
      const error = await socket.next('error')
      expect(error.code).toBe('RATE_LIMITED')
      expect(error.retryAfterMs).toBeGreaterThan(0)
      expect(server.chat.history('busy')).toHaveLength(2)
    } finally {
      await socket.close()
      await server.close()
    }
  })
})
