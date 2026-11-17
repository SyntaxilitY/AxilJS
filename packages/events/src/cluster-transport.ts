/**
 * node:cluster EventTransport.
 *
 * Workers send broadcast events to the primary over the built-in IPC channel
 * (`process.send`); the primary relays each one to every other worker.
 *
 *   // In every process (top level of your entry file):
 *   import { EventBus, ClusterTransport, installClusterEventRelay } from '@axiljs/events'
 *
 *   installClusterEventRelay()               // no-op outside the primary
 *   const bus = new EventBus({ transport: new ClusterTransport() })
 *
 *   await bus.emit('cache.invalidate', { key: 'users' }, { broadcast: true })
 *
 * Messages use the envelope `{ __axil: 'events', v: 1, origin, event }`; any
 * other IPC message is ignored, so this coexists with your own messages and
 * with @axiljs/scale's control messages.
 *
 * Both ends take an injectable channel/host so the protocol can be tested
 * without forking processes.
 */

import cluster from 'node:cluster';
import { axilEvent, EventTransport, EventTransportMessage } from './types';

// ─── Envelope ─────────────────────────────────────────────────────────────────

export const CLUSTER_EVENTS_TAG = 'events';
export const CLUSTER_EVENTS_VERSION = 1;

export interface ClusterEventEnvelope {
  __axil: typeof CLUSTER_EVENTS_TAG;
  v: typeof CLUSTER_EVENTS_VERSION;
  origin: string;
  event: axilEvent;
}

/**
 * True when `message` is an AxilJS events envelope (any other IPC message is
 * ignored by both the transport and the relay).
 */
export function isClusterEventEnvelope(message: unknown): message is ClusterEventEnvelope {
  if (!message || typeof message !== 'object') return false;
  const m = message as Record<string, unknown>;
  if (m.__axil !== CLUSTER_EVENTS_TAG || m.v !== CLUSTER_EVENTS_VERSION) return false;
  if (typeof m.origin !== 'string') return false;
  const event = m.event as Record<string, unknown> | null;
  return !!event && typeof event === 'object' && typeof event.type === 'string';
}

// ─── Worker side ──────────────────────────────────────────────────────────────

/**
 * The worker's IPC channel. `process` in a cluster worker; inject a fake in tests.
 */
export interface ClusterChannel {
  // Absent when the process has no IPC channel (not forked)
  send?(message: unknown, callback?: (error: Error | null) => void): boolean;

  // Subscribe to incoming IPC messages; returns an unsubscribe fn
  onMessage(listener: (message: unknown) => void): () => void;

  // false once the channel has been closed
  connected?: boolean;
}

/**
 * Adapter over the current process's IPC channel.
 */
export function processChannel(proc: NodeJS.Process = process): ClusterChannel {
  return {
    get send() {
      if (typeof proc.send !== 'function') return undefined;
      return (message: unknown, callback?: (error: Error | null) => void) =>
        proc.send!(message as any, callback as any);
    },
    get connected() {
      return proc.connected;
    },
    onMessage(listener) {
      const fn = (message: unknown) => listener(message);
      proc.on('message', fn);
      return () => { proc.off('message', fn); };
    }
  };
}

export interface ClusterTransportOptions {
  // IPC channel (default: processChannel())
  channel?: ClusterChannel;
}

/**
 * EventTransport for a cluster worker.
 *
 * When the process has no IPC channel (single-process mode, e.g. @axiljs/scale
 * with one worker), the transport is inert: publish() is a no-op and nothing
 * is received. The same code therefore runs unchanged with 1 or N workers.
 */
export class ClusterTransport implements EventTransport {
  private readonly channel: ClusterChannel;
  private readonly unsubscribers = new Set<() => void>();
  private closed = false;

  constructor(options: ClusterTransportOptions = {}) {
    this.channel = options.channel ?? processChannel();
  }

  /**
   * True when there is an IPC channel to publish to.
   */
  get active(): boolean {
    return !this.closed && typeof this.channel.send === 'function';
  }

  publish(message: EventTransportMessage): Promise<void> {
    if (this.closed) return Promise.reject(new Error('ClusterTransport is closed'));
    const send = this.channel.send;
    if (typeof send !== 'function') return Promise.resolve();
    if (this.channel.connected === false) {
      return Promise.reject(new Error('ClusterTransport: IPC channel is closed'));
    }

    const envelope: ClusterEventEnvelope = {
      __axil: CLUSTER_EVENTS_TAG,
      v: CLUSTER_EVENTS_VERSION,
      origin: message.origin,
      event: message.event
    };

    return new Promise<void>((resolve, reject) => {
      try {
        send.call(this.channel, envelope, (error) => (error ? reject(error) : resolve()));
      } catch (error) {
        reject(error);
      }
    });
  }

