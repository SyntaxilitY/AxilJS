/**
 * In-memory EventTransport.
 * Links several EventBus instances inside one process as if they lived in
 * separate processes. Useful for tests and single-process multi-bus setups.
 *
 * Usage:
 *   const [ta, tb] = createLinkedTransports(2)
 *   const a = new EventBus({ transport: ta })
 *   const b = new EventBus({ transport: tb })
 *   b.on('user.*', handler)
 *   await a.emit('user.created', { id: 1 }, { broadcast: true })
 */

import { EventTransport, EventTransportMessage } from './types';

type MessageHandler = (message: EventTransportMessage) => void;

export class InMemoryTransport implements EventTransport {
  // Every transport linked to this one (including itself)
  private readonly group: Set<InMemoryTransport>;
  private readonly handlers = new Set<MessageHandler>();
  private closed = false;

  /**
   * @param linkTo  Join the group of an existing transport. Omit to start a
   *                new, empty group.
   */
  constructor(linkTo?: InMemoryTransport) {
    this.group = linkTo ? linkTo.group : new Set<InMemoryTransport>();
    this.group.add(this);
  }

  /**
   * Deliver a copy of the message to the subscribers of every linked
   * transport, including this one (EventBus drops its own echoes by origin).
   * Delivery is asynchronous (next microtask) and each subscriber receives its
   * own JSON round-tripped copy, mirroring real IPC: no shared references.
   * Resolves once every subscriber has been called; if a subscriber throws,
   * the others still receive the message and the first error is rethrown.
   */
  async publish(message: EventTransportMessage): Promise<void> {
    if (this.closed) throw new Error('InMemoryTransport is closed');
    const json = JSON.stringify(message);
    await Promise.resolve();
    let firstError: unknown = null;
    for (const peer of Array.from(this.group)) {
      for (const handler of Array.from(peer.handlers)) {
        try {
          handler(JSON.parse(json) as EventTransportMessage);
        } catch (error) {
          // Keep delivering to the others; report the first failure
          if (firstError === null) firstError = error;
        }
      }
    }
    if (firstError !== null) throw firstError;
  }

  subscribe(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => { this.handlers.delete(handler); };
  }

  /**
   * Leave the group and drop all subscribers. Later publishes throw.
   */
  close(): void {
    this.closed = true;
    this.handlers.clear();
    this.group.delete(this);
  }

  /**
   * Number of transports currently linked in this group (including this one).
   */
  get size(): number {
    return this.group.size;
  }
}

/**
 * Create `n` transports linked to each other.
 */
export function createLinkedTransports(n: number): InMemoryTransport[] {
  if (!Number.isInteger(n) || n < 1) {
    throw new RangeError(`createLinkedTransports: n must be a positive integer, got ${n}`);
  }
  const first = new InMemoryTransport();
  const result = [first];
  for (let i = 1; i < n; i++) result.push(new InMemoryTransport(first));
  return result;
}
