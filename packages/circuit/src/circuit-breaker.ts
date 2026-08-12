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
}

// ─── Circuit Breaker Error ─────────────────────────────────────────────────────

export class CircuitOpenError extends Error {
  constructor(name: string) {
    super(`Circuit '${name}' is OPEN - service unavailable`);
    this.name = 'CircuitOpenError';
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

  private options: Required<CircuitBreakerOptions>;

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
  async execute<T>(fn: () => Promise<T>): Promise<T> {
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

    // Execute the function with timeout
    try {
      const result = await this.withTimeout(fn, this.options.requestTimeoutMs);
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      throw error;
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
  } {
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
  reset(): void {
    this.failureCount = 0;
    this.successCount = 0;
    this.requestCount = 0;
    this.transitionTo('CLOSED');
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  private onSuccess(): void {
    this.successCount++;
    this.requestCount++;

    if (this.state === 'HALF_OPEN') {
      // Success in half-open state → close the circuit
      this.failureCount = 0;
      this.transitionTo('CLOSED');
    }
  }

  private onFailure(error: Error): void {
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

    if (newState === 'OPEN') {
      this.nextAttemptTime = Date.now() + this.options.resetTimeoutMs;
    }

    if (previousState !== newState) {
      console.log(
        `\x1b[33m[CircuitBreaker]\x1b[0m '${this.name}': ` +
          `${previousState} → ${newState}`
      );
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