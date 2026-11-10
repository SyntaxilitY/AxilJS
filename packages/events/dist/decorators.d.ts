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
/**
 * Register all @OnEvent decorated methods from an instance on the event bus.
 *
 * Usage:
 *   registerEventHandlers(new NotificationService(), eventBus)
 */
export declare function registerEventHandlers(instance: object, bus: EventBus): void;
//# sourceMappingURL=decorators.d.ts.map