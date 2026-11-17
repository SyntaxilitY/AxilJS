/**
 * In-process Event Bus.
 * Typed publish/subscribe system for decoupled communication.
 * Works within a single process by default. Attach an EventTransport
 * (e.g. ClusterTransport) to deliver `{ broadcast: true }` emits to buses in
 * other processes; see "Cross-process events" below.
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
 *   await bus.emit('user.created', { id: 1, email: 'tariq@@axiljs.dev' })
 *
 *   // Wildcard subscription
 *   bus.on('user.*', (event) => console.log('User event:', event.type))
 *
 * Cross-process events (only when a transport is attached):
 *   - emit(type, payload, { broadcast: true }) runs local handlers exactly once
 *     AND publishes a JSON copy through the transport. `new EventBus({
 *     broadcast: true })` makes that the default; an emit can then opt out
 *     with { broadcast: false }.
 *   - Events received from the transport run local handlers (and middleware,
 *     history, once/waitFor) but are never re-published, so relays cannot loop.
 *   - Every bus has a random originId; messages carrying it are dropped, so a
 *     transport that echoes publishes back does not cause double delivery.
 *   - A broadcast payload must be plain JSON data (see assertJsonSafe); a
 *     non-serializable payload makes emit() throw before any handler runs.
 *   - Without a transport, broadcast is a no-op (local delivery only), but the
 *     JSON check still runs so mistakes surface in single-process dev too.
 */
import { axilEvent, EventHandler, Subscription, EventBusOptions, EventTransport, EmitOptions } from './types';
export declare class EventBus {
    private handlers;
    private middleware;
    private onError;
    private history;
    private historyLimit;
    private maxListeners;
    private warnedTypes;
    readonly originId: string;
    private transport;
    private transportUnsubscribe;
    private broadcastByDefault;
    constructor(options?: EventBusOptions);
    /**
     * Attach a cross-process transport (replacing any previous one), or detach
     * with `null`. The bus subscribes to it immediately. Detaching does not call
     * the transport's close(); the caller owns its lifecycle.
     */
    useTransport(transport: EventTransport | null): this;
    /**
     * The currently attached transport, or null.
     */
    getTransport(): EventTransport | null;
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
     * Local handlers always run exactly once. With `broadcast` (per emit, or
     * the bus default) and an attached transport, a JSON copy of the event is
     * also published to other processes.
     *
     * @param type     Event type string
     * @param payload  Event data
     * @param meta     Optional event metadata, plus `broadcast`
     * @throws TypeError when broadcasting a payload that is not plain JSON data
     */
    emit<T = unknown>(type: string, payload: T, meta?: EmitOptions): Promise<void>;
    /**
     * Handle a message from the transport: drop own echoes and malformed
     * messages, deliver the rest locally. Never re-published.
     */
    private receive;
    /**
     * Publish through the transport. Failures go to onError instead of
     * rejecting emit(), because local delivery has already happened.
     */
    private publish;
    /**
     * Record the event and run middleware + matching local handlers.
     */
    private dispatch;
    /**
     * Emit multiple events atomically.
     * All events are emitted before any handlers run.
     */
    emitMany<T = unknown>(events: Array<{
        type: string;
        payload: T;
        meta?: EmitOptions;
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
     * Set the listener-count warning threshold (0 = unlimited).
     */
    setMaxListeners(n: number): this;
    /**
     * Get the listener-count warning threshold (0 = unlimited).
     */
    getMaxListeners(): number;
    /**
     * Get handler count for an event type.
     */
    getHandlerCount(type: string): number;
    /**
     * Remove all handlers. Useful in tests.
     */
    clear(): void;
    /**
     * Warn (once per event type) when listener count exceeds maxListeners.
     * Mirrors Node's EventEmitter: it is a leak hint, the listener is still added.
     */
    private checkMaxListeners;
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
/**
 * Throw a TypeError unless `value` is plain JSON data that survives a
 * JSON round-trip with its meaning intact.
 *
 * Allowed: null, booleans, finite numbers, strings, arrays, plain objects
 * (prototype Object or null) and Date (arrives on the other side as an ISO
 * string). Object properties whose value is undefined are dropped, as JSON does.
 *
 * A top-level `undefined` (an event without payload) is allowed.
 *
 * Rejected: nested undefined (e.g. array items) / function / symbol / bigint
 * values, NaN and Infinity,
 * class instances (Map, Set, Buffer, Error, ...) and circular references.
 */
export declare function assertJsonSafe(value: unknown, label?: string): void;
export declare function getGlobalEventBus(): EventBus;
export declare function setGlobalEventBus(bus: EventBus): void;
//# sourceMappingURL=event-bus.d.ts.map