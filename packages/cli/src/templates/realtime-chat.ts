/**
 * Template: realtime-chat
 *
 * A chat backend: WebSocket rooms on the app's HTTP server, JWT auth on
 * connect, validated frames, presence, per-room history over HTTP, and a
 * dependency-free browser client served from public/.
 */

import type { ProjectTemplate, TemplateContext } from './types'

export const realtimeChatTemplate: ProjectTemplate = {
  id:       'realtime-chat',
  title:    'Realtime Chat',
  summary:  'WebSocket rooms, presence, history and JWT auth',
  category: 'Realtime',
  highlights: [
    'WSServer rooms on the same port as the HTTP API',
    'JWT auth on connect: ?token= or a first auth message',
    'Validated JSON frames, presence and per-room history',
    'Browser client in public/, no build step',
    'Tests with real WebSocket round-trips on port 0'
  ],
  packages: ['@axiljs/core', '@axiljs/websocket', '@axiljs/auth', '@axiljs/validation', '@axiljs/config', '@axiljs/testing'],
  port:     3002,

  dependencies: ctx => ({
    '@axiljs/auth':       ctx.axilRange,
    '@axiljs/config':     ctx.axilRange,
    '@axiljs/core':       ctx.axilRange,
    '@axiljs/validation': ctx.axilRange,
    '@axiljs/websocket':  ctx.axilRange
  }),

  files: (ctx: TemplateContext) => ({
    'README.md': `# ${ctx.name}

A realtime chat backend on [AxilJS](https://github.com/SyntaxilitY/AxilJS), created with
\`axil create ${ctx.name} --template realtime-chat\`.

It shows how to put WebSockets next to an HTTP API on one port:

- **@axiljs/websocket**: \`WSServer\` on the app's HTTP server, rooms (\`join\`, \`leave\`, \`toRoomJSON\`), handshake guard
- **@axiljs/auth**: JWTs for both transports: \`authenticate()\` on HTTP routes, \`?token=\` or a first \`auth\` message on WebSockets
- **@axiljs/validation**: every incoming WebSocket frame is validated with \`v.object(...)\` before it is used
- **@axiljs/core**: HTTP routes, CORS, and \`serveStatic\` for the browser client in \`public/\`
- **Presence and history**: who is online per room, the last \`HISTORY_SIZE\` messages per room in a ring buffer
- **@axiljs/testing**: HTTP tests with \`createTestClient\`, plus real WebSocket round-trips against the app on a random port

## Run

\`\`\`bash
npm install
cp .env.example .env        # PowerShell: Copy-Item .env.example .env
npm run dev                 # http://localhost:3002
\`\`\`

Open http://localhost:3002 in two browser windows, pick two names and chat.
Join more rooms with the box under the room list.

Production build:

\`\`\`bash
npm run build
npm start
\`\`\`

## Test

\`\`\`bash
npm test                    # axil test: compiles with tsc, runs src/**/*.test.ts
\`\`\`

## HTTP endpoints

| Method | Path                          | Auth   | Description                                    | Success | Errors   |
|--------|-------------------------------|--------|------------------------------------------------|---------|----------|
| GET    | \`/\`                           |        | Browser client (\`public/index.html\`)           | 200     |          |
| GET    | \`/api\`                        |        | Service name, version and endpoints            | 200     |          |
| GET    | \`/health\`                     |        | Liveness: status, uptime, room count           | 200     |          |
| POST   | \`/api/token\`                  |        | Demo sign-in \`{ "name": "Ada" }\` (DEMO_LOGIN)  | 201     | 422      |
| GET    | \`/api/rooms\`                  | Bearer | Rooms with \`online\` and \`messages\` counts      | 200     | 401      |
| GET    | \`/api/rooms/:room/messages\`   | Bearer | History, oldest first; \`?limit=1..500\` (50)    | 200     | 401, 422 |
| GET    | \`/api/rooms/:room/members\`    | Bearer | Users online in the room                       | 200     | 401, 422 |
| GET    | \`/ws\`                         | token  | WebSocket upgrade (see below)                  | 101     | 403      |

Room names: lower-case letters, digits, \`-\` and \`_\`, 1-32 characters.

## WebSocket protocol

Connect to \`ws://localhost:3002/ws\` and authenticate in one of two ways:

- \`ws://localhost:3002/ws?token=<jwt>\`: checked during the handshake; a bad token gets HTTP 403
- connect without a token and send \`{ "type": "auth", "token": "<jwt>" }\` first (within \`AUTH_TIMEOUT_MS\`)

Anything else before authentication, an invalid token or a timeout closes the socket with code **4401**.

Every frame is a JSON object with a \`type\`.

Client → server:

| \`type\`    | Fields          | Effect                                                        |
|-----------|-----------------|---------------------------------------------------------------|
| \`auth\`    | \`token\`         | Authenticate (only as the first message)                      |
| \`join\`    | \`room\`          | Join a room; reply \`joined\` with members and history          |
| \`leave\`   | \`room\`          | Leave a room; reply \`left\`                                    |
| \`message\` | \`room\`, \`text\`  | Send to a room you joined (\`text\` trimmed, 1-MAX_MESSAGE_LENGTH) |

Server → client:

| \`type\`     | Fields                                    | When                                           |
|------------|-------------------------------------------|------------------------------------------------|
| \`welcome\`  | \`user\`                                    | Authenticated                                  |
| \`joined\`   | \`room\`, \`members\`, \`history\`              | You joined a room                              |
| \`left\`     | \`room\`                                    | You left a room                                |
| \`presence\` | \`room\`, \`event\` (\`join\`/\`leave\`), \`user\`, \`members\` | Someone else joined or left (first tab in / last tab out) |
| \`message\`  | \`message\`: \`{ id, room, user, text, sentAt }\` | A message in one of your rooms (yours included) |
| \`error\`    | \`code\`, \`message\`, \`details?\`             | Your last frame was refused; the connection stays open |

Error codes: \`BAD_JSON\`, \`UNKNOWN_TYPE\`, \`VALIDATION_ERROR\`, \`BINARY_NOT_SUPPORTED\`,
\`UNAUTHENTICATED\`, \`ALREADY_AUTHENTICATED\`, \`NOT_IN_ROOM\`, \`TOO_MANY_ROOMS\`, \`ROOM_LIMIT\`.
Frames over 16 KiB close the connection (1009).

### Example session

\`\`\`text
→ { "type": "auth", "token": "eyJhbGciOi..." }
← { "type": "welcome", "user": { "id": "5b0f...", "name": "Ada" } }
→ { "type": "join", "room": "general" }
← { "type": "joined", "room": "general", "members": [{ "id": "5b0f...", "name": "Ada" }], "history": [] }
→ { "type": "message", "room": "general", "text": "hello" }
← { "type": "message", "message": { "id": "c1d2...", "room": "general", "user": { "id": "5b0f...", "name": "Ada" }, "text": "hello", "sentAt": "2026-01-01T12:00:00.000Z" } }
\`\`\`

### Try it from a terminal

\`\`\`bash
TOKEN=$(curl -s -X POST http://localhost:3002/api/token -H "Content-Type: application/json" -d '{"name":"Ada"}' | node -pe "JSON.parse(require('fs').readFileSync(0)).data.token")
curl -s http://localhost:3002/api/rooms/general/messages -H "Authorization: Bearer $TOKEN"
node -e "const ws = new WebSocket('ws://localhost:3002/ws?token=$TOKEN'); ws.onmessage = e => console.log(e.data); ws.onopen = () => { ws.send(JSON.stringify({ type: 'join', room: 'general' })); ws.send(JSON.stringify({ type: 'message', room: 'general', text: 'hi from node' })) }"
\`\`\`

PowerShell:

\`\`\`powershell
$token = (Invoke-RestMethod http://localhost:3002/api/token -Method Post -ContentType 'application/json' -Body '{"name":"Ada"}').data.token
Invoke-RestMethod http://localhost:3002/api/rooms/general/messages -Headers @{ Authorization = "Bearer $token" }
\`\`\`

## Configuration

| Variable             | Default       | Description                                                 |
|----------------------|---------------|-------------------------------------------------------------|
| \`PORT\`               | \`3002\`        | HTTP and WebSocket port                                     |
| \`HOST\`               | \`127.0.0.1\`   | Bind address (\`0.0.0.0\` in containers)                      |
| \`NODE_ENV\`           | \`development\` | \`development\`, \`production\` or \`test\`                       |
| \`CORS_ORIGIN\`        | \`*\`           | \`*\` or a comma-separated list of origins                    |
| \`JWT_SECRET\`         | (required)    | HS256 key, at least 32 characters                           |
| \`TOKEN_TTL\`          | \`12h\`         | Token lifetime (\`30m\`, \`12h\`, \`7d\`)                         |
| \`DEMO_LOGIN\`         | \`false\`       | Enable \`POST /api/token\` (any name, no password)            |
| \`HISTORY_SIZE\`       | \`100\`         | Messages kept per room                                      |
| \`MAX_MESSAGE_LENGTH\` | \`500\`         | Longest chat message, in characters                         |
| \`MAX_ROOMS\`          | \`1000\`        | Rooms that may exist at once                                |
| \`ROOMS_PER_CLIENT\`   | \`10\`          | Rooms one connection may be in                              |
| \`AUTH_TIMEOUT_MS\`    | \`5000\`        | Time to send the \`auth\` message when connecting without \`?token=\` |

## Project structure

\`\`\`
public/
  index.html                  browser client (vanilla JS, no build step)
src/
  main.ts                     entry point: loadEnv, startServer, graceful shutdown
  server.ts                   startServer(config): listen, attach /ws, close()
  app.ts                      createApp(config): HTTP routes, CORS, static client
  auth.ts                     ChatAuth: issue and verify chat JWTs
  config.ts                   typed config (defineConfig)
  chat/hub.ts                 ChatHub: presence per room and message history
  chat/ring-buffer.ts         fixed-size history buffer
  chat/protocol.ts            message types and the validating frame parser
  chat/socket.ts              WSServer wiring: auth, join/leave, broadcast
  middleware/error-handler.ts thrown errors -> { error: { code, message, details } }
  app.test.ts                 HTTP routes through createTestClient
  chat/hub.test.ts            hub, ring buffer and parser unit tests
  chat/socket.test.ts         real WebSocket round-trips on a random port
\`\`\`

\`createApp()\` never listens, so the HTTP tests call it through \`createTestClient(app)\`.
The WebSocket needs a real server: \`startServer(config, 0)\` listens on a free port and
the tests connect with Node's built-in \`WebSocket\`.

## Notes

- State is in memory: one process, history lost on restart. To run several instances, back
  \`ChatHub\` with Redis or a database and fan out messages between instances (pub/sub).
- \`DEMO_LOGIN\` hands out tokens to anyone. Replace \`POST /api/token\` with a real sign-in
  (see the \`rest-api\` template for users, \`hashPassword\` and login) before going public.
- The browser client authenticates with a first \`auth\` message so the token never appears in
  URLs or access logs.

## Next steps

- Add message types in \`src/chat/protocol.ts\` (e.g. \`typing\`) and handle them in \`src/chat/socket.ts\`
- Persist history with \`@axiljs/orm\` instead of the ring buffer
- Need users, roles and a database? \`axil create my-api --template rest-api\`
`,

    '.env.example': `# Server
PORT=3002
HOST=127.0.0.1
NODE_ENV=development

# CORS: "*" or a comma-separated list of origins
CORS_ORIGIN=*

# Auth: HS256 key of at least 32 characters. Replace it, e.g. with
#   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
JWT_SECRET=replace-me-with-a-random-string-of-32-plus-chars
TOKEN_TTL=12h
# POST /api/token gives a token to any display name. Demo only: turn it off
# (and add real sign-in) before exposing the app.
DEMO_LOGIN=true

# Chat limits
HISTORY_SIZE=100
MAX_MESSAGE_LENGTH=500
MAX_ROOMS=1000
ROOMS_PER_CLIENT=10
AUTH_TIMEOUT_MS=5000
`,

    'public/index.html': `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${ctx.name} · chat</title>
  <style>
    :root { --bg: #0f1115; --panel: #171a21; --line: #262b36; --text: #e6e8ee; --muted: #8a93a6; --accent: #4f8cff; --mine: #1d2c4a; --err: #ff6b6b; }
    @media (prefers-color-scheme: light) {
      :root { --bg: #f5f6f8; --panel: #fff; --line: #e1e4ea; --text: #1b1f27; --muted: #667085; --accent: #2563eb; --mine: #e8efff; --err: #c62828; }
    }
    * { box-sizing: border-box; }
    body { margin: 0; font: 15px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); height: 100vh; display: flex; flex-direction: column; }
    header { display: flex; gap: 12px; align-items: center; padding: 10px 16px; border-bottom: 1px solid var(--line); background: var(--panel); }
    header h1 { font-size: 16px; margin: 0; flex: 1; }
    .status { font-size: 13px; color: var(--muted); }
    .status.online::before { content: "● "; color: #22c55e; }
    main { flex: 1; display: grid; grid-template-columns: 180px 1fr 180px; min-height: 0; }
    aside { border-right: 1px solid var(--line); padding: 12px; overflow: auto; background: var(--panel); }
    aside.members { border-right: 0; border-left: 1px solid var(--line); }
    aside h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 0 0 8px; }
    ul { list-style: none; margin: 0 0 12px; padding: 0; }
    li.room { padding: 6px 8px; border-radius: 6px; cursor: pointer; display: flex; justify-content: space-between; }
    li.room.active { background: var(--mine); }
    li.room button { background: none; border: 0; color: var(--muted); cursor: pointer; padding: 0 2px; }
    #messages { overflow: auto; padding: 16px; display: flex; flex-direction: column; gap: 8px; }
    .msg { max-width: 70%; padding: 6px 10px; border-radius: 10px; background: var(--panel); border: 1px solid var(--line); }
    .msg.mine { align-self: flex-end; background: var(--mine); }
    .msg .meta { font-size: 12px; color: var(--muted); }
    .notice { align-self: center; font-size: 12px; color: var(--muted); }
    .notice.error { color: var(--err); }
    .center { display: flex; flex-direction: column; min-height: 0; }
    form { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--line); }
    input { flex: 1; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--line); background: var(--bg); color: var(--text); font: inherit; min-width: 0; }
    button.primary { padding: 8px 14px; border: 0; border-radius: 8px; background: var(--accent); color: #fff; font: inherit; cursor: pointer; }
    #login { margin: auto; display: flex; flex-direction: column; gap: 10px; width: min(320px, 90vw); border: 1px solid var(--line); border-radius: 12px; background: var(--panel); padding: 20px; }
    #login form { padding: 0; border: 0; }
    [hidden] { display: none !important; }
    @media (max-width: 700px) { main { grid-template-columns: 1fr; } aside { display: none; } }
  </style>
</head>
<body>
  <header>
    <h1>${ctx.name}</h1>
    <span id="status" class="status">offline</span>
    <span id="me" class="status"></span>
  </header>

  <div id="login">
    <strong>Join the chat</strong>
    <span class="status">Demo sign-in: POST /api/token issues a token for any name (DEMO_LOGIN=true).</span>
    <form id="login-form">
      <input id="name" placeholder="Your name" maxlength="24" autocomplete="nickname" required>
      <button class="primary">Enter</button>
    </form>
    <span id="login-error" class="notice error"></span>
  </div>

  <main id="chat" hidden>
    <aside>
      <h2>Rooms</h2>
      <ul id="rooms"></ul>
      <form id="join-form" style="padding:0;border:0">
        <input id="room-name" placeholder="room-name" pattern="[a-z0-9][a-z0-9_-]{0,31}" title="lower-case letters, digits, - and _">
      </form>
    </aside>
    <section class="center">
      <div id="messages"></div>
      <form id="send-form">
        <input id="text" placeholder="Message" maxlength="500" autocomplete="off">
        <button class="primary">Send</button>
      </form>
    </section>
    <aside class="members">
      <h2>Online</h2>
      <ul id="members"></ul>
    </aside>
  </main>

  <script>
    // Dependency-free client for the /ws protocol (see README.md).
    var state = { token: sessionStorage.getItem('chat-token'), user: null, ws: null, rooms: {}, active: null, retry: 0 }
    var $ = function (id) { return document.getElementById(id) }

    function el(tag, cls, text) {
      var node = document.createElement(tag)
      if (cls) node.className = cls
      if (text !== undefined) node.textContent = text   // textContent: never HTML
      return node
    }

    function room(name) {
      if (!state.rooms[name]) state.rooms[name] = { messages: [], members: [], unread: 0 }
      return state.rooms[name]
    }

    // ── Sign-in ───────────────────────────────────────────────────────────────
    $('login-form').onsubmit = function (e) {
      e.preventDefault()
      fetch('/api/token', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: $('name').value }) })
        .then(function (res) { return res.json().then(function (body) { return { ok: res.ok, body: body } }) })
        .then(function (r) {
          if (!r.ok) throw new Error(r.body.error ? r.body.error.message : 'Sign-in failed')
          state.token = r.body.data.token
          sessionStorage.setItem('chat-token', state.token)
          connect()
        })
        .catch(function (err) { $('login-error').textContent = err.message })
    }

    // ── Connection ────────────────────────────────────────────────────────────
    function connect() {
      var url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'
      var ws = new WebSocket(url)
      state.ws = ws
      // Authenticate with the first message (keeps the token out of the URL)
      ws.onopen = function () { ws.send(JSON.stringify({ type: 'auth', token: state.token })) }
      ws.onmessage = function (e) { handle(JSON.parse(e.data)) }
      ws.onclose = function (e) {
        $('status').textContent = 'offline'
        $('status').className = 'status'
        if (e.code === 4401) return signOut('Session expired, sign in again.')
        // Reconnect with backoff, then re-join the rooms we were in
        state.retry = Math.min(state.retry + 1, 5)
        setTimeout(connect, state.retry * 1000)
      }
    }

    function signOut(reason) {
      sessionStorage.removeItem('chat-token')
      state.token = null
      $('chat').hidden = true
      $('login').hidden = false
      $('login-error').textContent = reason || ''
    }

    function send(msg) {
      if (state.ws && state.ws.readyState === 1) state.ws.send(JSON.stringify(msg))
    }

    // ── Server messages ───────────────────────────────────────────────────────
    function handle(msg) {
      switch (msg.type) {
        case 'welcome':
          state.user = msg.user
          state.retry = 0
          $('login').hidden = true
          $('chat').hidden = false
          $('status').textContent = 'online'
          $('status').className = 'status online'
          $('me').textContent = msg.user.name
          var names = Object.keys(state.rooms)
          if (names.length === 0) names = ['general']
          names.forEach(function (n) { send({ type: 'join', room: n }) })
          break
        case 'joined':
          var r = room(msg.room)
          r.messages = msg.history
          r.members = msg.members
          if (!state.active || state.active === msg.room) state.active = msg.room
          render()
          break
        case 'left':
          delete state.rooms[msg.room]
          if (state.active === msg.room) state.active = Object.keys(state.rooms)[0] || null
          render()
          break
        case 'presence':
          room(msg.room).members = msg.members
          room(msg.room).messages.push({ notice: msg.user.name + (msg.event === 'join' ? ' joined' : ' left') })
          render()
          break
        case 'message':
          var target = room(msg.message.room)
          target.messages.push(msg.message)
          if (msg.message.room !== state.active) target.unread++
          render()
          break
        case 'error':
          if (state.active) room(state.active).messages.push({ notice: msg.code + ': ' + msg.message, error: true })
          render()
          break
      }
    }

    // ── UI ────────────────────────────────────────────────────────────────────
    function render() {
      var list = $('rooms')
      list.textContent = ''
      Object.keys(state.rooms).sort().forEach(function (name) {
        var r = state.rooms[name]
        var li = el('li', 'room' + (name === state.active ? ' active' : ''), '#' + name + (r.unread ? ' (' + r.unread + ')' : ''))
        li.onclick = function () { state.active = name; r.unread = 0; render() }
        var leave = el('button', '', '×')
        leave.title = 'Leave'
        leave.onclick = function (e) { e.stopPropagation(); send({ type: 'leave', room: name }) }
        li.appendChild(leave)
        list.appendChild(li)
      })

      var current = state.active ? state.rooms[state.active] : null
      var box = $('messages')
      box.textContent = ''
      ;(current ? current.messages : []).forEach(function (m) {
        if (m.notice) return box.appendChild(el('div', 'notice' + (m.error ? ' error' : ''), m.notice))
        var mine = state.user && m.user.id === state.user.id
        var item = el('div', 'msg' + (mine ? ' mine' : ''))
        item.appendChild(el('div', 'meta', m.user.name + ' · ' + new Date(m.sentAt).toLocaleTimeString()))
        item.appendChild(el('div', '', m.text))
        box.appendChild(item)
      })
      box.scrollTop = box.scrollHeight

      var members = $('members')
      members.textContent = ''
      ;(current ? current.members : []).forEach(function (u) { members.appendChild(el('li', '', u.name)) })
    }

    $('send-form').onsubmit = function (e) {
      e.preventDefault()
      var text = $('text').value.trim()
      if (!text || !state.active) return
      send({ type: 'message', room: state.active, text: text })
      $('text').value = ''
    }

    $('join-form').onsubmit = function (e) {
      e.preventDefault()
      var name = $('room-name').value.trim().toLowerCase()
      if (!name) return
      state.active = name
      send({ type: 'join', room: name })
      $('room-name').value = ''
    }

    if (state.token) connect()
  </script>
</body>
</html>
`,

    'src/app.test.ts': `import { describe, it, expect, createTestClient } from '@axiljs/testing'
import { createApp, createChatContext, SERVICE } from './app.js'
import { loadConfig } from './config.js'

const SECRET = 'test-secret-that-is-at-least-32-characters'

const config = loadConfig({ NODE_ENV: 'test', JWT_SECRET: SECRET, DEMO_LOGIN: 'true' })
const chat   = createChatContext(config)
const app    = createApp(config, chat)
const client = createTestClient(app)

const { token, user } = chat.auth.issue('Ada')

describe('GET /api and /health', () => {
  it('describes the service', async () => {
    const res = await client.get('/api')
    expect(res.status).toBe(200)
    expect(res.body.data.service).toBe(SERVICE)
    expect(res.body.data.websocket).toBe('/ws')
  })

  it('reports ok', async () => {
    const res = await client.get('/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
  })
})

describe('browser client', () => {
  it('serves public/index.html at /', async () => {
    const res = await client.get('/')
    expect(res.status).toBe(200)
    expect(String(res.headers['content-type'])).toContain('text/html')
    expect(res.text).toContain('<title>')
  })
})

describe('POST /api/token', () => {
  it('issues a token that verifies', async () => {
    const res = await client.post('/api/token').send({ name: '  Grace  ' })
    expect(res.status).toBe(201)
    expect(res.body.data.user.name).toBe('Grace')
    expect(chat.auth.verify(res.body.data.token)).toEqual(res.body.data.user)
  })

  it('rejects names with markup (422)', async () => {
    const res = await client.post('/api/token').send({ name: '<script>' })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('does not exist when DEMO_LOGIN is off', async () => {
    const locked = createTestClient(createApp(loadConfig({ NODE_ENV: 'test', JWT_SECRET: SECRET })))
    const res = await locked.post('/api/token').send({ name: 'Eve' })
    expect(res.status).toBe(404)
  })
})

describe('room endpoints', () => {
  it('require a token (401)', async () => {
    const res = await client.get('/api/rooms')
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('UNAUTHORIZED')
  })

  it('reject an invalid token (401)', async () => {
    const res = await client.get('/api/rooms').auth('not.a.token')
    expect(res.status).toBe(401)
  })

  it('list rooms with online and message counts', async () => {
    chat.hub.post('lobby', user, 'hello')
    const res = await client.get('/api/rooms').auth(token)
    expect(res.status).toBe(200)
    expect(res.body.data).toContainEqual({ name: 'lobby', online: 0, messages: 1 })
  })

  it('return the history oldest first, honouring ?limit', async () => {
    for (const text of ['one', 'two', 'three']) chat.hub.post('history', user, text)

    const all = await client.get('/api/rooms/history/messages').auth(token)
    expect(all.status).toBe(200)
    expect(all.body.data.map((m: { text: string }) => m.text)).toEqual(['one', 'two', 'three'])

    const last = await client.get('/api/rooms/history/messages?limit=2').auth(token)
    expect(last.body.data.map((m: { text: string }) => m.text)).toEqual(['two', 'three'])
  })

  it('validate the room name and limit (422)', async () => {
    const badRoom  = await client.get('/api/rooms/Bad%20Room/messages').auth(token)
    const badLimit = await client.get('/api/rooms/general/messages?limit=0').auth(token)
    expect(badRoom.status).toBe(422)
    expect(badLimit.status).toBe(422)
    expect(badLimit.body.error.details[0].source).toBe('query')
  })

  it('list online members', async () => {
    chat.hub.join('team', user, 'conn-1')
    const res = await client.get('/api/rooms/team/members').auth(token)
    expect(res.status).toBe(200)
    expect(res.body.data.members).toEqual([user])
    chat.hub.leave('team', user.id, 'conn-1')
  })
})

describe('errors', () => {
  it('returns a JSON 404 for unknown routes', async () => {
    const res = await client.get('/api/nope')
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })
})
`,

    'src/app.ts': `/**
 * Application factory: HTTP routes and the static browser client.
 * Builds the app without listening, so tests can drive it directly;
 * src/server.ts listens and attaches the WebSocket endpoint.
 */

import { fileURLToPath } from 'node:url'
import { Application, cors, serveStatic } from '@axiljs/core'
import { authenticate, getUser } from '@axiljs/auth'
import { v, validate } from '@axiljs/validation'
import { ChatAuth } from './auth.js'
import { ChatHub } from './chat/hub.js'
import { ROOM_PATTERN } from './chat/protocol.js'
import type { Config } from './config.js'
import { errorHandler } from './middleware/error-handler.js'

export const SERVICE = '${ctx.name}'
export const VERSION = '1.0.0'

// public/ sits next to src/ and dist/, so this works from both
export const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url))

/** State shared by the HTTP routes and the WebSocket endpoint. */
export interface ChatContext {
  hub:  ChatHub
  auth: ChatAuth
}

export function createChatContext(config: Config): ChatContext {
  return {
    hub:  new ChatHub({ historySize: config.HISTORY_SIZE, maxRooms: config.MAX_ROOMS }),
    auth: new ChatAuth(config.JWT_SECRET, config.TOKEN_TTL)
  }
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const TokenBody = v.object({
  // Letters and digits of any script, spaces, ".", "_" and "-"
  name: v.string().trim().min(1).max(24).pattern(/^[\\p{L}\\p{N} ._-]+$/u)
}).strip()

const RoomParams = v.object({
  room: v.string().pattern(ROOM_PATTERN)
})

const HistoryQuery = v.object({
  // Query values are strings; v.number() accepts "20", Number() converts it
  limit: v.number().integer().min(1).max(500).optional().transform(Number)
})

// ─── App ──────────────────────────────────────────────────────────────────────

export function createApp(config: Config, chat: ChatContext = createChatContext(config)): Application {
  const { hub, auth } = chat

  const app = new Application({
    server:  { port: config.PORT, host: config.HOST, methodNotAllowed: true },
    env:     config.NODE_ENV,
    logging: config.NODE_ENV !== 'test'
  })

  app.use(cors({ origin: parseOrigins(config.CORS_ORIGIN) }))

  // GET / -> public/index.html, the browser client (other paths fall through)
  app.use(serveStatic({ root: PUBLIC_DIR, maxAge: config.NODE_ENV === 'production' ? 3600 : 0 }))

  const requireUser = authenticate(auth.jwt)

  app.get('/api', (_req, res) => {
    res.success({
      service:   SERVICE,
      version:   VERSION,
      websocket: '/ws',
      endpoints: [
        'GET  /health',
        ...(config.DEMO_LOGIN ? ['POST /api/token'] : []),
        'GET  /api/rooms',
        'GET  /api/rooms/:room/messages',
        'GET  /api/rooms/:room/members'
      ]
    }, 'Service info')
  })

  app.get('/health', (_req, res) => {
    res.json({
      status:    'ok',
      uptime:    Math.round(process.uptime()),
      rooms:     hub.rooms().length,
      timestamp: new Date().toISOString()
    })
  })

  // Demo sign-in: any display name gets a token. Replace with real auth.
  if (config.DEMO_LOGIN) {
    app.post('/api/token', validate({ body: TokenBody }), (req, res) => {
      const { name } = req.body as { name: string }
      res.created(auth.issue(name), 'Token issued')
    })
  }

  app.get('/api/rooms', requireUser, (_req, res) => {
    res.success(hub.rooms(), 'Rooms')
  })

  app.get('/api/rooms/:room/messages', requireUser, validate({ params: RoomParams, query: HistoryQuery }), (req, res) => {
    const limit = (req.query as { limit?: number }).limit ?? 50
    res.success(hub.messages(req.params.room, limit), 'Message history')
  })

  app.get('/api/rooms/:room/members', requireUser, validate({ params: RoomParams }), (req, res) => {
    const me = getUser(req)
    res.success({ room: req.params.room, you: me.id, members: hub.members(req.params.room) }, 'Online members')
  })

  app.use(errorHandler(config.NODE_ENV))

  return app
}

function parseOrigins(value: string): string | string[] {
  if (value.trim() === '*') return '*'
  return value.split(',').map(o => o.trim()).filter(Boolean)
}
`,

    'src/auth.ts': `/**
 * Chat tokens: a JWT whose \`sub\` is the user id and \`name\` the display name.
 *
 * The same tokens authenticate HTTP requests (Authorization: Bearer ...,
 * via authenticate() from @axiljs/auth) and WebSocket connections
 * (?token=... on the URL, or a first { "type": "auth" } message).
 */

import { randomUUID } from 'node:crypto'
import { JWT } from '@axiljs/auth'
import type { ChatUser } from './chat/hub.js'

export interface IssuedToken {
  token:     string
  user:      ChatUser
  expiresIn: string
}

export class ChatAuth {
  readonly jwt: JWT

  constructor(secret: string, private readonly ttl: string) {
    // Throws when the secret is shorter than 32 characters
    this.jwt = new JWT(secret)
  }

  /** Sign a token for a new user id with this display name. */
  issue(name: string): IssuedToken {
    const user = { id: randomUUID(), name }
    return {
      token:     this.jwt.sign({ sub: user.id, name }, { expiresIn: this.ttl }),
      user,
      expiresIn: this.ttl
    }
  }

  /** The user a token belongs to, or null if it is invalid or expired. */
  verify(token: string): ChatUser | null {
    try {
      const payload = this.jwt.verify(token)
      const id      = payload.sub === undefined ? '' : String(payload.sub)
      const name    = typeof payload.name === 'string' ? payload.name : ''
      return id && name ? { id, name } : null
    } catch {
      return null
    }
  }
}
`,

    'src/chat/hub.test.ts': `import { describe, it, expect } from '@axiljs/testing'
import { ChatHub } from './hub.js'
import { RingBuffer } from './ring-buffer.js'
import { createParser } from './protocol.js'

const ada  = { id: 'u1', name: 'Ada' }
const alan = { id: 'u2', name: 'Alan' }

describe('RingBuffer', () => {
  it('keeps the newest items, oldest first', () => {
    const ring = new RingBuffer<number>(3)
    for (let i = 1; i <= 5; i++) ring.push(i)
    expect(ring.size).toBe(3)
    expect(ring.toArray()).toEqual([3, 4, 5])
    expect(ring.toArray(2)).toEqual([4, 5])
    expect(ring.toArray(10)).toEqual([3, 4, 5])
  })

  it('rejects a capacity below 1', () => {
    expect(() => new RingBuffer(0)).toThrow()
  })
})

describe('ChatHub presence', () => {
  it('announces a user once, however many connections they have', () => {
    const hub = new ChatHub()
    expect(hub.join('general', ada, 'c1')).toBe(true)
    expect(hub.join('general', ada, 'c2')).toBe(false)
    expect(hub.join('general', alan, 'c3')).toBe(true)
    expect(hub.members('general').map(u => u.name)).toEqual(['Ada', 'Alan'])

    expect(hub.leave('general', ada.id, 'c1')).toBe(false)
    expect(hub.leave('general', ada.id, 'c2')).toBe(true)
    expect(hub.members('general')).toEqual([alan])
  })

  it('ignores leaves for unknown connections and drops empty rooms', () => {
    const hub = new ChatHub()
    hub.join('general', ada, 'c1')
    expect(hub.leave('general', ada.id, 'nope')).toBe(false)
    expect(hub.leave('general', ada.id, 'c1')).toBe(true)
    expect(hub.rooms()).toEqual([])
  })

  it('limits the number of rooms', () => {
    const hub = new ChatHub({ maxRooms: 1 })
    expect(hub.canOpen('a')).toBe(true)
    hub.join('a', ada, 'c1')
    expect(hub.canOpen('a')).toBe(true)
    expect(hub.canOpen('b')).toBe(false)
  })
})

describe('ChatHub history', () => {
  it('keeps the last historySize messages per room', () => {
    const hub = new ChatHub({ historySize: 2 })
    hub.post('general', ada, 'one')
    hub.post('general', ada, 'two')
    hub.post('general', alan, 'three')
    hub.post('random', alan, 'elsewhere')

    expect(hub.messages('general').map(m => m.text)).toEqual(['two', 'three'])
    expect(hub.messages('general', 1)[0].user).toEqual(alan)
    expect(hub.messages('empty')).toEqual([])
    expect(hub.rooms()).toEqual([
      { name: 'general', online: 0, messages: 2 },
      { name: 'random',  online: 0, messages: 1 }
    ])
  })
})

describe('protocol parser', () => {
  const parse = createParser(10)

  it('accepts valid messages, trims text and drops unknown fields', () => {
    const result = parse(JSON.stringify({ type: 'message', room: 'general', text: '  hi  ', extra: 1 }))
    expect(result).toEqual({ ok: true, message: { type: 'message', room: 'general', text: 'hi' } })
  })

  it('rejects invalid JSON, unknown types and bad fields', () => {
    const codes = [
      '{',
      '[]',
      '{"type":"shout"}',
      '{"type":"join","room":"Not A Room"}',
      '{"type":"message","room":"a","text":"far too long"}'
    ].map(raw => {
      const r = parse(raw)
      return r.ok ? 'ok' : r.error.code
    })
    expect(codes).toEqual(['BAD_JSON', 'UNKNOWN_TYPE', 'UNKNOWN_TYPE', 'VALIDATION_ERROR', 'VALIDATION_ERROR'])
  })
})
`,

    'src/chat/hub.ts': `/**
 * Chat state, independent of the transport: who is in which room
 * (presence) and the recent messages of every room (history).
 *
 * The WebSocket layer (socket.ts) and the HTTP routes (app.ts) both read
 * and write it, so they always agree. Everything lives in memory; swap this
 * class for a Redis/DB-backed one to run several instances.
 */

import { randomUUID } from 'node:crypto'
import { RingBuffer } from './ring-buffer.js'

export interface ChatUser {
  id:   string
  name: string
}

export interface ChatMessage {
  id:     string
  room:   string
  user:   ChatUser
  text:   string
  sentAt: string
}

export interface RoomSummary {
  name:     string
  online:   number
  messages: number
}

export interface ChatHubOptions {
  /** Messages kept per room (default 100). */
  historySize?: number
  /** Rooms that may exist at once (default 1000). */
  maxRooms?: number
}

interface Presence {
  user:        ChatUser
  connections: Set<string>
}

export class ChatHub {
  private readonly historySize: number
  private readonly maxRooms: number
  private readonly history  = new Map<string, RingBuffer<ChatMessage>>()
  private readonly presence = new Map<string, Map<string, Presence>>()

  constructor(options: ChatHubOptions = {}) {
    this.historySize = options.historySize ?? 100
    this.maxRooms    = options.maxRooms ?? 1000
  }

  /** Whether \`room\` exists or there is space to create it. */
  canOpen(room: string): boolean {
    return this.history.has(room) || this.presence.has(room) || this.roomNames().length < this.maxRooms
  }

  /**
   * Add a connection of \`user\` to \`room\`.
   * Returns true when it is the user's first connection there, i.e. when
   * the rest of the room should hear "user joined". A user with two tabs
   * open is one member with two connections.
   */
  join(room: string, user: ChatUser, connectionId: string): boolean {
    let members = this.presence.get(room)
    if (!members) {
      members = new Map()
      this.presence.set(room, members)
    }
    const entry = members.get(user.id)
    if (entry) {
      entry.connections.add(connectionId)
      return false
    }
    members.set(user.id, { user, connections: new Set([connectionId]) })
    return true
  }

  /**
   * Remove a connection of a user from \`room\`.
   * Returns true when that was the user's last connection there.
   */
  leave(room: string, userId: string, connectionId: string): boolean {
    const members = this.presence.get(room)
    const entry   = members?.get(userId)
    if (!members || !entry || !entry.connections.delete(connectionId)) return false
    if (entry.connections.size > 0) return false

    members.delete(userId)
    if (members.size === 0) this.presence.delete(room)
    return true
  }

  /** Users online in \`room\`, sorted by name. */
  members(room: string): ChatUser[] {
    const members = this.presence.get(room)
    if (!members) return []
    return [...members.values()]
      .map(p => p.user)
      .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
  }

  /** Store a message in the room's history and return it. */
  post(room: string, user: ChatUser, text: string): ChatMessage {
    let buffer = this.history.get(room)
    if (!buffer) {
      buffer = new RingBuffer<ChatMessage>(this.historySize)
      this.history.set(room, buffer)
    }
    const message: ChatMessage = {
      id:     randomUUID(),
      room,
      user:   { id: user.id, name: user.name },
      text,
      sentAt: new Date().toISOString()
    }
    buffer.push(message)
    return message
  }

  /** Recent messages of \`room\`, oldest first (at most \`limit\`). */
  messages(room: string, limit?: number): ChatMessage[] {
    return this.history.get(room)?.toArray(limit) ?? []
  }

  /** Every room that has members or history. */
  rooms(): RoomSummary[] {
    return this.roomNames().map(name => ({
      name,
      online:   this.presence.get(name)?.size ?? 0,
      messages: this.history.get(name)?.size ?? 0
    }))
  }

  private roomNames(): string[] {
    return [...new Set([...this.presence.keys(), ...this.history.keys()])].sort()
  }
}
`,

    'src/chat/protocol.ts': `/**
 * The WebSocket message protocol: JSON text frames with a \`type\` field.
 *
 * Every incoming frame is parsed and validated here before the socket
 * layer acts on it; anything malformed becomes an { type: "error" } reply.
 */

import { v } from '@axiljs/validation'
import type { ValidationError } from '@axiljs/validation'
import type { ChatMessage, ChatUser } from './hub.js'

/** Lower-case letters, digits, "-" and "_", 1-32 characters. */
export const ROOM_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/

// ─── Client → server ──────────────────────────────────────────────────────────

export type ClientMessage =
  | { type: 'auth';    token: string }
  | { type: 'join';    room: string }
  | { type: 'leave';   room: string }
  | { type: 'message'; room: string; text: string }

// ─── Server → client ──────────────────────────────────────────────────────────

export type ErrorCode =
  | 'BAD_JSON'
  | 'UNKNOWN_TYPE'
  | 'VALIDATION_ERROR'
  | 'BINARY_NOT_SUPPORTED'
  | 'UNAUTHENTICATED'
  | 'ALREADY_AUTHENTICATED'
  | 'NOT_IN_ROOM'
  | 'TOO_MANY_ROOMS'
  | 'ROOM_LIMIT'

export type ServerMessage =
  | { type: 'welcome';  user: ChatUser }
  | { type: 'joined';   room: string; members: ChatUser[]; history: ChatMessage[] }
  | { type: 'left';     room: string }
  | { type: 'presence'; room: string; event: 'join' | 'leave'; user: ChatUser; members: ChatUser[] }
  | { type: 'message';  message: ChatMessage }
  | { type: 'error';    code: ErrorCode; message: string; details?: ValidationError[] }

/** WebSocket close code for missing, invalid or late authentication. */
export const CLOSE_UNAUTHENTICATED = 4401

// ─── Parsing ──────────────────────────────────────────────────────────────────

export type ParseResult =
  | { ok: true;  message: ClientMessage }
  | { ok: false; error: Extract<ServerMessage, { type: 'error' }> }

/** Build the parser once; \`maxLength\` limits the text of a chat message. */
export function createParser(maxLength: number): (raw: string) => ParseResult {
  const room = v.string().trim().pattern(ROOM_PATTERN)

  const schemas = {
    auth:    v.object({ type: v.literal('auth'),    token: v.string().min(1).max(4096) }).strip(),
    join:    v.object({ type: v.literal('join'),    room }).strip(),
    leave:   v.object({ type: v.literal('leave'),   room }).strip(),
    message: v.object({ type: v.literal('message'), room, text: v.string().trim().min(1).max(maxLength) }).strip()
  }

  return raw => {
    let data: unknown
    try {
      data = JSON.parse(raw)
    } catch {
      return fail('BAD_JSON', 'Frames must be JSON objects')
    }

    const type = typeof data === 'object' && data !== null ? (data as { type?: unknown }).type : undefined
    if (typeof type !== 'string' || !Object.hasOwn(schemas, type)) {
      return fail('UNKNOWN_TYPE', \`type must be one of: \${Object.keys(schemas).join(', ')}\`)
    }

    const result = schemas[type as keyof typeof schemas].parse(data)
    if (!result.success) {
      return fail('VALIDATION_ERROR', \`Invalid "\${type}" message\`, result.errors)
    }
    return { ok: true, message: result.data as ClientMessage }
  }
}

function fail(code: ErrorCode, message: string, details?: ValidationError[]): ParseResult {
  return { ok: false, error: { type: 'error', code, message, ...(details ? { details } : {}) } }
}
`,

    'src/chat/ring-buffer.ts': `/**
 * Fixed-size FIFO: once full, every push drops the oldest item.
 * Memory per room stays bounded no matter how busy the room is.
 */

export class RingBuffer<T> {
  private readonly items: Array<T | undefined>
  private start = 0
  private count = 0

  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError(\`RingBuffer capacity must be a positive integer, got \${capacity}\`)
    }
    this.items = new Array<T | undefined>(capacity)
  }

  get size(): number {
    return this.count
  }

  push(item: T): void {
    this.items[(this.start + this.count) % this.capacity] = item
    if (this.count < this.capacity) this.count++
    else this.start = (this.start + 1) % this.capacity
  }

  /** Oldest first; only the newest \`limit\` items when given. */
  toArray(limit: number = this.count): T[] {
    const n   = Math.max(0, Math.min(limit, this.count))
    const out: T[] = []
    for (let i = this.count - n; i < this.count; i++) {
      out.push(this.items[(this.start + i) % this.capacity] as T)
    }
    return out
  }
}
`,

    'src/chat/socket.test.ts': `/**
 * Real WebSocket round-trips: the app listens on a random port and the
 * tests connect with Node's built-in WebSocket client.
 */

import { describe, it, expect, beforeAll, afterAll } from '@axiljs/testing'
import { loadConfig } from '../config.js'
import { startServer } from '../server.js'
import type { ChatServer } from '../server.js'
import { CLOSE_UNAUTHENTICATED } from './protocol.js'

let server: ChatServer
let base: string

// ─── A tiny test peer ─────────────────────────────────────────────────────────

// Server messages are loosely typed here so assertions can reach any field
type Msg = Record<string, any>

class Peer {
  private inbox: Msg[] = []
  private waiting: Array<{ type: string; resolve: (m: Msg) => void }> = []
  readonly closed: Promise<{ code: number; reason: string }>

  private constructor(readonly ws: WebSocket) {
    ws.onmessage = event => {
      const msg = JSON.parse(String(event.data)) as Msg
      const i = this.waiting.findIndex(w => w.type === msg.type)
      if (i >= 0) this.waiting.splice(i, 1)[0].resolve(msg)
      else this.inbox.push(msg)
    }
    this.closed = new Promise(resolve => {
      ws.onclose = event => resolve({ code: event.code, reason: event.reason })
    })
  }

  /** Connect; resolves once open, rejects if the handshake is refused. */
  static open(query = ''): Promise<Peer> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(\`ws://\${base}/ws\${query}\`)
      ws.onopen  = () => resolve(new Peer(ws))
      ws.onerror = () => reject(new Error('WebSocket handshake failed'))
    })
  }

  /** Connect with a fresh token for \`name\` and wait for the welcome. */
  static async as(name: string): Promise<Peer> {
    const { token } = server.auth.issue(name)
    const peer = await Peer.open(\`?token=\${encodeURIComponent(token)}\`)
    await peer.next('welcome')
    return peer
  }

  send(data: unknown): void {
    this.ws.send(typeof data === 'string' ? data : JSON.stringify(data))
  }

  /** The next message of \`type\` (already received or still to come). */
  next(type: string, timeoutMs = 2000): Promise<Msg> {
    const i = this.inbox.findIndex(m => m.type === type)
    if (i >= 0) return Promise.resolve(this.inbox.splice(i, 1)[0])
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(\`No "\${type}" message within \${timeoutMs}ms\`)), timeoutMs)
      this.waiting.push({ type, resolve: m => { clearTimeout(timer); resolve(m) } })
    })
  }

  async join(room: string): Promise<Msg> {
    this.send({ type: 'join', room })
    return this.next('joined')
  }

  async close(): Promise<void> {
    this.ws.close()
    await this.closed
  }
}

// Hooks must sit inside a describe(): @axiljs/testing ignores top-level ones
describe('chat over WebSocket', () => {
  beforeAll(async () => {
    server = await startServer(loadConfig({
      NODE_ENV:        'test',
      JWT_SECRET:      'test-secret-that-is-at-least-32-characters',
      AUTH_TIMEOUT_MS: '200',
      MAX_MESSAGE_LENGTH: '20'
    }), 0, '127.0.0.1')
    base = \`127.0.0.1:\${server.port}\`
  })

  afterAll(async () => {
    await server.close()
  })

  // ─── Authentication ──────────────────────────────────────────────────────────

  describe('WebSocket authentication', () => {
    it('accepts a token in the query string', async () => {
      const { token, user } = server.auth.issue('Ada')
      const peer = await Peer.open(\`?token=\${token}\`)
      const welcome = await peer.next('welcome')
      expect(welcome.user).toEqual(user)
      await peer.close()
    })

    it('refuses the handshake for an invalid token', async () => {
      await expect(Peer.open('?token=forged.token.value')).rejects.toThrow('handshake failed')
    })

    it('accepts a token in the first message', async () => {
      const { token, user } = server.auth.issue('Grace')
      const peer = await Peer.open()
      peer.send({ type: 'auth', token })
      expect((await peer.next('welcome')).user).toEqual(user)
      await peer.close()
    })

    it('closes with 4401 when the first message is not auth', async () => {
      const peer = await Peer.open()
      peer.send({ type: 'join', room: 'general' })
      expect((await peer.next('error')).code).toBe('UNAUTHENTICATED')
      expect((await peer.closed).code).toBe(CLOSE_UNAUTHENTICATED)
    })

    it('closes with 4401 when nobody authenticates in time', async () => {
      const peer = await Peer.open()
      const { code, reason } = await peer.closed
      expect(code).toBe(CLOSE_UNAUTHENTICATED)
      expect(reason).toBe('Authentication timeout')
    })
  })

  // ─── Rooms, presence, messages ────────────────────────────────────────────────

  describe('rooms', () => {
    it('broadcasts presence and messages to the room only', async () => {
      const ada     = await Peer.as('Ada')
      const alan    = await Peer.as('Alan')
      const outside = await Peer.as('Eve')

      const first = await ada.join('lab')
      expect(first.members.map((u: Msg) => u.name)).toEqual(['Ada'])
      expect(first.history).toEqual([])

      const second = await alan.join('lab')
      expect(second.members.map((u: Msg) => u.name)).toEqual(['Ada', 'Alan'])
      const joined = await ada.next('presence')
      expect(joined).toMatchObject({ room: 'lab', event: 'join', user: { name: 'Alan' } })

      await outside.join('elsewhere')

      ada.send({ type: 'message', room: 'lab', text: '  hello lab  ' })
      const atAlan = await alan.next('message')
      const atAda  = await ada.next('message')
      expect(atAlan.message).toMatchObject({ room: 'lab', text: 'hello lab', user: { name: 'Ada' } })
      expect(atAda.message.id).toBe(atAlan.message.id)
      await expect(outside.next('message', 150)).rejects.toThrow('No "message"')

      await alan.close()
      const left = await ada.next('presence')
      expect(left).toMatchObject({ event: 'leave', user: { name: 'Alan' } })
      expect(left.members.map((u: Msg) => u.name)).toEqual(['Ada'])

      await ada.close()
      await outside.close()
    })

    it('sends the history on join and over HTTP', async () => {
      const ada = await Peer.as('Ada')
      await ada.join('history')
      ada.send({ type: 'message', room: 'history', text: 'first' })
      await ada.next('message')
      ada.send({ type: 'message', room: 'history', text: 'second' })
      await ada.next('message')

      const late = await Peer.as('Late')
      const joined = await late.join('history')
      expect(joined.history.map((m: Msg) => m.text)).toEqual(['first', 'second'])

      const { token } = server.auth.issue('Reader')
      const res  = await fetch(\`http://\${base}/api/rooms/history/messages?limit=1\`, { headers: { authorization: \`Bearer \${token}\` } })
      const body = await res.json() as Msg
      expect(res.status).toBe(200)
      expect(body.data.map((m: Msg) => m.text)).toEqual(['second'])

      await ada.close()
      await late.close()
    })

    it('handles leave, and refuses messages to rooms not joined', async () => {
      const ada  = await Peer.as('Ada')
      const alan = await Peer.as('Alan')
      await ada.join('leaving')
      await alan.join('leaving')
      await ada.next('presence')

      alan.send({ type: 'leave', room: 'leaving' })
      expect((await alan.next('left')).room).toBe('leaving')
      expect(await ada.next('presence')).toMatchObject({ event: 'leave', user: { name: 'Alan' } })

      alan.send({ type: 'message', room: 'leaving', text: 'hi' })
      expect((await alan.next('error')).code).toBe('NOT_IN_ROOM')

      await ada.close()
      await alan.close()
    })
  })

  // ─── Validation ──────────────────────────────────────────────────────────────

  describe('message validation', () => {
    it('answers invalid frames with an error and keeps the connection', async () => {
      const peer = await Peer.as('Ada')
      await peer.join('checks')

      const cases: Array<[unknown, string]> = [
        ['not json', 'BAD_JSON'],
        [{ type: 'shout' }, 'UNKNOWN_TYPE'],
        [{ type: 'join', room: '../etc' }, 'VALIDATION_ERROR'],
        [{ type: 'message', room: 'checks', text: '' }, 'VALIDATION_ERROR'],
        [{ type: 'message', room: 'checks', text: 'x'.repeat(21) }, 'VALIDATION_ERROR'],
        [{ type: 'auth', token: 'again' }, 'ALREADY_AUTHENTICATED']
      ]
      for (const [frame, code] of cases) {
        peer.send(frame)
        expect((await peer.next('error')).code).toBe(code)
      }

      // Still usable afterwards
      peer.send({ type: 'message', room: 'checks', text: 'still here' })
      expect((await peer.next('message')).message.text).toBe('still here')
      await peer.close()
    })
  })
})
`,

    'src/chat/socket.ts': `/**
 * WebSocket endpoint (/ws) on the app's HTTP server.
 *
 * Authentication, either:
 *   - ws://host/ws?token=<jwt>: checked during the handshake; a bad token is
 *     refused with HTTP 403 before the socket opens, or
 *   - ws://host/ws, then { "type": "auth", "token": "<jwt>" } as the first
 *     message within AUTH_TIMEOUT_MS (keeps the token out of URLs and logs).
 * Until then every other message is refused and the socket is closed (4401).
 *
 * Rooms are WSServer rooms (join/leave/toRoomJSON); ChatHub tracks presence
 * per user and keeps the history.
 */

import type { IncomingMessage, Server } from 'node:http'
import { WSServer } from '@axiljs/websocket'
import type { WSClient } from '@axiljs/websocket'
import type { ChatAuth } from '../auth.js'
import type { ChatHub, ChatUser } from './hub.js'
import { CLOSE_UNAUTHENTICATED, createParser } from './protocol.js'
import type { ClientMessage, ErrorCode, ServerMessage } from './protocol.js'

export interface ChatSocketOptions {
  hub:              ChatHub
  auth:             ChatAuth
  maxMessageLength: number
  roomsPerClient:   number
  authTimeoutMs:    number
  /** URL path of the endpoint (default /ws). */
  path?:            string
}

export function attachChat(server: Server, options: ChatSocketOptions): WSServer {
  const { hub, auth } = options
  const parse = createParser(options.maxMessageLength)

  // Users whose ?token= was verified during the handshake
  const verified = new WeakMap<IncomingMessage, ChatUser>()

  const wss = new WSServer(server, {
    path:       options.path ?? '/ws',
    // A chat frame is small; refuse anything bigger than 16 KiB (close 1009)
    maxPayload: 16 * 1024,
    guard: req => {
      const token = new URL(req.url ?? '/', 'http://localhost').searchParams.get('token')
      if (token === null) return true // authenticate with the first message instead
      const user = auth.verify(token)
      if (!user) return false // 403 Forbidden, the socket never opens
      verified.set(req, user)
      return true
    }
  })

  const send = (client: WSClient, message: ServerMessage) => client.sendJSON(message)
  const error = (client: WSClient, code: ErrorCode, message: string) => send(client, { type: 'error', code, message })

  wss.on('connection', (client, req) => {
    let user = verified.get(req) ?? null
    let authTimer: ReturnType<typeof setTimeout> | undefined

    const welcome = (u: ChatUser) => {
      user = u
      clearTimeout(authTimer)
      send(client, { type: 'welcome', user: u })
    }

    if (user) {
      welcome(user)
    } else {
      authTimer = setTimeout(() => client.close(CLOSE_UNAUTHENTICATED, 'Authentication timeout'), options.authTimeoutMs)
      authTimer.unref()
    }

    client.on('message', (data, isBinary) => {
      if (isBinary) return error(client, 'BINARY_NOT_SUPPORTED', 'Send JSON text frames')

      const parsed = parse(String(data))
      if (!parsed.ok) return send(client, parsed.error)
      const msg = parsed.message

      if (!user) {
        const u = msg.type === 'auth' ? auth.verify(msg.token) : null
        if (u) return welcome(u)
        error(client, 'UNAUTHENTICATED', msg.type === 'auth' ? 'Invalid or expired token' : 'Send { "type": "auth", "token": "..." } first')
        return client.close(CLOSE_UNAUTHENTICATED, 'Unauthenticated')
      }

      handle(client, user, msg)
    })

    // WSServer has already taken the client out of its rooms; tell the others
    client.on('close', () => {
      clearTimeout(authTimer)
      if (!user) return
      for (const room of client.rooms) leaveRoom(client, user, room)
    })
  })

  function handle(client: WSClient, user: ChatUser, msg: ClientMessage): void {
    switch (msg.type) {
      case 'auth':
        return error(client, 'ALREADY_AUTHENTICATED', 'This connection is already authenticated')

      case 'join': {
        const { room } = msg
        if (!client.rooms.has(room)) {
          if (client.rooms.size >= options.roomsPerClient) {
            return error(client, 'TOO_MANY_ROOMS', \`A connection can be in at most \${options.roomsPerClient} rooms\`)
          }
          if (!hub.canOpen(room)) return error(client, 'ROOM_LIMIT', 'No more rooms can be created')
          wss.join(client, room)
          if (hub.join(room, user, client.id)) {
            wss.toRoomJSON(room, presence(room, 'join', user), [client.id])
          }
        }
        return send(client, { type: 'joined', room, members: hub.members(room), history: hub.messages(room) })
      }

      case 'leave': {
        if (!client.rooms.has(msg.room)) return error(client, 'NOT_IN_ROOM', \`Not in room "\${msg.room}"\`)
        wss.leave(client, msg.room)
        leaveRoom(client, user, msg.room)
        return send(client, { type: 'left', room: msg.room })
      }

      case 'message': {
        if (!client.rooms.has(msg.room)) return error(client, 'NOT_IN_ROOM', \`Join "\${msg.room}" before sending to it\`)
        const message = hub.post(msg.room, user, msg.text)
        // Everyone in the room, the sender included (their copy has the id and time)
        return wss.toRoomJSON(msg.room, { type: 'message', message } satisfies ServerMessage)
      }
    }
  }

  function leaveRoom(client: WSClient, user: ChatUser, room: string): void {
    if (hub.leave(room, user.id, client.id)) {
      wss.toRoomJSON(room, presence(room, 'leave', user))
    }
  }

  function presence(room: string, event: 'join' | 'leave', user: ChatUser): ServerMessage {
    return { type: 'presence', room, event, user, members: hub.members(room) }
  }

  return wss
}
`,

    'src/config.ts': `/**
 * Typed configuration, read from environment variables.
 * loadEnv() in src/main.ts fills process.env from .env first.
 */

import { defineConfig } from '@axiljs/config'

export function loadConfig(source: Record<string, string | undefined> = process.env) {
  return defineConfig({
    PORT:               { type: 'number',  default: 3002, min: 0, max: 65535 },
    HOST:               { type: 'string',  default: '127.0.0.1' },
    NODE_ENV:           { type: 'string',  default: 'development', enum: ['development', 'production', 'test'] },
    // "*" or a comma-separated list of allowed origins
    CORS_ORIGIN:        { type: 'string',  default: '*' },

    // HS256 signing key, at least 32 characters
    JWT_SECRET:         { type: 'string',  required: true },
    // Token lifetime: 30m, 12h, 7d, ...
    TOKEN_TTL:          { type: 'string',  default: '12h' },
    // POST /api/token issues a token for any display name (no password).
    // Fine for a demo; replace it with real sign-in before going public.
    DEMO_LOGIN:         { type: 'boolean', default: false },

    // Messages kept per room for GET /api/rooms/:room/messages and on join
    HISTORY_SIZE:       { type: 'number',  default: 100, min: 1, max: 10000 },
    MAX_MESSAGE_LENGTH: { type: 'number',  default: 500, min: 1, max: 10000 },
    MAX_ROOMS:          { type: 'number',  default: 1000, min: 1 },
    // Rooms one connection may be in at the same time
    ROOMS_PER_CLIENT:   { type: 'number',  default: 10, min: 1 },
    // A connection without ?token= must send { type: "auth" } within this time
    AUTH_TIMEOUT_MS:    { type: 'number',  default: 5000, min: 10 }
  }, source)
}

export type Config = ReturnType<typeof loadConfig>
`,

    'src/main.ts': `/**
 * ${ctx.name}
 * Entry point: load .env, start HTTP + WebSocket, shut down cleanly.
 */

import { loadEnv } from '@axiljs/config'
import { loadConfig } from './config.js'
import { startServer } from './server.js'

loadEnv()

const config = loadConfig()
const server = await startServer(config)

console.log(\`  Chat client: http://localhost:\${server.port}/  WebSocket: ws://localhost:\${server.port}/ws\`)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await server.close()
    process.exit(0)
  })
}
`,

    'src/middleware/error-handler.ts': `/**
 * Error handler: turns thrown errors into one JSON shape.
 *
 *   { "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }
 *
 * axilError subclasses (NotFoundError, UnauthorizedError, ValidationError, ...)
 * keep their status and code; anything else is a 500 whose message is hidden
 * in production.
 */

import { axilError } from '@axiljs/core'
import type { ErrorMiddlewareFn } from '@axiljs/core'

export function errorHandler(env: string): ErrorMiddlewareFn {
  // Four parameters: that is how Application.use() recognises an error handler
  return (err, req, res, _next) => {
    const known  = err instanceof axilError
    const status = known ? err.statusCode : 500

    if (status >= 500) console.error(\`[\${req.method} \${req.path}]\`, err)

    res.status(status).json({
      error: {
        code:    known ? err.code : 'INTERNAL_ERROR',
        message: status >= 500 && env === 'production' ? 'Internal server error' : err.message,
        ...(known && err.details !== undefined ? { details: err.details } : {})
      }
    })
  }
}
`,

    'src/server.ts': `/**
 * Listen and attach the WebSocket endpoint.
 * Used by main.ts and by the WebSocket tests (with port 0).
 */

import type { Application } from '@axiljs/core'
import type { WSServer } from '@axiljs/websocket'
import { createApp, createChatContext } from './app.js'
import type { ChatContext } from './app.js'
import { attachChat } from './chat/socket.js'
import type { Config } from './config.js'

export interface ChatServer extends ChatContext {
  app:  Application
  wss:  WSServer
  /** The bound port (useful when listening on port 0). */
  port: number
  /** Close every WebSocket (1001 Going Away), then the HTTP server. */
  close(): Promise<void>
}

export async function startServer(config: Config, port: number = config.PORT, host: string = config.HOST): Promise<ChatServer> {
  const chat = createChatContext(config)
  const app  = createApp(config, chat)

  const address = await app.listen(port, host)
  const server  = app.getServer()
  if (!server) throw new Error('HTTP server did not start')

  const wss = attachChat(server, {
    ...chat,
    maxMessageLength: config.MAX_MESSAGE_LENGTH,
    roomsPerClient:   config.ROOMS_PER_CLIENT,
    authTimeoutMs:    config.AUTH_TIMEOUT_MS
  })

  return {
    ...chat,
    app,
    wss,
    port: address.port,
    async close() {
      wss.close(1001, 'Server shutting down')
      await app.close()
    }
  }
}
`
  }),

  nextSteps: () => [
    ['Edit .env', 'Set JWT_SECRET to a random string of 32+ characters'],
    ['npm test', 'HTTP tests plus real WebSocket round-trips'],
    ['Open two browser windows after npm run dev', 'and chat with yourself']
  ]
}
