import { describe, it, expect, beforeEach } from 'vitest';
import { CloudCache } from '../src/cache';

describe('Cloud Cache', () => {
  let c: CloudCache;

  beforeEach(() => {
    c = new CloudCache({ defaultTtlMs: 5000 });
  });

  it('stores and retrieves values', () => {
    c.set('key1', { name: 'test' });
    expect(c.get('key1')).toEqual({ name: 'test' });
  });

  it('returns undefined for expired entries', async () => {
    c.set('key2', 'value', { ttlMs: 10 });
    await new Promise(r => setTimeout(r, 20));
    expect(c.get('key2')).toBeUndefined();
  });

  it('invalidates by tag', () => {
    c.set('a', 1, { tags: ['tenant:acme'] });
    c.set('b', 2, { tags: ['tenant:acme'] });
    c.set('c', 3, { tags: ['tenant:delta'] });

    const removed = c.invalidateTag('tenant:acme');
    expect(removed).toBe(2);
    expect(c.get('c')).toBe(3);
  });
});