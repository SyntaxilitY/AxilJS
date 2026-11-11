/**
 * Circuit Breaker.
 * Protects services from cascading failures.
 *
 * States:
 *   CLOSED   → Normal operation. Requests pass through.
 *   OPEN     → Circuit is tripped. Requests are rejected immediately.
 *   HALF_OPEN → Testing if service recovered. One request allowed through.
 *
 *                    failure threshold exceeded
 *   CLOSED ──────────────────────────────────→ OPEN
 *     ↑                                          │
 *     │ success                                  │ reset timeout expired
 *     └───────────── HALF_OPEN ←────────────────┘
 *                       │
 *                       └─── failure → back to OPEN
 *
 * Usage:
 *   const cb = new CircuitBreaker('payment-service', {
 *     failureThreshold: 5,
 *     resetTimeoutMs: 60000
 *   })
 *
 *   const result = await cb.execute(() => paymentService.charge(amount))
 */
import { EventEmitter } from 'events';
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';
export interface CircuitLogger {
    info(msg: string): void;
    warn(msg: string): void;
}
export interface CircuitBreakerOptions {
    failureThreshold?: number;
    resetTimeoutMs?: number;
    requestTimeoutMs?: number;
    minimumRequests?: number;
    failureRateThreshold?: number;
    fallback?: () => unknown;
    rollingWindowMs?: number;
    maxConcurrent?: number;
    maxQueue?: number;
    logger?: CircuitLogger | false;
}
export declare class CircuitOpenError extends Error {
    constructor(name: string);
}
export declare class BulkheadRejectedError extends Error {
    constructor(name: string, maxConcurrent: number);
}
export declare class CircuitBreaker extends EventEmitter {
    readonly name: string;
    private state;
    private failureCount;
    private successCount;
    private requestCount;
    private lastFailureTime;
    private nextAttemptTime;
    private halfOpenProbeInFlight;
    private epoch;
    private outcomes;
    private activeCount;
    private waiters;
    private options;
    private logger;
    constructor(name: string, options?: CircuitBreakerOptions);
    /**
     * Execute a function through the circuit breaker.
     * If circuit is OPEN, returns fallback result or throws CircuitOpenError.
     *
     * @param fn  Async function to protect
     */
    execute<T>(fn: () => Promise<T>): Promise<T>;
    private executeGuarded;
    /**
     * Get current circuit state.
     */
    getState(): CircuitState;
    /**
     * Get circuit statistics.
     */
    getStats(): {
        state: CircuitState;
        failureCount: number;
        successCount: number;
        requestCount: number;
        failureRate: number;
        activeCount: number;
        queuedCount: number;
    };
    /**
     * Manually reset the circuit to CLOSED state.
     */
    reset(): void;
    private onSuccess;
    private onFailure;
    private record;
    /**
     * Drop outcomes older than the rolling window and decrement counters.
     */
    private pruneWindow;
    private clearCounters;
    private acquireSlot;
    private releaseSlot;
    private shouldOpen;
    private transitionTo;
    /**
     * Execute a function with a timeout.
     */
    private withTimeout;
}
//# sourceMappingURL=circuit-breaker.d.ts.map