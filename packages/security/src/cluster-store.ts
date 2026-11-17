/**
 * Rate limiting across node:cluster workers.
 *
 * With cluster mode every worker is a separate process, so a per-process
 * MemoryStore lets each worker accept the full limit (N workers => N x max).
 * ClusterStore forwards increment/reset to the primary over the IPC channel,
 * where installClusterRateLimitPrimary() keeps a single set of counters.
 *
 * Fail-open: if the primary does not answer within timeoutMs (not installed,
 * busy, or gone) the request is counted in a worker-local MemoryStore instead,
 * so a broken primary can never block traffic. While degraded, limits are
 * enforced per worker only.
 */

import cluster from 'node:cluster';
import { MemoryStore, RateLimitRecord, RateLimitStore } from './rate-limit';

// ─── Wire Protocol ────────────────────────────────────────────────────────────

/** Type tag carried by every rate-limit IPC message. */
export const CLUSTER_RATE_LIMIT_TAG = 'ratelimit';

export interface ClusterRateLimitRequest {
  __axil: typeof CLUSTER_RATE_LIMIT_TAG;
  kind: 'increment' | 'reset';
  id: string;
  ns: string;
  key: string;
  windowMs?: number;
}

export interface ClusterRateLimitReply {
  __axil: typeof CLUSTER_RATE_LIMIT_TAG;
  kind: 'reply';
  id: string;
  ns: string;
  record?: RateLimitRecord;
  error?: string;
}

export type ClusterRateLimitMessage = ClusterRateLimitRequest | ClusterRateLimitReply;

function isRateLimitMessage(message: unknown): message is ClusterRateLimitMessage {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { __axil?: unknown }).__axil === CLUSTER_RATE_LIMIT_TAG &&
    typeof (message as { id?: unknown }).id === 'string'
  );
}

// ─── Transports (injectable for tests) ────────────────────────────────────────

/** Worker side of the IPC channel. */
export interface ClusterWorkerChannel {
  // Send a request to the primary. May throw, or report a failure through
  // callback; either makes the pending request fall back immediately.
  send(message: ClusterRateLimitRequest, callback?: (error: Error | null) => void): void;

  // Subscribe to messages from the primary; returns an unsubscribe function.
  onMessage(listener: (message: unknown) => void): () => void;
}

/** A worker as seen from the primary. */
export interface ClusterWorkerHandle {
  send(message: ClusterRateLimitReply): unknown;
}

/** Primary side of the IPC channel. */
export interface ClusterPrimaryTransport {
  // Subscribe to messages from every current and future worker.
  onMessage(listener: (worker: ClusterWorkerHandle, message: unknown) => void): () => void;
}

/** IPC channel of the current process, or null when it is not a cluster worker. */
function processWorkerChannel(): ClusterWorkerChannel | null {
  if (!cluster.isWorker || typeof process.send !== 'function') {
    return null;
  }
  return {
    send(message, callback) {
      if (!process.connected || typeof process.send !== 'function') {
        throw new Error('IPC channel to the cluster primary is closed');
      }
      // Passing a callback keeps send errors off process 'error'
      process.send(message, undefined, {}, error => callback?.(error ?? null));
    },
    onMessage(listener) {
      process.on('message', listener);
      return () => {
        process.off('message', listener);
      };
    }
  };
}

const clusterPrimaryTransport: ClusterPrimaryTransport = {
  onMessage(listener) {
    const handler = (worker: ClusterWorkerHandle, message: unknown): void => listener(worker, message);
    cluster.on('message', handler);
    return () => {
      cluster.off('message', handler);
    };
  }
};

// ─── Worker Store ─────────────────────────────────────────────────────────────

export interface ClusterStoreOptions {
  // Separates counters of different limiters on the primary (default: 'default').
  // Give each rateLimit() that uses its own ClusterStore a distinct namespace.
  namespace?: string;

  // How long to wait for the primary before counting locally (default: 1000)
  timeoutMs?: number;

  // After a timeout or send failure, skip IPC and count locally for this long
  // so a missing primary does not add timeoutMs to every request (default: 5000)
  fallbackCooldownMs?: number;

  // Transport override. Defaults to process IPC in a cluster worker; null (or
  // running outside a cluster worker) makes the store purely local.
  channel?: ClusterWorkerChannel | null;
}

interface PendingRequest {
  resolve: (record: RateLimitRecord | undefined) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

// Ids only need to be unique within one worker: replies are routed back to
// the worker that sent the request.
let nextRequestId = 0;

/**
 * RateLimitStore that shares counters across node:cluster workers via the
 * primary process (see installClusterRateLimitPrimary). Outside a cluster
 * worker it behaves exactly like MemoryStore (synchronous).
 */
export class ClusterStore implements RateLimitStore {
  readonly namespace: string;
  private readonly timeoutMs: number;
  private readonly fallbackCooldownMs: number;
  private readonly channel: ClusterWorkerChannel | null;
  private readonly local = new MemoryStore();
  private readonly pending = new Map<string, PendingRequest>();
  private unsubscribe: (() => void) | null = null;
  private degradedUntil = 0;

  constructor(options: ClusterStoreOptions = {}) {
    this.namespace = options.namespace ?? 'default';
    this.timeoutMs = options.timeoutMs ?? 1000;
    this.fallbackCooldownMs = options.fallbackCooldownMs ?? 5000;
    this.channel = options.channel === undefined ? processWorkerChannel() : options.channel;
  }

