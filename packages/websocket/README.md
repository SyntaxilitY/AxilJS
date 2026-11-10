# @axiljs/websocket

RFC 6455 WebSocket server with rooms, broadcasting, and ping/pong.

Part of the [AxilJS](https://github.com/SyntaxilitY/AxilJS) ecosystem.

## Install

```bash
npm install @axiljs/websocket
```

## Usage

```typescript
import { WSServer } from '@axiljs/websocket'

const wss = new WSServer(app.getServer(), { path: '/ws' })

wss.on('connection', (client) => {
  wss.join(client, 'general')
  client.sendJSON({ type: 'welcome', id: client.id })

  client.on('message', (data) => {
    wss.toRoomJSON('general', { from: client.id, data: data.toString() })
  })
})
```

## Limits and protocol enforcement

```typescript
new WSServer(server, {
  path: '/ws',
  maxPayload: 16 * 1024 * 1024, // default 16 MiB, per frame and per reassembled message
  closeTimeoutMs: 5000,         // destroy the socket if the peer doesn't answer our close frame
  heartbeatIntervalMs: 30000    // ping interval; 0 disables
})
```

- Oversized frames/messages close with **1009** (checked on the declared length,
  before the payload is buffered).
- RFC 6455 violations close with **1002**: unmasked client frames, RSV bits,
  unknown opcodes, control frames over 125 bytes or fragmented, bad continuation
  frames, invalid close codes. Invalid UTF-8 in text frames closes with **1007**.
- Heartbeat: a client that hasn't answered the previous ping with a pong by the
  next tick is terminated (`close` fires with 1006).
- Upgrades for other paths are left alone for other `upgrade` handlers. A
  non-WebSocket upgrade on the configured path gets `400`.
- `wss.close(code?, reason?)` closes every client; `client.terminate()` drops one
  without a handshake.

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
