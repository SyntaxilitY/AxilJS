import { describe, it, expect, afterEach } from 'vitest';
import { Queue } from '../src/queue';

// @axiljs/runtime's sensitive data lineage listens on this hook
const KEY = Symbol.for('axiljs.sensitive.sink');

afterEach(() => {
  delete (globalThis as any)[KEY];
});

describe('sensitive data sink hook', () => {
  it('passes job data to the hook as the queue sink', async () => {
    const calls: unknown[][] = [];
    (globalThis as any)[KEY] = (...args: unknown[]) => { calls.push(args); };
    const q = new Queue('lineage', { logger: false });
    const data = { to: 'ann@example.com' };
    await q.add('send', data);
    expect(calls).toEqual([['queue', data]]);
  });

  it('stores nothing when the hook throws', async () => {
    (globalThis as any)[KEY] = () => { throw new Error('leak'); };
    const q = new Queue('lineage', { logger: false });
    await expect(q.add('send', { to: 'x' })).rejects.toThrow('leak');
    expect(q.getJobs()).toHaveLength(0);
  });

  it('is a no-op without the hook', async () => {
    const q = new Queue('lineage', { logger: false });
    await q.add('send', { to: 'x' });
    expect(q.getJobs()).toHaveLength(1);
  });
});
