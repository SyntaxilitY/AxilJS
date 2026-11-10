import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventBus, getGlobalEventBus, setGlobalEventBus } from '../src/event-bus';
import { OnEvent, registerEventHandlers } from '../src/decorators';
import type { axilEvent } from '../src/types';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('EventBus basics', () => {
  it('delivers payload and metadata to exact subscribers', async () => {
    const bus = new EventBus();
    const seen: axilEvent[] = [];
    bus.on('user.created', (e) => { seen.push(e); });
    await bus.emit('user.created', { id: 1 }, { source: 'test', correlationId: 'c1' });
    expect(seen).toHaveLength(1);
    expect(seen[0].type).toBe('user.created');
    expect(seen[0].payload).toEqual({ id: 1 });
    expect(seen[0].source).toBe('test');
    expect(seen[0].correlationId).toBe('c1');
    expect(seen[0].version).toBe(1);
    expect(typeof seen[0].id).toBe('string');
  });

  it('unsubscribe stops delivery', async () => {
    const bus = new EventBus();
    const fn = vi.fn();
    const sub = bus.on('a', fn);
    await bus.emit('a', 1);
    sub.unsubscribe();
    await bus.emit('a', 2);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(bus.getHandlerCount('a')).toBe(0);
  });

  it('handler errors go to onError and do not stop other handlers', async () => {
    const onError = vi.fn();
    const bus = new EventBus({ onError });
    const ok = vi.fn();
    bus.on('x', () => { throw new Error('boom'); });
    bus.on('x', ok);
    await bus.emit('x', null);
    expect(ok).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toBe('boom');
  });

  it('records history and filters by type, clear() resets', async () => {
    const bus = new EventBus();
    await bus.emit('a', 1);
    await bus.emit('b', 2);
    expect(bus.getHistory()).toHaveLength(2);
    expect(bus.getHistory('a')).toHaveLength(1);
    bus.on('a', () => {});
    expect(bus.getEventTypes()).toEqual(['a']);
    bus.clear();
    expect(bus.getHistory()).toHaveLength(0);
    expect(bus.getEventTypes()).toEqual([]);
  });

  it('emitMany emits each event', async () => {
    const bus = new EventBus();
    const fn = vi.fn();
    bus.on('*', fn);
    await bus.emitMany([{ type: 'a', payload: 1 }, { type: 'b', payload: 2 }]);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('global bus getter/setter', () => {
    const g = getGlobalEventBus();
    expect(getGlobalEventBus()).toBe(g);
    const mine = new EventBus();
    setGlobalEventBus(mine);
    expect(getGlobalEventBus()).toBe(mine);
  });
});

describe('wildcards', () => {
  it('matches prefix, suffix and catch-all patterns', async () => {
    const bus = new EventBus();
    const prefix = vi.fn();
    const suffix = vi.fn();
    const all = vi.fn();
    bus.on('user.*', prefix);
    bus.on('*.created', suffix);
    bus.on('*', all);
    await bus.emit('user.created', {});
    await bus.emit('order.created', {});
    await bus.emit('user.deleted', {});
    expect(prefix).toHaveBeenCalledTimes(2);
    expect(suffix).toHaveBeenCalledTimes(2);
    expect(all).toHaveBeenCalledTimes(3);
  });

  it('treats regex specials in patterns literally', async () => {
    const bus = new EventBus();
    const fn = vi.fn();
    bus.on('a+b.*', fn);
    await bus.emit('aab.x', {});
    expect(fn).not.toHaveBeenCalled();
    await bus.emit('a+b.x', {});
    expect(fn).toHaveBeenCalledTimes(1);
    const dot = vi.fn();
    bus.on('user.created', dot);
    await bus.emit('userXcreated', {});
    expect(dot).not.toHaveBeenCalled();
  });
});

describe('once / waitFor', () => {
  it('once fires a single time even under concurrent emits', async () => {
    const bus = new EventBus();
    const fn = vi.fn();
    bus.once('tick', fn);
    await Promise.all([bus.emit('tick', 1), bus.emit('tick', 2), bus.emit('tick', 3)]);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(bus.getHandlerCount('tick')).toBe(0);
  });

  it('waitFor resolves with the next event', async () => {
    const bus = new EventBus();
    const p = bus.waitFor('done', 1000);
    await bus.emit('done', { ok: true });
    await expect(p).resolves.toMatchObject({ payload: { ok: true } });
  });

  it('waitFor rejects on timeout and unsubscribes', async () => {
    vi.useFakeTimers();
    const bus = new EventBus();
    const p = bus.waitFor('never', 50);
    const assertion = expect(p).rejects.toThrow(/Timeout/);
    vi.advanceTimersByTime(60);
    await assertion;
    expect(bus.getHandlerCount('never')).toBe(0);
  });
});

describe('middleware', () => {
  it('runs middleware in order around handlers', async () => {
    const order: string[] = [];
    const bus = new EventBus({
      middleware: [
        async (_e, next) => { order.push('m1:before'); await next(); order.push('m1:after'); },
        async (_e, next) => { order.push('m2'); await next(); }
      ]
    });
    bus.on('a', () => { order.push('handler'); });
    await bus.emit('a', null);
    expect(order).toEqual(['m1:before', 'm2', 'handler', 'm1:after']);
  });

  it('middleware can short-circuit by not calling next', async () => {
    const bus = new EventBus({ middleware: [async () => { /* drop */ }] });
    const fn = vi.fn();
    bus.on('a', fn);
    await bus.emit('a', null);
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('maxListeners', () => {
  it('does not warn by default (unlimited)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bus = new EventBus();
    for (let i = 0; i < 200; i++) bus.on('a', () => {});
    expect(warn).not.toHaveBeenCalled();
    expect(bus.getMaxListeners()).toBe(0);
  });

  it('warns once per event type when the limit is exceeded, still registers', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bus = new EventBus({ maxListeners: 2 });
    bus.on('a', () => {});
    bus.on('a', () => {});
    expect(warn).not.toHaveBeenCalled();
    bus.on('a', () => {});
    bus.on('a', () => {});
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toMatch(/'a'/);
    expect(bus.getHandlerCount('a')).toBe(4);
    bus.on('b', () => {});
    bus.on('b', () => {});
    bus.on('b', () => {});
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it('setMaxListeners changes the threshold', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bus = new EventBus();
    bus.setMaxListeners(1);
    bus.on('a', () => {});
    bus.on('a', () => {});
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('@OnEvent decorator', () => {
  it('legacy signature registers handlers including inherited ones', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const calls: string[] = [];

    class Base {
      onBase(e: axilEvent) { calls.push('base:' + e.type); }
    }
    OnEvent('base.*')(Base.prototype, 'onBase', Object.getOwnPropertyDescriptor(Base.prototype, 'onBase'));

    class Svc extends Base {
      prefix = 'svc';
      onCreated(e: axilEvent) { calls.push(this.prefix + ':' + e.type); }
    }
    OnEvent('user.created')(Svc.prototype, 'onCreated', Object.getOwnPropertyDescriptor(Svc.prototype, 'onCreated'));

    const bus = new EventBus();
    registerEventHandlers(new Svc(), bus);
    await bus.emit('user.created', {});
    await bus.emit('base.x', {});
    expect(calls.sort()).toEqual(['base:base.x', 'svc:user.created']);

    // Parent class keeps only its own handler
    const bus2 = new EventBus();
    registerEventHandlers(new Base(), bus2);
    expect(bus2.getEventTypes()).toEqual(['base.*']);
  });

  it('TC39 signature (value, context) registers via addInitializer', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const initializers: Array<(this: any) => void> = [];
    const context = {
      kind: 'method',
      name: 'handle',
      static: false,
      private: false,
      addInitializer: (fn: (this: any) => void) => { initializers.push(fn); }
    };

    class Svc {
      got: unknown[] = [];
      handle(e: axilEvent) { this.got.push(e.payload); }
    }
    const result = (OnEvent('order.placed') as any)(Svc.prototype.handle, context);
    expect(result).toBeUndefined();

    const inst = new Svc();
    // Simulate the runtime calling initializers during construction
    for (const fn of initializers) fn.call(inst);

    const bus = new EventBus();
    registerEventHandlers(inst, bus);
    await bus.emit('order.placed', 42);
    expect(inst.got).toEqual([42]);
    // Metadata is not enumerable on the instance
    expect(Object.keys(inst)).toEqual(['got']);
  });

  it('registerEventHandlers is a no-op for undecorated instances', () => {
    const bus = new EventBus();
    registerEventHandlers({}, bus);
    expect(bus.getEventTypes()).toEqual([]);
  });

  it('warns and skips metadata pointing at a non-function', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    class Svc {}
    OnEvent('a')(Svc.prototype, 'missing');
    const bus = new EventBus();
    registerEventHandlers(new Svc(), bus);
    expect(warn).toHaveBeenCalled();
    expect(bus.getHandlerCount('a')).toBe(0);
  });
});
