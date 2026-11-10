# __APP_NAME__

A realtime chat server built with [AxilJS](https://github.com/SyntaxilitY/AxilJS): WebSocket rooms
with nicknames, presence, per-room history, rate limiting and a dependency-free browser client.

Generated with `axil create __APP_NAME__ --template realtime-chat`.

## What it shows

| Package | Used for |
|---|---|
| `@axiljs/core` | HTTP app, REST routes, `serveStatic` for the browser client, error handler |
| `@axiljs/websocket` | `WSServer` on `/ws`: rooms (`join`/`leave`/`toRoomJSON`), `maxPayload`, heartbeat pings |
| `@axiljs/events` | `EventBus` publishing `chat.message`, `chat.join`, `chat.leave` |
| `@axiljs/observability` | Structured `Logger` (pretty in development, JSON in production) |
| `@axiljs/validation` | Frame validation (`v.object`, `pattern`, `max`) and REST param validation |
| `@axiljs/config` | `.env` loading and typed config |
| `@axiljs/testing` | REST tests with `createTestClient`, WebSocket round trips against a real server |

Behaviour:

- **Rooms & nicknames**: a connection can join several rooms; a nick must be unique within a room.
- **Presence**: joins and leaves (including dropped connections) are broadcast with the new member list.
- **History**: the last `CHAT_HISTORY_LIMIT` messages of a room are sent to every client that joins.
- **Rate limit**: a token bucket per connection (`CHAT_RATE_LIMIT` messages per `CHAT_RATE_WINDOW_MS`).
- **Validation**: room names, nicknames and message length (`CHAT_MAX_MESSAGE_LENGTH`) are checked before
  anything reaches the chat state; frames larger than 16 KiB close the socket (`maxPayload`).
- **Heartbeat**: `WSServer` pings every `WS_HEARTBEAT_MS` and drops clients that don't answer.

## Run

```bash
npm install
cp .env.example .env        # PowerShell: Copy-Item .env.example .env
npm run dev                 # axil run: compile, start, restart on change
```

Open <http://localhost:3002> in two browser tabs, pick nicknames and join the same room.

Production: `npm run build && npm start`.

## HTTP endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/` | Browser client (`public/index.html`) |
| GET | `/health` | Liveness, connected clients, room count |
| GET | `/rooms` | Rooms with member and message counts |
| GET | `/rooms/:room/history` | Members and the stored messages of a room (404 if unknown, 422 if the name is invalid) |

```bash
curl http://localhost:3002/health
# {"status":"ok","uptime":12,"clients":2,"rooms":1,"timestamp":"..."}

curl http://localhost:3002/rooms
# {"status":200,"code":"HTTP_200_OK","message":"Rooms","data":[{"name":"general","members":2,"messages":3,"lastMessageAt":"..."}]}

curl http://localhost:3002/rooms/general/history
# {"status":200,...,"data":{"room":"general","members":["alice","bob"],"messages":[{"id":"...","room":"general","nick":"alice","text":"hi","at":"..."}]}}
```

## WebSocket protocol

Connect to `ws://localhost:3002/ws`. Every frame is a JSON object.

Client → server:

| `type` | Fields | Effect |
|---|---|---|
| `join` | `room`, `nick` | Join (or switch to) a room; you receive `joined`, the others `presence` |
| `leave` | `room` | Leave a room; you receive `left`, the others `presence` |
| `message` | `room`, `text` | Post to a room you joined; everyone in it (you included) receives `message` |
| `typing` | `room` | Others in the room receive `typing` (relayed at most once per second) |

```json
{ "type": "join", "room": "general", "nick": "alice" }
{ "type": "message", "room": "general", "text": "hello!" }
```

Server → client:

| `type` | Fields |
|---|---|
| `welcome` | `clientId`, `limits` (`maxMessageLength`, `historyLimit`, `rateLimit`) |
| `joined` | `room`, `nick`, `members[]`, `history[]` |
| `left` | `room` |
| `presence` | `room`, `event` (`join` / `leave`), `nick`, `members[]` |
| `message` | `id`, `room`, `nick`, `text`, `at` |
| `typing` | `room`, `nick` |
| `error` | `code`, `message`, optional `room`, `retryAfterMs` |

Error codes: `BAD_JSON`, `BAD_FRAME`, `INVALID_MESSAGE`, `INVALID_ROOM`, `INVALID_NICK`, `EMPTY_MESSAGE`,
`MESSAGE_TOO_LONG`, `RATE_LIMITED`, `NOT_IN_ROOM`, `NICK_TAKEN`, `TOO_MANY_ROOMS`, `INTERNAL_ERROR`.

Quick check from Node 22+ (built-in `WebSocket`):

```js
const ws = new WebSocket('ws://localhost:3002/ws')
ws.onmessage = (e) => console.log(e.data)
ws.onopen = () => {
  ws.send(JSON.stringify({ type: 'join', room: 'general', nick: 'node' }))
  ws.send(JSON.stringify({ type: 'message', room: 'general', text: 'hi from node' }))
}
```

## Domain events

The gateway publishes to an `EventBus`; `src/chat/events.ts` subscribes a logger. Add your own
subscribers (moderation, persistence, analytics) without touching the socket code:

```ts
server.bus.on('chat.message', async ({ payload }) => {
  await saveMessage(payload)
})
```

## Test

```bash
npm test                    # axil test: compiles, then runs src/**/*.test.ts
```

The suite covers the REST endpoints, the protocol parser, the token bucket and real WebSocket
round trips (join, broadcast to two clients, history on join, presence, validation and rate-limit
errors) against a server listening on a random port.

## Project structure

```
public/
  index.html               Browser client (vanilla JS, no build step)
src/
  main.ts                  Env config, listen, graceful shutdown
  app.ts                   createChatServer(): HTTP routes + WebSocket gateway
  chat/
    protocol.ts            Message types and frame validation
    chat-service.ts        Rooms, members, history (transport-agnostic)
    gateway.ts             WebSocket ↔ ChatService, rate limiting, presence
    events.ts              EventBus + logging subscriber
    rate-limiter.ts        Token bucket
    gateway.test.ts        WebSocket round-trip tests
  app.test.ts              REST, service, protocol and rate-limiter tests
  test-helpers.ts          Quiet test server + WebSocket test client
```
