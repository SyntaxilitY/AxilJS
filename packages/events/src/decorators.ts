/**
 * Event decorator helpers.
 * Zero dependencies — uses plain prototype storage, no reflect-metadata.
 */

import { EventBus } from './event-bus';
import { axilEvent } from './types';

// ─── Metadata Key ─────────────────────────────────────────────────────────────

const EVENT_HANDLERS_KEY = '__@axiljsjs_event_handlers__';

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
 *   async handleUserCreated(event: @axiljsEvent) { ... }
 */
export function OnEvent(eventType: string) {
  // Return a plain function — avoids MethodDecorator signature conflicts.
  // Legacy (experimentalDecorators): (prototype, propertyKey, descriptor)
  // TC39 (TS 5+ standard decorators): (method, context)
  return function (target: any, propertyKey: any, _descriptor?: any): void {
    if (isTc39MethodContext(propertyKey)) {
      const context = propertyKey;
      const meta: EventHandlerMeta = { eventType, methodName: String(context.name) };
      // TC39 decorators don't receive the prototype; record the handler on the
      // instance when it's constructed (initializers run before the ctor body).
      context.addInitializer(function (this: any) {
        if (!Object.prototype.hasOwnProperty.call(this, EVENT_HANDLERS_KEY)) {
          Object.defineProperty(this, EVENT_HANDLERS_KEY, {
            value:        [],
            writable:     true,
            configurable: true,
            enumerable:   false
          });
        }
        this[EVENT_HANDLERS_KEY].push(meta);
      });
      return;
    }

    const methodName = String(propertyKey);

    // Initialize the handlers array on the prototype
    if (!Object.prototype.hasOwnProperty.call(target, EVENT_HANDLERS_KEY)) {
      Object.defineProperty(target, EVENT_HANDLERS_KEY, {
        // Copy handlers inherited from a parent class so they aren't lost
        value:        [...(target[EVENT_HANDLERS_KEY] || [])],
        writable:     true,
        configurable: true,
        enumerable:   false
      });
    }

    const meta: EventHandlerMeta = { eventType, methodName };
    target[EVENT_HANDLERS_KEY].push(meta);
  };
}

function isTc39MethodContext(ctx: any): ctx is {
  kind: string;
  name: string | symbol;
  addInitializer(fn: (this: any) => void): void;
} {
  return (
    ctx !== null &&
    typeof ctx === 'object' &&
    ctx.kind === 'method' &&
    typeof ctx.addInitializer === 'function'
  );
}

// ─── registerEventHandlers ────────────────────────────────────────────────────

export interface EventsLogger {
  info(msg: string): void;
  warn(msg: string): void;
}

export interface RegisterEventHandlersOptions {
  // Where "Registered: ..." / "not a function" messages go.
  // Default: console (unchanged). false: silent.
  // { info, warn }: plain-text messages to your logger.
  logger?: EventsLogger | false;
}

/**
 * Register all @OnEvent decorated methods from an instance on the event bus.
 *
 * Usage:
 *   registerEventHandlers(new NotificationService(), eventBus)
 *   registerEventHandlers(new NotificationService(), eventBus, { logger: false })
 */
export function registerEventHandlers(
  instance: object,
  bus: EventBus,
  options: RegisterEventHandlersOptions = {}
): void {
  const { logger } = options;
  const proto = Object.getPrototypeOf(instance) as any;
  // Legacy decorators store metadata on the prototype; TC39 decorators on the instance
  const ownTc39: EventHandlerMeta[] = Object.prototype.hasOwnProperty.call(instance, EVENT_HANDLERS_KEY)
    ? (instance as any)[EVENT_HANDLERS_KEY]
    : [];
  const handlers: EventHandlerMeta[] = [...(proto?.[EVENT_HANDLERS_KEY] || []), ...ownTc39];

  if (handlers.length === 0) return;

  for (const { eventType, methodName } of handlers) {
    const method = (instance as any)[methodName];

    if (typeof method !== 'function') {
      const msg = `[AxilJS Events] '${methodName}' is not a function on ${instance.constructor.name}`;
      if (logger === undefined) console.warn(msg);
      else if (logger) logger.warn(msg);
      continue;
    }

    bus.on(eventType, (event: axilEvent) => method.call(instance, event));

    const msg = `Registered: ${instance.constructor.name}.${methodName} → '${eventType}'`;
    if (logger === undefined) console.log(`\x1b[90m[AxilJS Events]\x1b[0m ${msg}`);
    else if (logger) logger.info(`[AxilJS Events] ${msg}`);
  }
}