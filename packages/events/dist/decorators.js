"use strict";
/**
 * Event decorator helpers.
 * Zero dependencies — uses plain prototype storage, no reflect-metadata.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OnEvent = OnEvent;
exports.registerEventHandlers = registerEventHandlers;
// ─── Metadata Key ─────────────────────────────────────────────────────────────
const EVENT_HANDLERS_KEY = '__@axiljsjs_event_handlers__';
// ─── @OnEvent Decorator ───────────────────────────────────────────────────────
/**
 * Mark a method as an event handler.
 * Compatible with both legacy and modern TypeScript decorator modes.
 *
 * Usage:
 *   @OnEvent('user.created')
 *   async handleUserCreated(event: @axiljsEvent) { ... }
 */
function OnEvent(eventType) {
    // Return a plain function — avoids MethodDecorator signature conflicts.
    // Legacy (experimentalDecorators): (prototype, propertyKey, descriptor)
    // TC39 (TS 5+ standard decorators): (method, context)
    return function (target, propertyKey, _descriptor) {
        if (isTc39MethodContext(propertyKey)) {
            const context = propertyKey;
            const meta = { eventType, methodName: String(context.name) };
            // TC39 decorators don't receive the prototype; record the handler on the
            // instance when it's constructed (initializers run before the ctor body).
            context.addInitializer(function () {
                if (!Object.prototype.hasOwnProperty.call(this, EVENT_HANDLERS_KEY)) {
                    Object.defineProperty(this, EVENT_HANDLERS_KEY, {
                        value: [],
                        writable: true,
                        configurable: true,
                        enumerable: false
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
                value: [...(target[EVENT_HANDLERS_KEY] || [])],
                writable: true,
                configurable: true,
                enumerable: false
            });
        }
        const meta = { eventType, methodName };
        target[EVENT_HANDLERS_KEY].push(meta);
    };
}
function isTc39MethodContext(ctx) {
    return (ctx !== null &&
        typeof ctx === 'object' &&
        ctx.kind === 'method' &&
        typeof ctx.addInitializer === 'function');
}
// ─── registerEventHandlers ────────────────────────────────────────────────────
/**
 * Register all @OnEvent decorated methods from an instance on the event bus.
 *
 * Usage:
 *   registerEventHandlers(new NotificationService(), eventBus)
 */
function registerEventHandlers(instance, bus) {
    const proto = Object.getPrototypeOf(instance);
    // Legacy decorators store metadata on the prototype; TC39 decorators on the instance
    const ownTc39 = Object.prototype.hasOwnProperty.call(instance, EVENT_HANDLERS_KEY)
        ? instance[EVENT_HANDLERS_KEY]
        : [];
    const handlers = [...(proto?.[EVENT_HANDLERS_KEY] || []), ...ownTc39];
    if (handlers.length === 0)
        return;
    for (const { eventType, methodName } of handlers) {
        const method = instance[methodName];
        if (typeof method !== 'function') {
            console.warn(`[AxilJS Events] '${methodName}' is not a function on ` +
                `${instance.constructor.name}`);
            continue;
        }
        bus.on(eventType, (event) => method.call(instance, event));
        console.log(`\x1b[90m[AxilJS Events]\x1b[0m Registered: ` +
            `${instance.constructor.name}.${methodName} → '${eventType}'`);
    }
}
//# sourceMappingURL=decorators.js.map