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

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
