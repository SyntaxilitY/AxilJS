/**
 * Core event system types.
 * Used across the entire REstJS event infrastructure.
 */

// ─── Base Event ───────────────────────────────────────────────────────────────

export interface REstEvent<T = unknown> {
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
  event: REstEvent<T>
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
  // Max number of listeners per event type (default: 100)
  maxListeners?: number;

  // Whether to process events asynchronously (default: true)
  async?: boolean;

  // Error handler for failed event handlers
  onError?: (error: Error, event: REstEvent) => void;

  // Middleware applied to all events before handlers
  middleware?: EventMiddleware[];
}

// ─── Event Middleware ─────────────────────────────────────────────────────────

export type EventMiddleware = (
  event: REstEvent,
  next: () => Promise<void>
) => Promise<void>;