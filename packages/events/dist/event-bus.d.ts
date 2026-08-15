/**
 * In-process Event Bus.
 * Typed publish/subscribe system for decoupled communication.
 * Works within a single process. Phase 6 adds cross-process transport.
 *
 * Usage:
 *   const bus = new EventBus()
 *
 *   // Subscribe
 *   bus.on('user.created', async (event) => {
 *     await sendWelcomeEmail(event.payload.email)
 *   })
 *
 *   // Publish
 *   await bus.emit('user.created', { id: 1, email: 'tariq@@axil.dev' })
 *
 *   // Wildcard subscription
 *   bus.on('user.*', (event) => console.log('User event:', event.type))
 */
import { axilEvent, EventHandler, Subscription, EventBusOptions } from './types';
export declare class EventBus {
    private handlers;
    private middleware;
    private onError;
    private history;
    private historyLimit;
    constructor(options?: EventBusOptions);
    /**
     * Subscribe to an event type.
     * Supports wildcards: 'user.*' matches 'user.created', 'user.deleted', etc.
     *
     * @returns Subscription object with unsubscribe() method
     */
    on<T = unknown>(eventType: string, handler: EventHandler<T>): Subscription;
    /**
     * Subscribe to an event type once.
     * Automatically unsubscribes after the first event.
     */
    once<T = unknown>(eventType: string, handler: EventHandler<T>): Subscription;
    /**
     * Wait for the next occurrence of an event.
     * Returns a Promise that resolves with the event payload.
     *
     * Usage:
     *   const event = await bus.waitFor('payment.confirmed', 5000)
     */
    waitFor<T = unknown>(eventType: string, timeoutMs?: number): Promise<axilEvent<T>>;
    /**
     * Unsubscribe a specific handler by subscription ID.
     */
    off(eventType: string, subscriptionId: string): void;
    /**
     * Emit an event to all matching subscribers.
     * Runs middleware then calls all matching handlers.
     *
     * @param type     Event type string
     * @param payload  Event data
     * @param meta     Optional event metadata
     */
    emit<T = unknown>(type: string, payload: T, meta?: Partial<Pick<axilEvent, 'source' | 'correlationId' | 'causationId' | 'version'>>): Promise<void>;
    /**
     * Emit multiple events atomically.
     * All events are emitted before any handlers run.
     */
    emitMany<T = unknown>(events: Array<{
        type: string;
        payload: T;
        meta?: any;
    }>): Promise<void>;
    /**
     * Get recent event history.
     */
    getHistory(type?: string): axilEvent[];
    /**
     * Get all registered event types.
     */
    getEventTypes(): string[];
    /**
     * Get handler count for an event type.
     */
    getHandlerCount(type: string): number;
    /**
     * Remove all handlers. Useful in tests.
     */
    clear(): void;
    /**
     * Find all handlers matching an event type.
     * Supports wildcard patterns: 'user.*', '*.created', '*'
     */
    private findHandlers;
    /**
     * Match an event type against a pattern.
     * Patterns support * as wildcard.
     * 'user.*' matches 'user.created', 'user.deleted'
     * '*.created' matches 'user.created', 'post.created'
     * '*' matches everything
     */
    private matchPattern;
    /**
     * Run event through middleware chain then execute the action.
     */
    private runMiddleware;
}
export declare function getGlobalEventBus(): EventBus;
export declare function setGlobalEventBus(bus: EventBus): void;
//# sourceMappingURL=event-bus.d.ts.map