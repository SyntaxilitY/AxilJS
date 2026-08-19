"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CircuitBreaker = exports.CircuitOpenError = void 0;
const events_1 = require("events");
// ─── Circuit Breaker Error ─────────────────────────────────────────────────────
class CircuitOpenError extends Error {
    constructor(name) {
        super(`Circuit '${name}' is OPEN - service unavailable`);
        this.name = 'CircuitOpenError';
    }
}
exports.CircuitOpenError = CircuitOpenError;
// ─── Circuit Breaker ──────────────────────────────────────────────────────────
class CircuitBreaker extends events_1.EventEmitter {
    name;
    state = 'CLOSED';
    failureCount = 0;
    successCount = 0;
    requestCount = 0;
    lastFailureTime = 0;
    nextAttemptTime = 0;
    options;
    constructor(name, options = {}) {
        super();
        this.name = name;
        this.options = {
            failureThreshold: options.failureThreshold ?? 5,
            resetTimeoutMs: options.resetTimeoutMs ?? 60000,
            requestTimeoutMs: options.requestTimeoutMs ?? 10000,
            minimumRequests: options.minimumRequests ?? 10,
            failureRateThreshold: options.failureRateThreshold ?? 0.5,
            fallback: options.fallback ?? (() => { throw new CircuitOpenError(name); })
        };
    }
    // ─── Execute ─────────────────────────────────────────────────────────────────
    /**
     * Execute a function through the circuit breaker.
     * If circuit is OPEN, returns fallback result or throws CircuitOpenError.
     *
     * @param fn  Async function to protect
     */
    async execute(fn) {
        // Check current state
        if (this.state === 'OPEN') {
            // Check if reset timeout has expired
            if (Date.now() >= this.nextAttemptTime) {
                this.transitionTo('HALF_OPEN');
            }
            else {
                // Still OPEN - use fallback
                return this.options.fallback();
            }
        }
        // Execute the function with timeout
        try {
            const result = await this.withTimeout(fn, this.options.requestTimeoutMs);
            this.onSuccess();
            return result;
        }
        catch (error) {
            this.onFailure(error);
            throw error;
        }
    }
    // ─── State ────────────────────────────────────────────────────────────────────
    /**
     * Get current circuit state.
     */
    getState() {
        return this.state;
    }
    /**
     * Get circuit statistics.
     */
    getStats() {
        return {
            state: this.state,
            failureCount: this.failureCount,
            successCount: this.successCount,
            requestCount: this.requestCount,
            failureRate: this.requestCount > 0
                ? this.failureCount / this.requestCount
                : 0
        };
    }
    /**
     * Manually reset the circuit to CLOSED state.
     */
    reset() {
        this.failureCount = 0;
        this.successCount = 0;
        this.requestCount = 0;
        this.transitionTo('CLOSED');
    }
    // ─── Internal ────────────────────────────────────────────────────────────────
    onSuccess() {
        this.successCount++;
        this.requestCount++;
        if (this.state === 'HALF_OPEN') {
            // Success in half-open state → close the circuit
            this.failureCount = 0;
            this.transitionTo('CLOSED');
        }
    }
    onFailure(error) {
        this.failureCount++;
        this.requestCount++;
        this.lastFailureTime = Date.now();
        if (this.state === 'HALF_OPEN') {
            // Failure in half-open state → reopen circuit
            this.transitionTo('OPEN');
            return;
        }
        // Check if we should open the circuit
        if (this.shouldOpen()) {
            this.transitionTo('OPEN');
        }
    }
    shouldOpen() {
        // Need minimum requests before making a decision
        if (this.requestCount < this.options.minimumRequests) {
            return this.failureCount >= this.options.failureThreshold;
        }
        // Check failure rate
        const failureRate = this.failureCount / this.requestCount;
        return failureRate >= this.options.failureRateThreshold;
    }
    transitionTo(newState) {
        const previousState = this.state;
        this.state = newState;
        if (newState === 'OPEN') {
            this.nextAttemptTime = Date.now() + this.options.resetTimeoutMs;
        }
        if (previousState !== newState) {
            console.log(`\x1b[33m[CircuitBreaker]\x1b[0m '${this.name}': ` +
                `${previousState} → ${newState}`);
            this.emit('stateChange', newState, previousState);
        }
    }
    /**
     * Execute a function with a timeout.
     */
    withTimeout(fn, timeoutMs) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Request timeout after ${timeoutMs}ms`));
            }, timeoutMs);
            fn()
                .then(result => {
                clearTimeout(timer);
                resolve(result);
            })
                .catch(error => {
                clearTimeout(timer);
                reject(error);
            });
        });
    }
}
exports.CircuitBreaker = CircuitBreaker;
//# sourceMappingURL=circuit-breaker.js.map