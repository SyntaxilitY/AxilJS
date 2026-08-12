/**
 * Core event system types.
 * Used across the entire REstJS event infrastructure.
 */
export interface REstEvent<T = unknown> {
    type: string;
    payload: T;
    id: string;
    timestamp: string;
    source?: string;
    correlationId?: string;
    causationId?: string;
    version?: number;
}
export type EventHandler<T = unknown> = (event: REstEvent<T>) => void | Promise<void>;
export interface Subscription {
    unsubscribe(): void;
    eventType: string;
    id: string;
}
export interface EventBusOptions {
    maxListeners?: number;
    async?: boolean;
    onError?: (error: Error, event: REstEvent) => void;
    middleware?: EventMiddleware[];
}
export type EventMiddleware = (event: REstEvent, next: () => Promise<void>) => Promise<void>;
//# sourceMappingURL=types.d.ts.map