/**
 * A minimal in-process event bus consumer.
 * Reads `tOnEvent`, `tEmit`, `tOnce`, `tOutbox` metadata.
 */

import { getMetadata, getDecoratedMethods } from '@axiljs/decorator'

type Handler = (payload: unknown) => void | Promise<void>

class SimpleEventBus {
  private handlers = new Map<string, Handler[]>()

  on(pattern: string, handler: Handler): void {
    const list = this.handlers.get(pattern) ?? []
    list.push(handler)
    this.handlers.set(pattern, list)
  }

  async emit(event: string, payload: unknown): Promise<void> {
    for (const [pattern, handlers] of this.handlers.entries()) {
      if (matches(pattern, event)) {
        for (const handler of handlers) {
          await handler(payload)
        }
      }
    }
  }
}

function matches(pattern: string, event: string): boolean {
  if (pattern === event) return true
  if (pattern.endsWith('.*')) return event.startsWith(pattern.slice(0, -1))
  if (pattern.endsWith('.**')) return event.startsWith(pattern.slice(0, -2))
  return false
}

export const eventBus = new SimpleEventBus()

/**
 * Scans an instance for `@tOnEvent` handlers and subscribes them.
 */
export function registerEventHandlers(instance: any): void {
  const proto = Object.getPrototypeOf(instance)
  const methods = getDecoratedMethods(proto)

  for (const methodName of methods) {
    const onEventMeta = getMetadata<{ pattern: string }>('tOnEvent', proto, methodName)
    if (onEventMeta) {
      eventBus.on(onEventMeta.pattern, (payload) => instance[methodName](payload))
      console.log(`[events] ${instance.constructor.name}.${methodName} subscribed to "${onEventMeta.pattern}"`)
    }
  }
}

/**
 * Emits an event declared via `@tEmit` on a controller method,
 * respecting `@tOutbox` if present (logged here; a real outbox
 * would persist this atomically with the DB transaction).
 */
export async function emitIfDeclared(
  proto: object,
  methodName: string,
  result: unknown
): Promise<void> {
  const emitMeta = getMetadata<{ event: string }>('tEmit', proto, methodName)
  if (!emitMeta) return

  const outboxMeta = getMetadata('tOutbox', proto, methodName)
  if (outboxMeta) {
    console.log(`[outbox] queued "${emitMeta.event}" for transactional delivery`)
  }

  await eventBus.emit(emitMeta.event, result)
}