  /** True when counts are shared through the primary (a channel is available). */
  get isClustered(): boolean {
    return this.channel !== null;
  }

  increment(key: string, windowMs: number): Promise<RateLimitRecord> | RateLimitRecord {
    if (!this.useRemote()) {
      return this.local.increment(key, windowMs);
    }
    return this.request({ kind: 'increment', key, windowMs }).then(
      record => record ?? this.local.increment(key, windowMs)
    );
  }

  reset(key: string): Promise<void> | void {
    this.local.reset(key);
    if (!this.useRemote()) {
      return;
    }
    return this.request({ kind: 'reset', key }).then(() => undefined);
  }

  /** Stop listening for replies, settle pending requests locally and free memory. */
  close(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.resolve(undefined);
    }
    this.pending.clear();
    this.local.shutdown();
  }

  private useRemote(): boolean {
    return this.channel !== null && Date.now() >= this.degradedUntil;
  }

  private degrade(): void {
    this.degradedUntil = Date.now() + this.fallbackCooldownMs;
  }

  // Resolves with the primary's record, or undefined when the caller must
  // fall back to the local store. Rejects only if the primary reports an error.
  private request(
    body: Pick<ClusterRateLimitRequest, 'kind' | 'key' | 'windowMs'>
  ): Promise<RateLimitRecord | undefined> {
    const channel = this.channel as ClusterWorkerChannel;
    if (!this.unsubscribe) {
      this.unsubscribe = channel.onMessage(message => this.handleReply(message));
    }

    const id = `${process.pid}:${++nextRequestId}`;
    const message: ClusterRateLimitRequest = {
      __axil: CLUSTER_RATE_LIMIT_TAG,
      id,
      ns: this.namespace,
      ...body
    };

    return new Promise<RateLimitRecord | undefined>((resolve, reject) => {
      const fallBack = (): void => {
        const entry = this.pending.get(id);
        if (!entry) return;
        clearTimeout(entry.timer);
        this.pending.delete(id);
        this.degrade();
        resolve(undefined);
      };

      const timer = setTimeout(fallBack, this.timeoutMs);
      timer.unref();
      this.pending.set(id, { resolve, reject, timer });

      try {
        channel.send(message, error => {
          if (error) fallBack();
        });
      } catch {
        fallBack();
      }
    });
  }

  private handleReply(message: unknown): void {
    if (!isRateLimitMessage(message) || message.kind !== 'reply') return;
    const entry = this.pending.get(message.id);
    if (!entry) return; // another store's request, or a late reply after timeout
    clearTimeout(entry.timer);
    this.pending.delete(message.id);
    if (message.error) {
      entry.reject(new Error(message.error));
    } else {
      entry.resolve(message.record);
    }
  }
}

// ─── Primary ──────────────────────────────────────────────────────────────────

export interface ClusterRateLimitPrimaryOptions {
  // Transport override (default: cluster.on('message') for all workers)
  transport?: ClusterPrimaryTransport;
}

interface PrimaryInstallation {
  dispose: () => void;
}

const installations = new Map<ClusterPrimaryTransport, PrimaryInstallation>();

/**
 * Serve rate-limit counters to cluster workers. Call once in the primary
 * process, before or after forking; workers forked later are covered too.
 * Idempotent: repeated calls return the same disposer. The disposer stops
 * listening and drops every counter.
 */
export function installClusterRateLimitPrimary(
  options: ClusterRateLimitPrimaryOptions = {}
): () => void {
  const transport = options.transport ?? clusterPrimaryTransport;
  const existing = installations.get(transport);
  if (existing) {
    return existing.dispose;
  }

  const stores = new Map<string, MemoryStore>();
  const storeFor = (ns: string): MemoryStore => {
    let store = stores.get(ns);
    if (!store) {
      store = new MemoryStore();
      stores.set(ns, store);
    }
    return store;
  };

  const unsubscribe = transport.onMessage((worker, message) => {
    if (!isRateLimitMessage(message) || message.kind === 'reply') return;

    const reply: ClusterRateLimitReply = {
      __axil: CLUSTER_RATE_LIMIT_TAG,
      kind: 'reply',
      id: message.id,
      ns: typeof message.ns === 'string' ? message.ns : ''
    };

    if (typeof message.ns !== 'string' || typeof message.key !== 'string') {
      reply.error = 'Invalid rate-limit request';
    } else if (message.kind === 'increment') {
      const windowMs = message.windowMs;
      if (typeof windowMs !== 'number' || !Number.isFinite(windowMs) || windowMs <= 0) {
        reply.error = 'Invalid rate-limit windowMs';
      } else {
        reply.record = storeFor(message.ns).increment(message.key, windowMs);
      }
    } else if (message.kind === 'reset') {
      stores.get(message.ns)?.reset(message.key);
    } else {
      reply.error = 'Unknown rate-limit request';
    }

    try {
      worker.send(reply);
    } catch {
      // Worker exited between request and reply; it falls back on timeout
    }
  });

  let disposed = false;
  const installation: PrimaryInstallation = {
    dispose: () => {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      for (const store of stores.values()) store.shutdown();
      stores.clear();
      installations.delete(transport);
    }
  };
  installations.set(transport, installation);
  return installation.dispose;
}
