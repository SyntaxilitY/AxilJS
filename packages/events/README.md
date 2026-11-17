# @axiljs/events

Event bus with pub/sub, wildcard subscriptions, decorators, and optional cross-process delivery (node:cluster or a custom transport).

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

`registerEventHandlers` logs each registration to the console by default. Pass
`{ logger: false }` to silence it, or `{ logger: { info, warn } }` to route the
(plain-text) messages to your own logger:

```typescript
registerEventHandlers(new NotificationService(), bus, { logger: false })
```

## Cross-process events

By default the bus is in-process only. With `@axiljs/scale` cluster mode each
worker has its own bus, so attach a transport to reach the other workers.

```typescript
import { EventBus, ClusterTransport, installClusterEventRelay } from '@axiljs/events'

// Top level of the entry file, so it runs in the primary as well.
// No-op in workers and in single-process mode.
installClusterEventRelay()

const bus = new EventBus({ transport: new ClusterTransport() })

bus.on('cache.*', (event) => cache.delete(event.payload.key))

await bus.emit('cache.invalidate', { key: 'users' }, { broadcast: true })  // all workers
await bus.emit('cache.warmed', { key: 'users' })                           // this worker only
```

Rules:

- Only emits with `{ broadcast: true }` leave the process. `new EventBus({ transport, broadcast: true })`
  makes broadcasting the default, and an emit can opt out with `{ broadcast: false }`.
- Local handlers run exactly once per emit, whether or not it is broadcast.
- Events received from the transport run local handlers, middleware, `once` and `waitFor`, and are
  recorded in history, but are never re-published, so relays cannot loop.
- Each bus has a random `originId`; messages carrying the bus's own id are dropped.
- Broadcast payloads must be plain JSON data: primitives, arrays, plain objects and `Date` (received
  as an ISO string). Functions, symbols, `bigint`, `NaN`/`Infinity`, class instances (`Map`, `Set`,
  `Buffer`, `Error`, ...) and circular references make `emit` throw a `TypeError` before any handler
  runs. The check also runs when no transport is attached. `assertJsonSafe(value)` is exported.
- Without a transport, `broadcast` only delivers locally. A transport publish failure is reported to
  `onError` and does not reject `emit`.
- `bus.useTransport(transport)` attaches or replaces a transport at runtime; `useTransport(null)` detaches it.

`ClusterTransport` sends `{ __axil: 'events', v: 1, origin, event }` over the worker's IPC channel and
ignores every other message. Without an IPC channel it is inert. `installClusterEventRelay()` forwards
each envelope from a worker to every other connected worker, including workers forked later. It can be
called more than once and returns a disposer. Both accept an injectable `channel` / `host` for testing.

Delivery is fire-and-forget with no persistence or acknowledgement: a worker that is restarting misses
events sent meanwhile. Use `@axiljs/queue` or an external broker when delivery must be guaranteed.

For tests, or several buses in one process, link buses in memory:

```typescript
import { EventBus, createLinkedTransports } from '@axiljs/events'

const [ta, tb] = createLinkedTransports(2)
const a = new EventBus({ transport: ta })
const b = new EventBus({ transport: tb })
```

A custom transport (Redis, NATS, ...) implements `EventTransport`:
`publish(message)`, `subscribe(handler) => unsubscribe`, and optional `close()`.

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
