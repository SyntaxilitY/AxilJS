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

// ─── State ────────────────────────────────────────────────────────────────────

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

// ─── Logger ───────────────────────────────────────────────────────────────────

export interface CircuitLogger {
  info(msg: string): void;
  warn(msg: string): void;
}

// ─── Options ──────────────────────────────────────────────────────────────────

export interface CircuitBreakerOptions {
  // Failures before opening circuit (default: 5)
  failureThreshold?: number;

  // Time in OPEN state before trying HALF_OPEN (ms, default: 60000)
  resetTimeoutMs?: number;

  // Timeout for individual requests (ms, default: 10000)
  requestTimeoutMs?: number;

  // Minimum requests before calculating failure rate (default: 10)
  minimumRequests?: number;

  // Failure percentage threshold 0-1 (default: 0.5 = 50%)
  failureRateThreshold?: number;

  // Fallback function called when circuit is OPEN
  fallback?: () => unknown;

  // Count failures/requests only within this rolling time window (ms).
  // Default: 0 = cumulative counters (reset only on state changes / reset()).
  rollingWindowMs?: number;

  // Bulkhead: max concurrent executions (default: unlimited)
  maxConcurrent?: number;

  // Bulkhead: how many calls may wait for a free slot when maxConcurrent is
  // reached (default: 0 = reject immediately with BulkheadRejectedError)
  maxQueue?: number;

  // Where state-change messages go.
  // Default: console.log with ANSI colour (unchanged). false: silent.
  // { info, warn }: plain-text messages to your logger.
  // State changes are always observable via the 'stateChange' event:
  //   cb.on('stateChange', (next, previous) => ...)
  logger?: CircuitLogger | false;
}

// ─── Circuit Breaker Error ─────────────────────────────────────────────────────

export class CircuitOpenError extends Error {
  constructor(name: string) {
    super(`Circuit '${name}' is OPEN - service unavailable`);
    this.name = 'CircuitOpenError';
  }
}

export class BulkheadRejectedError extends Error {
  constructor(name: string, maxConcurrent: number) {
    super(`Circuit '${name}' bulkhead is full (maxConcurrent: ${maxConcurrent})`);
    this.name = 'BulkheadRejectedError';
  }
}

// ─── Circuit Breaker ──────────────────────────────────────────────────────────

export class CircuitBreaker extends EventEmitter {
  private state: CircuitState = 'CLOSED';
  private failureCount: number = 0;
  private successCount: number = 0;
  private requestCount: number = 0;
  private lastFailureTime: number = 0;
  private nextAttemptTime: number = 0;
  private halfOpenProbeInFlight: boolean = false;

  // Incremented on every state change; results from requests started in an
  // earlier epoch are ignored (e.g. late failures must not extend OPEN)
  private epoch: number = 0;

  // Rolling-window outcomes (only used when rollingWindowMs > 0), oldest first
  private outcomes: Array<{ time: number; failed: boolean }> = [];

  // Bulkhead state
  private activeCount: number = 0;
  private waiters: Array<() => void> = [];

  private options: Required<Omit<CircuitBreakerOptions, 'logger'>>;
  private logger: CircuitLogger | false | undefined;

  constructor(
    public readonly name: string,
    options: CircuitBreakerOptions = {}
  ) {
    super();

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
    this.logger = options.logger;
  }

  // ─── Execute ─────────────────────────────────────────────────────────────────

