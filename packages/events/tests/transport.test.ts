import { describe, it, expect, vi } from 'vitest';
import { EventBus, assertJsonSafe } from '../src/event-bus';
import { InMemoryTransport, createLinkedTransports } from '../src/in-memory-transport';
import {
  ClusterTransport,
  installClusterEventRelay,
  isClusterEventEnvelope,
  CLUSTER_EVENTS_TAG
} from '../src/cluster-transport';
import type { ClusterChannel, ClusterRelayHost, ClusterWorkerLike } from '../src/cluster-transport';
import type { axilEvent, EventTransport, EventTransportMessage } from '../src/types';

// Let queued microtasks / async dispatches settle
const flush = () => new Promise<void>((r) => setImmediate(r));

function linkedBuses(n: number): EventBus[] {
  return createLinkedTransports(n).map((t) => new EventBus({ transport: t }));
}

describe('EventBus + InMemoryTransport', () => {
  it('delivers broadcast events to the other bus with metadata intact', async () => {
    const [a, b] = linkedBuses(2);
    const seen: axilEvent[] = [];
    b.on('user.created', (e) => { seen.push(e); });

    await a.emit('user.created', { id: 1 }, { broadcast: true, source: 'svc', correlationId: 'c1' });
    await flush();

    expect(seen).toHaveLength(1);
    expect(seen[0].payload).toEqual({ id: 1 });
    expect(seen[0].source).toBe('svc');
    expect(seen[0].correlationId).toBe('c1');
    expect(seen[0]).not.toHaveProperty('broadcast');
    expect(b.getHistory('user.created')).toHaveLength(1);
  });

  it('runs wildcard handlers on the remote side', async () => {
    const [a, b] = linkedBuses(2);
    const types: string[] = [];
    b.on('order.*', (e) => { types.push(`order.*:${e.type}`); });
    b.on('*', (e) => { types.push(`*:${e.type}`); });

    await a.emit('order.shipped', { id: 7 }, { broadcast: true });
    await flush();

    expect(types.sort()).toEqual(['*:order.shipped', 'order.*:order.shipped']);
  });

  it('runs local handlers exactly once and drops its own echo', async () => {
    const [a, b] = linkedBuses(2);
    const local = vi.fn();
    const remote = vi.fn();
    a.on('x', local);
    b.on('x', remote);

    await a.emit('x', 1, { broadcast: true });
    await flush();
    await flush();

    expect(local).toHaveBeenCalledTimes(1);
    expect(remote).toHaveBeenCalledTimes(1);
    expect(a.getHistory('x')).toHaveLength(1);
  });

  it('does not re-publish received events (no loops across three buses)', async () => {
    const transports = createLinkedTransports(3);
    const spies = transports.map((t) => vi.spyOn(t, 'publish'));
    const buses = transports.map((t) => new EventBus({ transport: t }));
    const counts = [vi.fn(), vi.fn(), vi.fn()];
    buses.forEach((bus, i) => bus.on('ping', counts[i]));

    await buses[0].emit('ping', null, { broadcast: true });
    for (let i = 0; i < 5; i++) await flush();

    expect(counts.map((c) => c.mock.calls.length)).toEqual([1, 1, 1]);
    expect(spies.map((s) => s.mock.calls.length)).toEqual([1, 0, 0]);
  });

  it('keeps plain emits local even with a transport attached', async () => {
    const [ta, tb] = createLinkedTransports(2);
    const publish = vi.spyOn(ta, 'publish');
    const a = new EventBus({ transport: ta });
    const b = new EventBus({ transport: tb });
    const remote = vi.fn();
    const local = vi.fn();
    a.on('local.only', local);
    b.on('local.only', remote);

    await a.emit('local.only', { n: 1 });
    await flush();

    expect(local).toHaveBeenCalledTimes(1);
    expect(remote).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('broadcast: true on the bus makes broadcasting the default; emits can opt out', async () => {
    const [ta, tb] = createLinkedTransports(2);
    const a = new EventBus({ transport: ta, broadcast: true });
    const b = new EventBus({ transport: tb });
    const remote = vi.fn();
    b.on('*', remote);

    await a.emit('one', 1);
    await a.emit('two', 2, { broadcast: false });
    await flush();

    expect(remote).toHaveBeenCalledTimes(1);
    expect(remote.mock.calls[0][0].type).toBe('one');
  });

  it('resolves waitFor from a remote event', async () => {
    const [a, b] = linkedBuses(2);
    const waiting = b.waitFor<{ ok: boolean }>('payment.confirmed', 1000);

    await a.emit('payment.confirmed', { ok: true }, { broadcast: true });

    const event = await waiting;
    expect(event.payload).toEqual({ ok: true });
    expect(b.getHandlerCount('payment.confirmed')).toBe(0);
  });

  it('remote handlers receive a copy, not the sender object', async () => {
    const [a, b] = linkedBuses(2);
    const payload = { list: [1, 2], when: new Date('2026-01-01T00:00:00.000Z') };
    let received: any;
    b.on('copy', (e) => { received = e.payload; });

    await a.emit('copy', payload, { broadcast: true });
    await flush();

    expect(received).not.toBe(payload);
    expect(received).toEqual({ list: [1, 2], when: '2026-01-01T00:00:00.000Z' });
  });

  it('rejects non-serializable broadcast payloads before any handler runs', async () => {
    const [ta] = createLinkedTransports(1);
    const publish = vi.spyOn(ta, 'publish');
    const a = new EventBus({ transport: ta });
    const local = vi.fn();
    a.on('bad', local);

    const circular: any = { a: 1 };
    circular.self = circular;

    await expect(a.emit('bad', { fn: () => 1 }, { broadcast: true })).rejects.toThrow(TypeError);
    await expect(a.emit('bad', circular, { broadcast: true })).rejects.toThrow(/circular/);
    await expect(a.emit('bad', new Map(), { broadcast: true })).rejects.toThrow(/Map instance/);
    await expect(a.emit('bad', { n: 10n }, { broadcast: true })).rejects.toThrow(/payload\.n is a bigint/);
    await expect(a.emit('bad', [NaN], { broadcast: true })).rejects.toThrow(/payload\[0\] is NaN/);

    expect(local).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
    expect(a.getHistory()).toHaveLength(0);
  });

  it('validates broadcast payloads even without a transport, then stays local', async () => {
    const bus = new EventBus();
    const fn = vi.fn();
    bus.on('e', fn);
    await expect(bus.emit('e', { s: Symbol('x') }, { broadcast: true })).rejects.toThrow(TypeError);
    await bus.emit('e', { ok: 1 }, { broadcast: true });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('non-broadcast emits accept any payload (default behaviour unchanged)', async () => {
    const [ta] = createLinkedTransports(1);
    const a = new EventBus({ transport: ta });
    const fn = vi.fn();
    a.on('any', fn);
    const map = new Map([[1, 2]]);
    await a.emit('any', map);
    expect(fn.mock.calls[0][0].payload).toBe(map);
  });

  it('routes transport publish failures to onError without failing emit', async () => {
    const onError = vi.fn();
    const transport: EventTransport = {
      publish: () => Promise.reject(new Error('wire down')),
      subscribe: () => () => {}
    };
    const bus = new EventBus({ transport, onError });
    const local = vi.fn();
    bus.on('t', local);

    await expect(bus.emit('t', 1, { broadcast: true })).resolves.toBeUndefined();
    expect(local).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toMatch(/Transport publish failed: wire down/);
  });

  it('ignores malformed transport messages', async () => {
    let deliver: (m: EventTransportMessage) => void = () => {};
    const transport: EventTransport = {
      publish: () => {},
      subscribe: (h) => { deliver = h; return () => {}; }
    };
    const bus = new EventBus({ transport });
    const fn = vi.fn();
    bus.on('*', fn);

    deliver(null as any);
    deliver({ origin: 'x' } as any);
    deliver({ origin: 'x', event: { payload: 1 } } as any);
    await flush();
    expect(fn).not.toHaveBeenCalled();
  });

  it('useTransport swaps and detaches transports', async () => {
    const [ta, tb] = createLinkedTransports(2);
    const a = new EventBus();
    const b = new EventBus({ transport: tb });
    const fn = vi.fn();
    a.on('e', fn);

    expect(a.useTransport(ta)).toBe(a);
    expect(a.getTransport()).toBe(ta);
    await b.emit('e', 1, { broadcast: true });
    await flush();
    expect(fn).toHaveBeenCalledTimes(1);

    a.useTransport(null);
    expect(a.getTransport()).toBeNull();
    await b.emit('e', 2, { broadcast: true });
    await flush();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('gives each bus a distinct originId', () => {
    const [a, b] = linkedBuses(2);
    expect(a.originId).toEqual(expect.any(String));
    expect(a.originId).not.toBe(b.originId);
  });

  it('createLinkedTransports validates n and close() leaves the group', async () => {
    expect(() => createLinkedTransports(0)).toThrow(RangeError);
    const [t1, t2, t3] = createLinkedTransports(3);
    expect(t1.size).toBe(3);
    t3.close();
    expect(t1.size).toBe(2);
    await expect(t3.publish({ origin: 'o', event: { type: 'x' } as any })).rejects.toThrow(/closed/);
    const joined = new InMemoryTransport(t2);
    expect(joined.size).toBe(3);
  });
});

describe('assertJsonSafe', () => {
  it('accepts plain JSON data, Date, null-prototype objects and top-level undefined', () => {
    expect(() => assertJsonSafe({ a: [1, 'x', true, null, { b: new Date() }], u: undefined })).not.toThrow();
    expect(() => assertJsonSafe(Object.create(null))).not.toThrow();
    expect(() => assertJsonSafe(undefined)).not.toThrow();
    // shared (non-circular) references are fine
    const shared = { v: 1 };
    expect(() => assertJsonSafe({ x: shared, y: shared })).not.toThrow();
  });

  it('rejects nested undefined, Infinity and class instances', () => {
    expect(() => assertJsonSafe([undefined])).toThrow(/payload\[0\] is undefined/);
    expect(() => assertJsonSafe({ n: Infinity })).toThrow(/Infinity/);
    expect(() => assertJsonSafe({ e: new Error('x') })).toThrow(/Error instance/);
  });
});

// ─── Cluster protocol with fake channels ──────────────────────────────────────

/** A fake cluster: one primary host plus N worker channels wired together. */
function fakeCluster(n: number) {
  const primaryListeners = new Set<(w: ClusterWorkerLike, m: unknown) => void>();
  const workers: Array<ClusterWorkerLike & { alive: boolean; inbox: Set<(m: unknown) => void> }> = [];
  const channels: ClusterChannel[] = [];
  const toWorker: unknown[][] = [];

  const addWorker = () => {
    const id = workers.length + 1;
    const inbox = new Set<(m: unknown) => void>();
    const received: unknown[] = [];
    toWorker.push(received);
    const worker = {
      id,
      alive: true,
      inbox,
      isConnected: () => worker.alive,
      // primary → worker (IPC is async and serializes)
      send(message: unknown, cb?: (e: Error | null) => void) {
        const copy = JSON.parse(JSON.stringify(message));
        received.push(copy);
        setImmediate(() => {
          inbox.forEach((l) => l(copy));
          cb?.(null);
        });
        return true;
      }
    };
    workers.push(worker);
    const channel: ClusterChannel = {
      connected: true,
      // worker → primary
      send(message, cb) {
        const copy = JSON.parse(JSON.stringify(message));
        setImmediate(() => {
          primaryListeners.forEach((l) => l(worker, copy));
          cb?.(null);
        });
        return true;
      },
      onMessage(listener) {
        inbox.add(listener);
        return () => { inbox.delete(listener); };
      }
    };
    channels.push(channel);
    return channel;
  };

  for (let i = 0; i < n; i++) addWorker();

  const host: ClusterRelayHost = {
    workers: () => workers.filter((w) => w.alive),
    onMessage(listener) {
      primaryListeners.add(listener);
      return () => { primaryListeners.delete(listener); };
    }
  };

  return { host, channels, workers, toWorker, addWorker, primaryListeners };
}

const settle = async () => { for (let i = 0; i < 6; i++) await flush(); };

describe('ClusterTransport + installClusterEventRelay', () => {
  it('relays a worker broadcast to every other worker, not back to the sender', async () => {
    const c = fakeCluster(3);
    const dispose = installClusterEventRelay({ host: c.host });
    const buses = c.channels.map((ch) => new EventBus({ transport: new ClusterTransport({ channel: ch }) }));
    const counts = [vi.fn(), vi.fn(), vi.fn()];
    buses.forEach((bus, i) => bus.on('cache.*', counts[i]));

    await buses[0].emit('cache.invalidate', { key: 'users' }, { broadcast: true });
    await settle();

    expect(counts.map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);
    expect(counts[2].mock.calls[0][0].payload).toEqual({ key: 'users' });
    expect(c.toWorker[0]).toHaveLength(0);
    expect(c.toWorker[1]).toHaveLength(1);
    expect(c.toWorker[1][0]).toMatchObject({ __axil: CLUSTER_EVENTS_TAG, v: 1, origin: buses[0].originId });
    dispose();
  });

  it('includes workers forked after installation and skips dead ones', async () => {
    const c = fakeCluster(1);
    const dispose = installClusterEventRelay({ host: c.host });
    const late = c.addWorker();
    const dead = c.addWorker();
    c.workers[2].alive = false;

    const a = new EventBus({ transport: new ClusterTransport({ channel: c.channels[0] }) });
    const b = new EventBus({ transport: new ClusterTransport({ channel: late }) });
    const d = new EventBus({ transport: new ClusterTransport({ channel: dead }) });
    const fb = vi.fn();
    const fd = vi.fn();
    b.on('hello', fb);
    d.on('hello', fd);

    await a.emit('hello', 1, { broadcast: true });
    await settle();

    expect(fb).toHaveBeenCalledTimes(1);
    expect(fd).not.toHaveBeenCalled();
    dispose();
  });

  it('ignores non-envelope IPC messages on both ends', async () => {
    const c = fakeCluster(2);
    const dispose = installClusterEventRelay({ host: c.host });
    const b = new EventBus({ transport: new ClusterTransport({ channel: c.channels[1] }) });
    const fb = vi.fn();
    b.on('*', fb);

    // worker 1 sends an unrelated message (e.g. @axiljs/scale control message)
    c.channels[0].send!({ type: 'axil:shutdown' });
    c.channels[0].send!({ __axil: 'other', v: 1, origin: 'o', event: { type: 'x' } });
    await settle();
    expect(c.toWorker[1]).toHaveLength(0);

    // the primary sends an unrelated message straight to worker 2
    c.workers[1].send({ type: 'something-else' });
    await settle();
    expect(fb).not.toHaveBeenCalled();
    dispose();
  });

  it('is idempotent per host and stops relaying once every disposer ran', async () => {
    const c = fakeCluster(2);
    const d1 = installClusterEventRelay({ host: c.host });
    const d2 = installClusterEventRelay({ host: c.host });
    expect(c.primaryListeners.size).toBe(1);

    const a = new EventBus({ transport: new ClusterTransport({ channel: c.channels[0] }) });
    await a.emit('once', 1, { broadcast: true });
    await settle();
    expect(c.toWorker[1]).toHaveLength(1); // relayed once, not twice

    d1();
    d1(); // disposer is idempotent
    expect(c.primaryListeners.size).toBe(1);
    d2();
    expect(c.primaryListeners.size).toBe(0);

    await a.emit('once', 2, { broadcast: true });
    await settle();
    expect(c.toWorker[1]).toHaveLength(1);

    // can be installed again afterwards
    const d3 = installClusterEventRelay({ host: c.host });
    expect(c.primaryListeners.size).toBe(1);
    d3();
  });

  it('reports relay send failures to onError and keeps relaying to others', async () => {
    const c = fakeCluster(3);
    c.workers[1].send = () => { throw new Error('channel closed'); };
    const onError = vi.fn();
    const dispose = installClusterEventRelay({ host: c.host, onError });
    const a = new EventBus({ transport: new ClusterTransport({ channel: c.channels[0] }) });
    const third = new EventBus({ transport: new ClusterTransport({ channel: c.channels[2] }) });
    const f = vi.fn();
    third.on('e', f);

    await a.emit('e', 1, { broadcast: true });
    await settle();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][1].id).toBe(2);
    expect(f).toHaveBeenCalledTimes(1);
    dispose();
  });

  it('is inert without an IPC channel (single-process mode)', async () => {
    const channel: ClusterChannel = { onMessage: vi.fn(() => () => {}) };
    const transport = new ClusterTransport({ channel });
    expect(transport.active).toBe(false);
    const bus = new EventBus({ transport });
    const fn = vi.fn();
    bus.on('e', fn);

    await bus.emit('e', 1, { broadcast: true });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(channel.onMessage).not.toHaveBeenCalled();
  });

  it('close() removes IPC listeners and rejects later publishes', async () => {
    const c = fakeCluster(1);
    const transport = new ClusterTransport({ channel: c.channels[0] });
    new EventBus({ transport });
    expect(transport.active).toBe(true);
    // inbox of worker 1 has the bus's listener
    expect(c.workers[0].inbox.size).toBe(1);
    transport.close();
    expect(c.workers[0].inbox.size).toBe(0);
    expect(transport.active).toBe(false);
    await expect(transport.publish({ origin: 'o', event: { type: 'x' } as any })).rejects.toThrow(/closed/);
  });

  it('rejects publish when the channel is disconnected (surfaced via onError)', async () => {
    const c = fakeCluster(1);
    (c.channels[0] as any).connected = false;
    const onError = vi.fn();
    const bus = new EventBus({ transport: new ClusterTransport({ channel: c.channels[0] }), onError });
    await bus.emit('e', 1, { broadcast: true });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toMatch(/IPC channel is closed/);
  });

  it('isClusterEventEnvelope checks tag, version, origin and event type', () => {
    const ok = { __axil: 'events', v: 1, origin: 'o', event: { type: 't' } };
    expect(isClusterEventEnvelope(ok)).toBe(true);
    expect(isClusterEventEnvelope({ ...ok, v: 2 })).toBe(false);
    expect(isClusterEventEnvelope({ ...ok, __axil: 'jobs' })).toBe(false);
    expect(isClusterEventEnvelope({ ...ok, origin: 1 })).toBe(false);
    expect(isClusterEventEnvelope({ ...ok, event: {} })).toBe(false);
    expect(isClusterEventEnvelope('events')).toBe(false);
    expect(isClusterEventEnvelope(null)).toBe(false);
  });

  it('installClusterEventRelay with the default host installs and disposes cleanly', () => {
    // Real node:cluster here (the test process is a cluster primary, or the
    // call is a no-op if it is not); either way it must be safe to call.
    const dispose = installClusterEventRelay();
    const again = installClusterEventRelay();
    expect(typeof dispose).toBe('function');
    expect(typeof again).toBe('function');
    again();
    dispose();
  });
});
