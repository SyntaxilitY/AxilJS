/**
 * Core event system types.
 * Used across the entire @axilJS event infrastructure.
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
}
export type EventMiddleware = (event: axilEvent, next: () => Promise<void>) => Promise<void>;
//# sourceMappingURL=types.d.ts.map