  subscribe(handler: (message: EventTransportMessage) => void): () => void {
    if (this.closed || typeof this.channel.send !== 'function') return () => {};

    const off = this.channel.onMessage((message) => {
      if (!isClusterEventEnvelope(message)) return;
      handler({ origin: message.origin, event: message.event });
    });

    let done = false;
    const unsubscribe = () => {
      if (done) return;
      done = true;
      this.unsubscribers.delete(unsubscribe);
      off();
    };
    this.unsubscribers.add(unsubscribe);
    return unsubscribe;
  }

  /**
   * Remove all IPC listeners added by this transport (lets an otherwise idle
   * worker exit). Later publishes reject.
   */
  close(): void {
    this.closed = true;
    for (const unsubscribe of Array.from(this.unsubscribers)) unsubscribe();
  }
}

// ─── Primary side ─────────────────────────────────────────────────────────────

export interface ClusterWorkerLike {
  id: number | string;
  send(message: unknown, callback?: (error: Error | null) => void): boolean;
  isConnected?(): boolean;
}

/**
 * What the relay needs from node:cluster in the primary. Inject a fake in tests.
 */
export interface ClusterRelayHost {
  // Workers alive right now (evaluated on every relay, so later forks are included)
  workers(): Iterable<ClusterWorkerLike>;

  // Subscribe to messages from any worker; returns an unsubscribe fn
  onMessage(listener: (worker: ClusterWorkerLike, message: unknown) => void): () => void;
}

let defaultHost: ClusterRelayHost | null = null;

/**
 * Adapter over node:cluster in the primary (memoized, so repeated
 * installClusterEventRelay() calls share one relay).
 */
export function nodeClusterHost(): ClusterRelayHost {
  if (defaultHost) return defaultHost;
  defaultHost = {
    workers() {
      return Object.values(cluster.workers ?? {}).filter(Boolean) as unknown as ClusterWorkerLike[];
    },
    onMessage(listener) {
      const fn = (worker: unknown, message: unknown) => listener(worker as ClusterWorkerLike, message);
      cluster.on('message', fn as any);
      return () => { cluster.off('message', fn as any); };
    }
  };
  return defaultHost;
}

export interface ClusterEventRelayOptions {
  // Cluster to relay on (default: node:cluster; must then run in the primary)
  host?: ClusterRelayHost;

  // Called when relaying to a worker fails (e.g. it just exited). Default: ignore.
  onError?: (error: Error, worker: ClusterWorkerLike) => void;
}

interface RelayState {
  refs: number;
  stop: () => void;
}

const relays = new WeakMap<ClusterRelayHost, RelayState>();

/**
 * Relay AxilJS event envelopes between cluster workers. Call it in the
 * primary; with the default host it is a no-op in any other process, so it
 * can sit unconditionally at the top of an entry file.
 *
 * Idempotent per host: extra calls share the one relay (the first call's
 * onError is kept). Each call returns a disposer; the relay is removed when
 * every disposer has been called.
 * Workers forked after installation are included automatically.
 */
export function installClusterEventRelay(options: ClusterEventRelayOptions = {}): () => void {
  if (!options.host && !cluster.isPrimary) return () => {};
  const host = options.host ?? nodeClusterHost();
  const onError = options.onError ?? (() => {});

  let state = relays.get(host);
  if (!state) {
    const stop = host.onMessage((from, message) => {
      if (!isClusterEventEnvelope(message)) return;
      for (const worker of host.workers()) {
        if (!worker || worker.id === from.id) continue;
        if (worker.isConnected && !worker.isConnected()) continue;
        try {
          worker.send(message, (error) => { if (error) onError(error, worker); });
        } catch (error) {
          onError(error instanceof Error ? error : new Error(String(error)), worker);
        }
      }
    });
    state = { refs: 0, stop };
    relays.set(host, state);
  }
  state.refs++;

  const current = state;
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    current.refs--;
    if (current.refs <= 0) {
      current.stop();
      if (relays.get(host) === current) relays.delete(host);
    }
  };
}
