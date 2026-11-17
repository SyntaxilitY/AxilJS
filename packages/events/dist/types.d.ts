/**
 * Core event system types.
 * Used across the entire AxilJS event infrastructure.
 */
export interface axilEvent<T = unknown> {
    type: string;
    payload: T;
    id: string;
    timestamp: string;
    source?: string;
    correlationId?: string;
    causationId?: string;
    version?: number;
}
export type EventHandler<T = unknown> = (event: axilEvent<T>) => void | Promise<void>;
export interface Subscription {
    unsubscribe(): void;
    eventType: string;
    id: string;
}
export interface EventBusOptions {
    maxListeners?: number;
    async?: boolean;
    onError?: (error: Error, event: axilEvent) => void;
    middleware?: EventMiddleware[];
    transport?: EventTransport;
    broadcast?: boolean;
}
export type EventMiddleware = (event: axilEvent, next: () => Promise<void>) => Promise<void>;
/**
 * What a bus hands to (and receives from) a transport.
 * `origin` is the sending bus's random per-instance id; a bus drops messages
 * carrying its own origin, so a transport may echo publishes back safely.
 * `event` is a JSON-safe copy of the emitted event.
 */
export interface EventTransportMessage {
    origin: string;
    event: axilEvent;
}
/**
 * Pluggable carrier that moves events between buses in other processes
 * (or other bus instances). Implementations must deliver a message to the
 * subscribers of every *other* participant; delivering it back to the sender
 * is allowed (the bus ignores its own origin) but not required.
 */
export interface EventTransport {
    publish(message: EventTransportMessage): void | Promise<void>;
    subscribe(handler: (message: EventTransportMessage) => void): () => void;
    close?(): void | Promise<void>;
}
/**
 * Per-emit options: the event metadata plus `broadcast`.
 * `broadcast: true` also publishes the event through the bus's transport;
 * `broadcast: false` keeps it local even when the bus broadcasts by default.
 */
export type EmitOptions = Partial<Pick<axilEvent, 'source' | 'correlationId' | 'causationId' | 'version'>> & {
    broadcast?: boolean;
};
//# sourceMappingURL=types.d.ts.map