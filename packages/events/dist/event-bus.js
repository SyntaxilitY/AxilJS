"use strict";
/**
 * In-process Event Bus.
 * Typed publish/subscribe system for decoupled communication.
 * Works within a single process by default. Attach an EventTransport
 * (e.g. ClusterTransport) to deliver `{ broadcast: true }` emits to buses in
 * other processes; see "Cross-process events" below.
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
 *
 * Cross-process events (only when a transport is attached):
 *   - emit(type, payload, { broadcast: true }) runs local handlers exactly once
 *     AND publishes a JSON copy through the transport. `new EventBus({
 *     broadcast: true })` makes that the default; an emit can then opt out
 *     with { broadcast: false }.
 *   - Events received from the transport run local handlers (and middleware,
 *     history, once/waitFor) but are never re-published, so relays cannot loop.
 *   - Every bus has a random originId; messages carrying it are dropped, so a
 *     transport that echoes publishes back does not cause double delivery.
 *   - A broadcast payload must be plain JSON data (see assertJsonSafe); a
 *     non-serializable payload makes emit() throw before any handler runs.
 *   - Without a transport, broadcast is a no-op (local delivery only), but the
 *     JSON check still runs so mistakes surface in single-process dev too.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventBus = void 0;
exports.assertJsonSafe = assertJsonSafe;
exports.getGlobalEventBus = getGlobalEventBus;
exports.setGlobalEventBus = setGlobalEventBus;
const crypto_1 = require("crypto");
/**
 * Report a payload to @axiljs/runtime's sensitive data lineage ('event'
 * sink) without depending on it. In enforce mode the hook throws and emit()
 * rejects before any handler runs.
 */
