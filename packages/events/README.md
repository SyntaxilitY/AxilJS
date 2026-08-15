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

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
