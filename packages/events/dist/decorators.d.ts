/**
 * Event decorator helpers.
 * Zero dependencies — uses plain prototype storage, no reflect-metadata.
 */
import { EventBus } from './event-bus';
/**
 * Mark a method as an event handler.
 * Compatible with both legacy and modern TypeScript decorator modes.
 *
 * Usage:
 *   @OnEvent('user.created')
 *   async handleUserCreated(event: @axiljsEvent) { ... }
 */
export declare function OnEvent(eventType: string): (target: any, propertyKey: any, _descriptor?: any) => void;
export interface EventsLogger {
    info(msg: string): void;
    warn(msg: string): void;
}
export interface RegisterEventHandlersOptions {
    logger?: EventsLogger | false;
}
/**
 * Register all @OnEvent decorated methods from an instance on the event bus.
 *
 * Usage:
 *   registerEventHandlers(new NotificationService(), eventBus)
 *   registerEventHandlers(new NotificationService(), eventBus, { logger: false })
 */
export declare function registerEventHandlers(instance: object, bus: EventBus, options?: RegisterEventHandlersOptions): void;
//# sourceMappingURL=decorators.d.ts.map