  /**
   * Execute a function through the circuit breaker.
   * If circuit is OPEN, returns fallback result or throws CircuitOpenError.
   *
   * @param fn  Async function to protect
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Fail fast while OPEN, before taking a bulkhead slot
    if (this.state === 'OPEN' && Date.now() < this.nextAttemptTime) {
      return this.options.fallback() as T;
    }

    if (this.options.maxConcurrent === Infinity) {
      return this.executeGuarded(fn);
    }

    await this.acquireSlot();
    try {
      return await this.executeGuarded(fn);
    } finally {
      this.releaseSlot();
    }
  }

  private async executeGuarded<T>(fn: () => Promise<T>): Promise<T> {
    // Check current state
    if (this.state === 'OPEN') {
      // Check if reset timeout has expired
      if (Date.now() >= this.nextAttemptTime) {
        this.transitionTo('HALF_OPEN');
      } else {
        // Still OPEN - use fallback
        return this.options.fallback() as T;
      }
    }

    // HALF_OPEN allows only a single probe request through at a time
    let isProbe = false;
    if (this.state === 'HALF_OPEN') {
      if (this.halfOpenProbeInFlight) {
        return this.options.fallback() as T;
      }
      this.halfOpenProbeInFlight = true;
      isProbe = true;
    }

    // Results only count if no state change happened while in flight
    const startEpoch = this.epoch;

    // Execute the function with timeout
    try {
      const result = await this.withTimeout(fn, this.options.requestTimeoutMs);
      if (startEpoch === this.epoch) this.onSuccess();
      return result;
    } catch (error) {
      if (startEpoch === this.epoch) this.onFailure(error as Error);
      throw error;
    } finally {
      if (isProbe) this.halfOpenProbeInFlight = false;
    }
  }

  // ─── State ────────────────────────────────────────────────────────────────────

  /**
   * Get current circuit state.
   */
  getState(): CircuitState {
    return this.state;
  }

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
  } {
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
  reset(): void {
    this.clearCounters();
    this.transitionTo('CLOSED');
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  private onSuccess(): void {
    this.record(false);

    if (this.state === 'HALF_OPEN') {
      // Success in half-open state → close the circuit with fresh counters
      // (stale request/success counts would otherwise dilute the failure rate)
      this.clearCounters();
      this.transitionTo('CLOSED');
    }
  }

  private onFailure(error: Error): void {
    this.record(true);
    this.lastFailureTime = Date.now();

    // Already OPEN: never extend the OPEN timer
    if (this.state === 'OPEN') return;

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

  private record(failed: boolean): void {
    if (failed) this.failureCount++;
    else this.successCount++;
    this.requestCount++;

    if (this.options.rollingWindowMs > 0) {
      this.outcomes.push({ time: Date.now(), failed });
      this.pruneWindow();
    }
  }

  /**
   * Drop outcomes older than the rolling window and decrement counters.
   */
  private pruneWindow(): void {
    if (this.options.rollingWindowMs <= 0) return;
    const cutoff = Date.now() - this.options.rollingWindowMs;
    let drop = 0;
    while (drop < this.outcomes.length && this.outcomes[drop].time <= cutoff) {
      const o = this.outcomes[drop];
      if (o.failed) this.failureCount--;
      else this.successCount--;
      this.requestCount--;
      drop++;
    }
    if (drop > 0) this.outcomes.splice(0, drop);
  }

  private clearCounters(): void {
    this.failureCount = 0;
    this.successCount = 0;
    this.requestCount = 0;
    this.outcomes = [];
  }

  private acquireSlot(): Promise<void> {
    if (this.activeCount < this.options.maxConcurrent) {
      this.activeCount++;
      return Promise.resolve();
    }
    if (this.waiters.length < this.options.maxQueue) {
      // The slot is handed over directly by releaseSlot()
      return new Promise<void>(resolve => this.waiters.push(resolve));
    }
    this.emit('bulkheadRejected');
    return Promise.reject(new BulkheadRejectedError(this.name, this.options.maxConcurrent));
  }

  private releaseSlot(): void {
    const next = this.waiters.shift();
    if (next) {
      next(); // slot transfers to the waiter; activeCount unchanged
    } else {
      this.activeCount--;
    }
  }

  private shouldOpen(): boolean {
    // Need minimum requests before making a decision
    if (this.requestCount < this.options.minimumRequests) {
      return this.failureCount >= this.options.failureThreshold;
    }

    // Check failure rate
    const failureRate = this.failureCount / this.requestCount;
    return failureRate >= this.options.failureRateThreshold;
  }

  private transitionTo(newState: CircuitState): void {
    const previousState = this.state;
    this.state = newState;
    if (previousState !== newState) this.epoch++;

    if (newState === 'OPEN') {
      this.nextAttemptTime = Date.now() + this.options.resetTimeoutMs;
    }

    if (previousState !== newState) {
      const msg = `'${this.name}': ${previousState} → ${newState}`;
      if (this.logger === undefined) {
        console.log(`\x1b[33m[CircuitBreaker]\x1b[0m ${msg}`);
      } else if (this.logger) {
        // Opening is the noteworthy transition; recovery is informational
        if (newState === 'OPEN') this.logger.warn(`[CircuitBreaker] ${msg}`);
        else this.logger.info(`[CircuitBreaker] ${msg}`);
      }
      this.emit('stateChange', newState, previousState);
    }
  }

  /**
   * Execute a function with a timeout.
   */
  private withTimeout<T>(fn: () => Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Request timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      new Promise<T>(res => res(fn()))
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