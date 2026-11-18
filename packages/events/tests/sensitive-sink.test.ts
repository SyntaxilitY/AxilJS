import { describe, it, expect, afterEach } from 'vitest';
import { EventBus } from '../src/event-bus';

// @axiljs/runtime's sensitive data lineage listens on this hook
const KEY = Symbol.for('axiljs.sensitive.sink');

afterEach(() => {
  delete (globalThis as any)[KEY];
});

describe('sensitive data sink hook', () => {
  it('passes every emitted payload to the hook as the event sink', async () => {
    const calls: unknown[][] = [];
    (globalThis as any)[KEY] = (...args: unknown[]) => { calls.push(args); };
    const bus = new EventBus();
    const payload = { to: 'ann@example.com' };
    await bus.emit('user.created', payload);
    expect(calls).toEqual([['event', payload]]);
  });

  it('rejects before any handler runs when the hook throws', async () => {
    (globalThis as any)[KEY] = () => { throw new Error('leak'); };
    const bus = new EventBus();
    let handled = false;
    bus.on('user.created', () => { handled = true; });
    await expect(bus.emit('user.created', { to: 'x' })).rejects.toThrow('leak');
    expect(handled).toBe(false);
  });

  it('is a no-op without the hook', async () => {
    const bus = new EventBus();
    let handled = false;
    bus.on('user.created', () => { handled = true; });
    await bus.emit('user.created', { to: 'x' });
    expect(handled).toBe(true);
  });
});
