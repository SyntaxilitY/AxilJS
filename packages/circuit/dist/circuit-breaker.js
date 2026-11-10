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
exports.CircuitBreaker = exports.BulkheadRejectedError = exports.CircuitOpenError = void 0;
const events_1 = require("events");
// ─── Circuit Breaker Error ─────────────────────────────────────────────────────
class CircuitOpenError extends Error {
    constructor(name) {
        super(`Circuit '${name}' is OPEN - service unavailable`);
        this.name = 'CircuitOpenError';
    }
}
exports.CircuitOpenError = CircuitOpenError;
class BulkheadRejectedError extends Error {
    constructor(name, maxConcurrent) {
        super(`Circuit '${name}' bulkhead is full (maxConcurrent: ${maxConcurrent})`);
        this.name = 'BulkheadRejectedError';
    }
}
exports.BulkheadRejectedError = BulkheadRejectedError;
// ─── Circuit Breaker ──────────────────────────────────────────────────────────
class CircuitBreaker extends events_1.EventEmitter {
    name;
    state = 'CLOSED';
    failureCount = 0;
    successCount = 0;
    requestCount = 0;
    lastFailureTime = 0;
    nextAttemptTime = 0;
    halfOpenProbeInFlight = false;
    // Incremented on every state change; results from requests started in an
    // earlier epoch are ignored (e.g. late failures must not extend OPEN)
    epoch = 0;
    // Rolling-window outcomes (only used when rollingWindowMs > 0), oldest first
    outcomes = [];
    // Bulkhead state
    activeCount = 0;
    waiters = [];
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
            fallback: options.fallback ?? (() => { throw new CircuitOpenError(name); }),
            rollingWindowMs: options.rollingWindowMs ?? 0,
            maxConcurrent: options.maxConcurrent ?? Infinity,
            maxQueue: options.maxQueue ?? 0
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
        // Fail fast while OPEN, before taking a bulkhead slot
        if (this.state === 'OPEN' && Date.now() < this.nextAttemptTime) {
            return this.options.fallback();
        }
        if (this.options.maxConcurrent === Infinity) {
            return this.executeGuarded(fn);
        }
        await this.acquireSlot();
        try {
            return await this.executeGuarded(fn);
        }
        finally {
            this.releaseSlot();
        }
    }
    async executeGuarded(fn) {
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
        // HALF_OPEN allows only a single probe request through at a time
        let isProbe = false;
        if (this.state === 'HALF_OPEN') {
            if (this.halfOpenProbeInFlight) {
                return this.options.fallback();
            }
            this.halfOpenProbeInFlight = true;
            isProbe = true;
        }
        // Results only count if no state change happened while in flight
        const startEpoch = this.epoch;
        // Execute the function with timeout
        try {
            const result = await this.withTimeout(fn, this.options.requestTimeoutMs);
            if (startEpoch === this.epoch)
                this.onSuccess();
            return result;
        }
        catch (error) {
            if (startEpoch === this.epoch)
                this.onFailure(error);
            throw error;
        }
        finally {
            if (isProbe)
                this.halfOpenProbeInFlight = false;
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
        this.pruneWindow();
        return {
            state: this.state,
            failureCount: this.failureCount,
            successCount: this.successCount,
            requestCount: this.requestCount,
            failureRate: this.requestCount > 0
                ? this.failureCount / this.requestCount
                : 0,
            activeCount: this.activeCount,
            queuedCount: this.waiters.length
        };
    }
    /**
     * Manually reset the circuit to CLOSED state.
     */
    reset() {
        this.clearCounters();
        this.transitionTo('CLOSED');
    }
    // ─── Internal ────────────────────────────────────────────────────────────────
    onSuccess() {
        this.record(false);
        if (this.state === 'HALF_OPEN') {
            // Success in half-open state → close the circuit with fresh counters
            // (stale request/success counts would otherwise dilute the failure rate)
            this.clearCounters();
            this.transitionTo('CLOSED');
        }
    }
    onFailure(error) {
        this.record(true);
        this.lastFailureTime = Date.now();
        // Already OPEN: never extend the OPEN timer
        if (this.state === 'OPEN')
            return;
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
    record(failed) {
        if (failed)
            this.failureCount++;
        else
            this.successCount++;
        this.requestCount++;
        if (this.options.rollingWindowMs > 0) {
            this.outcomes.push({ time: Date.now(), failed });
            this.pruneWindow();
        }
    }
    /**
     * Drop outcomes older than the rolling window and decrement counters.
     */
    pruneWindow() {
        if (this.options.rollingWindowMs <= 0)
            return;
        const cutoff = Date.now() - this.options.rollingWindowMs;
        let drop = 0;
        while (drop < this.outcomes.length && this.outcomes[drop].time <= cutoff) {
            const o = this.outcomes[drop];
            if (o.failed)
                this.failureCount--;
            else
                this.successCount--;
            this.requestCount--;
            drop++;
        }
        if (drop > 0)
            this.outcomes.splice(0, drop);
    }
    clearCounters() {
        this.failureCount = 0;
        this.successCount = 0;
        this.requestCount = 0;
        this.outcomes = [];
    }
    acquireSlot() {
        if (this.activeCount < this.options.maxConcurrent) {
            this.activeCount++;
            return Promise.resolve();
        }
        if (this.waiters.length < this.options.maxQueue) {
            // The slot is handed over directly by releaseSlot()
            return new Promise(resolve => this.waiters.push(resolve));
        }
        this.emit('bulkheadRejected');
        return Promise.reject(new BulkheadRejectedError(this.name, this.options.maxConcurrent));
    }
    releaseSlot() {
        const next = this.waiters.shift();
        if (next) {
            next(); // slot transfers to the waiter; activeCount unchanged
        }
        else {
            this.activeCount--;
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
        if (previousState !== newState)
            this.epoch++;
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
            new Promise(res => res(fn()))
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