function checkSensitiveSink(payload) {
    const sink = globalThis[Symbol.for('axiljs.sensitive.sink')];
    if (typeof sink === 'function')
        sink('event', payload);
}
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
    // Listener-count warning threshold per event type (0/undefined = unlimited)
    maxListeners;
    // Event types already warned about (warn once per type, like Node's EventEmitter)
    warnedTypes = new Set();
    // Random per-instance id stamped on published messages (own echoes are dropped)
    originId = (0, crypto_1.randomUUID)();
    // Cross-process transport (null = in-process only)
    transport = null;
    transportUnsubscribe = null;
    // Whether emits broadcast by default
    broadcastByDefault;
    constructor(options = {}) {
        this.middleware = options.middleware || [];
        this.maxListeners = options.maxListeners ?? 0;
        this.broadcastByDefault = options.broadcast ?? false;
        this.onError = options.onError || ((error, event) => {
            console.error(`\x1b[31m[AxilJS Events]\x1b[0m Handler error for '${event.type}':`, error.message);
        });
        if (options.transport)
            this.useTransport(options.transport);
    }
    // ─── Transport ───────────────────────────────────────────────────────────────
    /**
     * Attach a cross-process transport (replacing any previous one), or detach
     * with `null`. The bus subscribes to it immediately. Detaching does not call
     * the transport's close(); the caller owns its lifecycle.
     */
    useTransport(transport) {
        if (this.transportUnsubscribe) {
            this.transportUnsubscribe();
            this.transportUnsubscribe = null;
        }
        this.transport = transport;
        if (transport) {
            this.transportUnsubscribe = transport.subscribe((message) => this.receive(message));
        }
        return this;
    }
    /**
     * The currently attached transport, or null.
     */
    getTransport() {
        return this.transport;
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
        const list = this.handlers.get(eventType);
        list.push({ id, handler });
        this.checkMaxListeners(eventType, list.length);
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
        let fired = false;
        const wrappedHandler = async (event) => {
            // Guard against concurrent emits that matched before unsubscribe ran
            if (fired)
                return;
            fired = true;
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
     * Local handlers always run exactly once. With `broadcast` (per emit, or
     * the bus default) and an attached transport, a JSON copy of the event is
     * also published to other processes.
     *
     * @param type     Event type string
     * @param payload  Event data
     * @param meta     Optional event metadata, plus `broadcast`
     * @throws TypeError when broadcasting a payload that is not plain JSON data
     */
    async emit(type, payload, meta = {}) {
        checkSensitiveSink(payload);
        const { broadcast, ...eventMeta } = meta;
        const shouldBroadcast = broadcast ?? this.broadcastByDefault;
        // Build the event object
        const event = {
            id: (0, crypto_1.randomUUID)(),
            type,
            payload,
            timestamp: new Date().toISOString(),
            version: 1,
            ...eventMeta
        };
        // Validate before anything runs, so a bad payload fails loudly and
        // consistently (with or without a transport)
        let wire = null;
        if (shouldBroadcast) {
            assertJsonSafe(event.payload, `Event '${type}' payload`);
            wire = JSON.parse(JSON.stringify(event));
        }
        // Publish first so remote delivery is not delayed by slow local handlers
        const published = wire && this.transport
            ? this.publish(this.transport, wire)
            : null;
        await this.dispatch(event);
        if (published)
            await published;
    }
    // ─── Remote delivery ─────────────────────────────────────────────────────────
    /**
     * Handle a message from the transport: drop own echoes and malformed
     * messages, deliver the rest locally. Never re-published.
     */
    receive(message) {
        if (!message || typeof message !== 'object')
            return;
        if (message.origin === this.originId)
            return;
        const event = message.event;
        if (!event || typeof event !== 'object' || typeof event.type !== 'string')
            return;
        this.dispatch(event).catch((error) => {
            this.onError(error instanceof Error ? error : new Error(String(error)), event);
        });
    }
    /**
     * Publish through the transport. Failures go to onError instead of
     * rejecting emit(), because local delivery has already happened.
     */
    async publish(transport, event) {
        try {
            await transport.publish({ origin: this.originId, event });
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.onError(new Error(`Transport publish failed: ${err.message}`), event);
        }
    }
    // ─── Local delivery ──────────────────────────────────────────────────────────
    /**
     * Record the event and run middleware + matching local handlers.
     */
    async dispatch(event) {
        const type = event.type;
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
     * Set the listener-count warning threshold (0 = unlimited).
     */
    setMaxListeners(n) {
        this.maxListeners = n;
        return this;
    }
    /**
     * Get the listener-count warning threshold (0 = unlimited).
     */
    getMaxListeners() {
        return this.maxListeners;
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
        this.warnedTypes.clear();
    }
    // ─── Internal ────────────────────────────────────────────────────────────────
    /**
     * Warn (once per event type) when listener count exceeds maxListeners.
     * Mirrors Node's EventEmitter: it is a leak hint, the listener is still added.
     */
    checkMaxListeners(eventType, count) {
        if (!this.maxListeners || this.maxListeners <= 0)
            return;
        if (count <= this.maxListeners)
            return;
        if (this.warnedTypes.has(eventType))
            return;
        this.warnedTypes.add(eventType);
        console.warn(`[AxilJS Events] Possible listener leak detected: ${count} listeners ` +
            `added for '${eventType}' (maxListeners = ${this.maxListeners}). ` +
            `Use bus.setMaxListeners() to increase the limit.`);
    }
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
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape regex specials (incl. dots)
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
// ─── JSON safety ──────────────────────────────────────────────────────────────
/**
 * Throw a TypeError unless `value` is plain JSON data that survives a
 * JSON round-trip with its meaning intact.
 *
 * Allowed: null, booleans, finite numbers, strings, arrays, plain objects
 * (prototype Object or null) and Date (arrives on the other side as an ISO
 * string). Object properties whose value is undefined are dropped, as JSON does.
 *
 * A top-level `undefined` (an event without payload) is allowed.
 *
 * Rejected: nested undefined (e.g. array items) / function / symbol / bigint
 * values, NaN and Infinity,
 * class instances (Map, Set, Buffer, Error, ...) and circular references.
 */
function assertJsonSafe(value, label = 'Value') {
    const seen = new Set();
    const fail = (path, what) => {
        throw new TypeError(`${label} is not JSON-serializable: ${path} is ${what}`);
    };
    const visit = (v, path) => {
        if (v === null)
            return;
        switch (typeof v) {
            case 'string':
            case 'boolean':
                return;
            case 'number':
                if (!Number.isFinite(v))
                    fail(path, String(v));
                return;
            case 'object':
                break;
            case 'undefined':
                fail(path, 'undefined');
                return;
            default:
                fail(path, `a ${typeof v}`);
        }
        const obj = v;
        if (obj instanceof Date)
            return;
        if (seen.has(obj))
            fail(path, 'a circular reference');
        seen.add(obj);
        if (Array.isArray(obj)) {
            obj.forEach((item, i) => visit(item, `${path}[${i}]`));
        }
        else {
            const proto = Object.getPrototypeOf(obj);
            if (proto !== Object.prototype && proto !== null) {
                const name = (proto && proto.constructor && proto.constructor.name) || 'non-plain object';
                fail(path, `a ${name} instance (use plain objects and arrays)`);
            }
            for (const key of Object.keys(obj)) {
                const child = obj[key];
                if (child === undefined)
                    continue;
                visit(child, `${path}.${key}`);
            }
        }
        seen.delete(obj);
    };
    // A missing top-level value (e.g. an event with no payload) is fine
    if (value === undefined)
        return;
    visit(value, 'payload');
}
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