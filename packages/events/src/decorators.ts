/**
 * Event decorator helpers.
 * Zero dependencies — uses plain prototype storage, no reflect-metadata.
 */

import { EventBus } from './event-bus';
import { axilEvent } from './types';

// ─── Metadata Key ─────────────────────────────────────────────────────────────

const EVENT_HANDLERS_KEY = '__@axiljs_event_handlers__';

// ─── Metadata Type ────────────────────────────────────────────────────────────

interface EventHandlerMeta {
  eventType:  string;
  methodName: string;
}

// ─── @OnEvent Decorator ───────────────────────────────────────────────────────

/**
 * Mark a method as an event handler.
 * Compatible with both legacy and modern TypeScript decorator modes.
 *
 * Usage:
 *   @OnEvent('user.created')
 *   async handleUserCreated(event: @axilEvent) { ... }
 */
export function OnEvent(eventType: string) {
  // Return a plain function — avoids MethodDecorator signature conflicts
  return function (target: any, propertyKey: string | symbol): void {
    const methodName = String(propertyKey);

    // Initialize the handlers array on the prototype
    if (!Object.prototype.hasOwnProperty.call(target, EVENT_HANDLERS_KEY)) {
      Object.defineProperty(target, EVENT_HANDLERS_KEY, {
        value:        [],
        writable:     true,
        configurable: true,
        enumerable:   false
      });
    }

    const meta: EventHandlerMeta = { eventType, methodName };
    target[EVENT_HANDLERS_KEY].push(meta);
  };
}

// ─── registerEventHandlers ────────────────────────────────────────────────────

/**
 * Register all @OnEvent decorated methods from an instance on the event bus.
 *
 * Usage:
 *   registerEventHandlers(new NotificationService(), eventBus)
 */
export function registerEventHandlers(
  instance: object,
  bus: EventBus
): void {
  const proto = Object.getPrototypeOf(instance) as any;
  const handlers: EventHandlerMeta[] = proto[EVENT_HANDLERS_KEY] || [];

  if (handlers.length === 0) return;

  for (const { eventType, methodName } of handlers) {
    const method = (instance as any)[methodName];

    if (typeof method !== 'function') {
      console.warn(
        `[@axilJS Events] '${methodName}' is not a function on ` +
        `${instance.constructor.name}`
      );
      continue;
    }

    bus.on(eventType, (event: axilEvent) => method.call(instance, event));

    console.log(
      `\x1b[90m[@axilJS Events]\x1b[0m Registered: ` +
      `${instance.constructor.name}.${methodName} → '${eventType}'`
    );
  }
}