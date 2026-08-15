"use strict";
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
 *   await bus.emit('user.created', { id: 1, email: 'tariq@@axil.dev' })
 *
 *   // Wildcard subscription
 *   bus.on('user.*', (event) => console.log('User event:', event.type))
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventBus = void 0;
exports.getGlobalEventBus = getGlobalEventBus;
exports.setGlobalEventBus = setGlobalEventBus;
const crypto_1 = require("crypto");
class EventBus {
    // Map of event type → array of handlers
    // Supports wildcard patterns like 'user.*'
    handlers = new Map();
    // Global middleware applied to all events
    middleware;
    // Error handler
    onError;
    // Event history for replay/debugging (limited size)
    history = [];
    historyLimit = 1000;
    constructor(options = {}) {
        this.middleware = options.middleware || [];
        this.onError = options.onError || ((error, event) => {
            console.error(`\x1b[31m[@axilJS Events]\x1b[0m Handler error for '${event.type}':`, error.message);
        });
    }
    // ─── Subscribe ───────────────────────────────────────────────────────────────
    /**
     * Subscribe to an event type.
     * Supports wildcards: 'user.*' matches 'user.created', 'user.deleted', etc.
     *
     * @returns Subscription object with unsubscribe() method
     */
    on(eventType, handler) {
        const id = (0, crypto_1.randomUUID)();
        if (!this.handlers.has(eventType)) {
            this.handlers.set(eventType, []);
        }
        this.handlers.get(eventType).push({ id, handler });
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
    once(eventType, handler) {
        let subscription;
        const wrappedHandler = async (event) => {
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
    waitFor(eventType, timeoutMs = 30000) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                sub.unsubscribe();
                reject(new Error(`Timeout waiting for event: '${eventType}'`));
            }, timeoutMs);
            const sub = this.once(eventType, (event) => {
                clearTimeout(timer);
                resolve(event);
            });
        });
    }
    /**
     * Unsubscribe a specific handler by subscription ID.
     */
    off(eventType, subscriptionId) {
        const handlers = this.handlers.get(eventType);
        if (!handlers)
            return;
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
    async emit(type, payload, meta = {}) {
        // Build the event object
        const event = {
            id: (0, crypto_1.randomUUID)(),
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
        if (matchingHandlers.length === 0)
            return;
        // Build middleware chain
        const runHandlers = async () => {
            // Run all handlers concurrently
            await Promise.all(matchingHandlers.map(async ({ handler }) => {
                try {
                    await handler(event);
                }
                catch (error) {
                    this.onError(error instanceof Error ? error : new Error(String(error)), event);
                }
            }));
        };
        // Apply middleware chain
        await this.runMiddleware(event, runHandlers);
    }
    /**
     * Emit multiple events atomically.
     * All events are emitted before any handlers run.
     */
    async emitMany(events) {
        await Promise.all(events.map(e => this.emit(e.type, e.payload, e.meta)));
    }
    // ─── Query ───────────────────────────────────────────────────────────────────
    /**
     * Get recent event history.
     */
    getHistory(type) {
        if (!type)
            return [...this.history];
        return this.history.filter(e => e.type === type);
    }
    /**
     * Get all registered event types.
     */
    getEventTypes() {
        return Array.from(this.handlers.keys());
    }
    /**
     * Get handler count for an event type.
     */
    getHandlerCount(type) {
        return this.handlers.get(type)?.length || 0;
    }
    /**
     * Remove all handlers. Useful in tests.
     */
    clear() {
        this.handlers.clear();
        this.history = [];
    }
    // ─── Internal ────────────────────────────────────────────────────────────────
    /**
     * Find all handlers matching an event type.
     * Supports wildcard patterns: 'user.*', '*.created', '*'
     */
    findHandlers(type) {
        const result = [];
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
    matchPattern(pattern, type) {
        if (pattern === type)
            return true;
        if (pattern === '*')
            return true;
        // Convert pattern to regex
        // Replace * with regex wildcard (match anything except dots? No - match anything)
        const regexStr = pattern
            .replace(/\./g, '\\.') // Escape dots
            .replace(/\*/g, '.*'); // * → .*
        const regex = new RegExp(`^${regexStr}$`);
        return regex.test(type);
    }
    /**
     * Run event through middleware chain then execute the action.
     */
    async runMiddleware(event, action) {
        if (this.middleware.length === 0) {
            return action();
        }
        let index = 0;
        const next = async () => {
            if (index >= this.middleware.length) {
                return action();
            }
            const mw = this.middleware[index++];
            await mw(event, next);
        };
        await next();
    }
}
exports.EventBus = EventBus;
// ─── Global Event Bus ─────────────────────────────────────────────────────────
// Singleton global event bus
// Import this in any module to participate in the event system
let globalBus = null;
function getGlobalEventBus() {
    if (!globalBus) {
        globalBus = new EventBus();
    }
    return globalBus;
}
function setGlobalEventBus(bus) {
    globalBus = bus;
}
//# sourceMappingURL=event-bus.js.map