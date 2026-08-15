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
 *   await bus.emit('user.created', { id: 1, email: 'tariq@@axiljs.dev' })
 *
 *   // Wildcard subscription
 *   bus.on('user.*', (event) => console.log('User event:', event.type))
 */

import { randomUUID } from 'crypto';
import {
  axilEvent,
  EventHandler,
  Subscription,
  EventBusOptions,
  EventMiddleware
} from './types';

export class EventBus {
  // Map of event type → array of handlers
  // Supports wildcard patterns like 'user.*'
  private handlers = new Map<string, Array<{ id: string; handler: EventHandler<any> }>>();

  // Global middleware applied to all events
  private middleware: EventMiddleware[];

  // Error handler
  private onError: (error: Error, event: axilEvent) => void;

  // Event history for replay/debugging (limited size)
  private history: axilEvent[] = [];
  private historyLimit: number = 1000;

  constructor(options: EventBusOptions = {}) {
    this.middleware = options.middleware || [];

    this.onError = options.onError || ((error, event) => {
      console.error(
        `\x1b[31m[@axiljsJS Events]\x1b[0m Handler error for '${event.type}':`,
        error.message
      );
    });
  }

  // ─── Subscribe ───────────────────────────────────────────────────────────────

  /**
   * Subscribe to an event type.
   * Supports wildcards: 'user.*' matches 'user.created', 'user.deleted', etc.
   *
   * @returns Subscription object with unsubscribe() method
   */
  on<T = unknown>(
    eventType: string,
    handler: EventHandler<T>
  ): Subscription {
    const id = randomUUID();

    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }

    this.handlers.get(eventType)!.push({ id, handler });

    return {
      id,
      eventType,
      unsubscribe: () => this.off(eventType, id)
    };
  }

  /**
   * Subscribe to an event type once.
   * Automatically unsubscribes after the first event.
   */
  once<T = unknown>(
    eventType: string,
    handler: EventHandler<T>
  ): Subscription {
    let subscription: Subscription;

    const wrappedHandler: EventHandler<T> = async (event) => {
      subscription.unsubscribe();
      await handler(event);
    };

    subscription = this.on(eventType, wrappedHandler);
    return subscription;
  }

  /**
   * Wait for the next occurrence of an event.
   * Returns a Promise that resolves with the event payload.
   *
   * Usage:
   *   const event = await bus.waitFor('payment.confirmed', 5000)
   */
  waitFor<T = unknown>(
    eventType: string,
    timeoutMs: number = 30000
  ): Promise<axilEvent<T>> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        sub.unsubscribe();
        reject(new Error(`Timeout waiting for event: '${eventType}'`));
      }, timeoutMs);

      const sub = this.once<T>(eventType, (event) => {
        clearTimeout(timer);
        resolve(event);
      });
    });
  }

  /**
   * Unsubscribe a specific handler by subscription ID.
   */
  off(eventType: string, subscriptionId: string): void {
    const handlers = this.handlers.get(eventType);
    if (!handlers) return;

    const index = handlers.findIndex(h => h.id === subscriptionId);
    if (index !== -1) {
      handlers.splice(index, 1);
    }
  }

  // ─── Publish ─────────────────────────────────────────────────────────────────

  /**
   * Emit an event to all matching subscribers.
   * Runs middleware then calls all matching handlers.
   *
   * @param type     Event type string
   * @param payload  Event data
   * @param meta     Optional event metadata
   */
  async emit<T = unknown>(
    type: string,
    payload: T,
    meta: Partial<Pick<axilEvent, 'source' | 'correlationId' | 'causationId' | 'version'>> = {}
  ): Promise<void> {
    // Build the event object
    const event: axilEvent<T> = {
      id: randomUUID(),
      type,
      payload,
      timestamp: new Date().toISOString(),
      version: 1,
      ...meta
    };

    // Store in history (with size limit)
    this.history.push(event);
    if (this.history.length > this.historyLimit) {
      this.history.shift(); // Remove oldest
    }

    // Find all matching handlers (exact match + wildcard)
    const matchingHandlers = this.findHandlers(type);

    if (matchingHandlers.length === 0) return;

    // Build middleware chain
    const runHandlers = async () => {
      // Run all handlers concurrently
      await Promise.all(
        matchingHandlers.map(async ({ handler }) => {
          try {
            await handler(event);
          } catch (error) {
            this.onError(
              error instanceof Error ? error : new Error(String(error)),
              event
            );
          }
        })
      );
    };

    // Apply middleware chain
    await this.runMiddleware(event, runHandlers);
  }

  /**
   * Emit multiple events atomically.
   * All events are emitted before any handlers run.
   */
  async emitMany<T = unknown>(
    events: Array<{ type: string; payload: T; meta?: any }>
  ): Promise<void> {
    await Promise.all(
      events.map(e => this.emit(e.type, e.payload, e.meta))
    );
  }

  // ─── Query ───────────────────────────────────────────────────────────────────

  /**
   * Get recent event history.
   */
  getHistory(type?: string): axilEvent[] {
    if (!type) return [...this.history];
    return this.history.filter(e => e.type === type);
  }

  /**
   * Get all registered event types.
   */
  getEventTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Get handler count for an event type.
   */
  getHandlerCount(type: string): number {
    return this.handlers.get(type)?.length || 0;
  }

  /**
   * Remove all handlers. Useful in tests.
   */
  clear(): void {
    this.handlers.clear();
    this.history = [];
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  /**
   * Find all handlers matching an event type.
   * Supports wildcard patterns: 'user.*', '*.created', '*'
   */
  private findHandlers(type: string): Array<{ id: string; handler: EventHandler }> {
    const result: Array<{ id: string; handler: EventHandler }> = [];

    for (const [pattern, handlers] of this.handlers.entries()) {
      if (this.matchPattern(pattern, type)) {
        result.push(...handlers);
      }
    }

    return result;
  }

  /**
   * Match an event type against a pattern.
   * Patterns support * as wildcard.
   * 'user.*' matches 'user.created', 'user.deleted'
   * '*.created' matches 'user.created', 'post.created'
   * '*' matches everything
   */
  private matchPattern(pattern: string, type: string): boolean {
    if (pattern === type) return true;
    if (pattern === '*') return true;

    // Convert pattern to regex
    // Replace * with regex wildcard (match anything except dots? No - match anything)
    const regexStr = pattern
      .replace(/\./g, '\\.')   // Escape dots
      .replace(/\*/g, '.*');    // * → .*

    const regex = new RegExp(`^${regexStr}$`);
    return regex.test(type);
  }

  /**
   * Run event through middleware chain then execute the action.
   */
  private async runMiddleware(
    event: axilEvent,
    action: () => Promise<void>
  ): Promise<void> {
    if (this.middleware.length === 0) {
      return action();
    }

    let index = 0;

    const next = async (): Promise<void> => {
      if (index >= this.middleware.length) {
        return action();
      }
      const mw = this.middleware[index++];
      await mw(event, next);
    };

    await next();
  }
}

// ─── Global Event Bus ─────────────────────────────────────────────────────────

// Singleton global event bus
// Import this in any module to participate in the event system
let globalBus: EventBus | null = null;

export function getGlobalEventBus(): EventBus {
  if (!globalBus) {
    globalBus = new EventBus();
  }
  return globalBus;
}

export function setGlobalEventBus(bus: EventBus): void {
  globalBus = bus;
}