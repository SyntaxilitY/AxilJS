# @axiljs/events

In-process event bus with pub/sub, wildcard subscriptions, and decorators.

Part of the [AxilJS](https://github.com/SyntaxilitY/AxilJS) ecosystem.

## Install

```bash
npm install @axiljs/events
```

## Usage

```typescript
import { EventBus, OnEvent, registerEventHandlers } from '@axiljs/events'

const bus = new EventBus()

class NotificationService {
  @OnEvent('user.created')
  async onUserCreated(event: any) {
    await sendWelcomeEmail(event.payload.email)
  }

  @OnEvent('order.*')
  async onAnyOrder(event: any) { }
}

registerEventHandlers(new NotificationService(), bus)
await bus.emit('user.created', { email: 'tariq@syntaxility.dev' })
```

## Listener limits

`maxListeners` (default: unlimited) warns once per event type, like Node's
`EventEmitter`, when more listeners are added. The listener is still added.

```typescript
const bus = new EventBus({ maxListeners: 50 })
bus.setMaxListeners(100)
```

## Decorators

`@OnEvent` works with both legacy (`experimentalDecorators`) and TC39 standard
decorators. With TC39 decorators the handlers are recorded when the instance is
constructed, so call `registerEventHandlers(instance, bus)` after `new`.

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
