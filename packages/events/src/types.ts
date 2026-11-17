/**
 * Core event system types.
 * Used across the entire AxilJS event infrastructure.
 */

// ─── Base Event ───────────────────────────────────────────────────────────────

export interface axilEvent<T = unknown> {
  // Unique event identifier (e.g. 'user.created', 'order.shipped')
  type: string;

  // Event payload - the actual data
  payload: T;

  // Unique ID for this specific event instance
  id: string;

  // When the event was created (ISO string)
  timestamp: string;

  // Source service/module that emitted this event
  source?: string;

  // Correlation ID for tracing events across services
  correlationId?: string;

  // Causation ID - which event caused this one
  causationId?: string;

  // Event schema version for backward compatibility
  version?: number;
}

// ─── Event Handler ────────────────────────────────────────────────────────────

// Function that handles an event
export type EventHandler<T = unknown> = (
  event: axilEvent<T>
) => void | Promise<void>;

// ─── Subscription ─────────────────────────────────────────────────────────────

export interface Subscription {
  // Unsubscribe this handler
  unsubscribe(): void;

  // Event type this subscription listens to
  eventType: string;

  // Unique subscription ID
  id: string;
}

// ─── Event Bus Options ────────────────────────────────────────────────────────

export interface EventBusOptions {
  // Warn (once per event type) when more listeners than this are added.
  // The listener is still registered. 0 / undefined = unlimited (default).
  maxListeners?: number;

  // Whether to process events asynchronously (default: true)
  async?: boolean;

  // Error handler for failed event handlers
  onError?: (error: Error, event: axilEvent) => void;

  // Middleware applied to all events before handlers
  middleware?: EventMiddleware[];

  // Cross-process transport. When unset the bus is purely in-process.
  transport?: EventTransport;

  // Broadcast every emit through the transport unless the emit passes
  // { broadcast: false }. Default false: only { broadcast: true } emits leave
  // the process.
  broadcast?: boolean;
}

// ─── Event Middleware ─────────────────────────────────────────────────────────

export type EventMiddleware = (
  event: axilEvent,
  next: () => Promise<void>
) => Promise<void>;

// ─── Cross-process Transport ──────────────────────────────────────────────────

/**
 * What a bus hands to (and receives from) a transport.
 * `origin` is the sending bus's random per-instance id; a bus drops messages
 * carrying its own origin, so a transport may echo publishes back safely.
 * `event` is a JSON-safe copy of the emitted event.
 */
export interface EventTransportMessage {
  origin: string;
  event: axilEvent;
}

/**
 * Pluggable carrier that moves events between buses in other processes
 * (or other bus instances). Implementations must deliver a message to the
 * subscribers of every *other* participant; delivering it back to the sender
 * is allowed (the bus ignores its own origin) but not required.
 */
export interface EventTransport {
  // Send a message to the other participants
  publish(message: EventTransportMessage): void | Promise<void>;

  // Receive messages from the other participants; returns an unsubscribe fn
  subscribe(handler: (message: EventTransportMessage) => void): () => void;

  // Release resources (listeners, sockets). Optional.
  close?(): void | Promise<void>;
}

/**
 * Per-emit options: the event metadata plus `broadcast`.
 * `broadcast: true` also publishes the event through the bus's transport;
 * `broadcast: false` keeps it local even when the bus broadcasts by default.
 */
export type EmitOptions = Partial<Pick<axilEvent, 'source' | 'correlationId' | 'causationId' | 'version'>> & {
  broadcast?: boolean;
};
