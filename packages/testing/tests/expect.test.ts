import { describe, it, expect as vexpect } from 'vitest';
import { expect, AssertionError } from '../src/assertions/expect';
import { fn, spyOn, isMockFunction } from '../src/mock/mock';

function fails(assertion: () => void, message?: RegExp): void {
  let error: unknown;
  try { assertion(); } catch (e) { error = e; }
  vexpect(error).toBeInstanceOf(AssertionError);
  if (message) vexpect((error as Error).message).toMatch(message);
}

async function failsAsync(assertion: () => Promise<void>, message?: RegExp): Promise<void> {
  let error: unknown;
  try { await assertion(); } catch (e) { error = e; }
  vexpect(error).toBeInstanceOf(AssertionError);
  if (message) vexpect((error as Error).message).toMatch(message);
}

describe('existing matchers keep working', () => {
  it('toBe / toEqual / truthiness / not', () => {
    expect(1).toBe(1);
    expect({ a: [1, 2] }).toEqual({ a: [1, 2] });
    expect(0).toBeFalsy();
    expect('x').toBeTruthy();
    expect(null).toBeNull();
    expect(undefined).toBeUndefined();
    expect(1).toBeDefined();
    expect(1).not.toBe(2);
    expect('hello').toMatch(/ell/);
    expect('hello').toMatch('ll');
    fails(() => expect(1).toBe(2), /Expected 1 to be 2/);
    fails(() => expect(1).not.toBe(1), /to not be 1/);
  });

  it('toThrow with message, RegExp and class', () => {
    const boom = () => { throw new TypeError('boom happened'); };
    expect(boom).toThrow();
    expect(boom).toThrow('boom');
    expect(boom).toThrow(/happened$/);
    expect(boom).toThrow(TypeError);
    expect(() => {}).not.toThrow();
    fails(() => expect(boom).toThrow(RangeError));
    fails(() => expect(boom).toThrow('nope'), /with message: 'nope'/);
  });
});

describe('new matchers', () => {
  it('toMatchObject matches recursive subsets', () => {
    const user = { id: 1, name: 'Tariq', roles: ['admin'], profile: { city: 'Lahore', zip: '54000' } };
    expect(user).toMatchObject({ name: 'Tariq' });
    expect(user).toMatchObject({ profile: { city: 'Lahore' } });
    expect(user).toMatchObject({ roles: ['admin'] });
    expect([{ a: 1, b: 2 }, { a: 3 }]).toMatchObject([{ a: 1 }, { a: 3 }]);
    expect(user).not.toMatchObject({ name: 'Other' });
    fails(() => expect(user).toMatchObject({ missing: true }), /match object/);
    fails(() => expect(user).toMatchObject({ roles: [] }));
    fails(() => expect(null).toMatchObject({ a: 1 }));
  });

  it('toHaveProperty supports paths, arrays of keys and values', () => {
    const obj = { a: { b: [{ c: 5 }] }, u: undefined, zero: 0 };
    expect(obj).toHaveProperty('a');
    expect(obj).toHaveProperty('a.b[0].c', 5);
    expect(obj).toHaveProperty(['a', 'b', 0, 'c'], 5);
    expect(obj).toHaveProperty('u');
    expect(obj).toHaveProperty('u', undefined);
    expect(obj).toHaveProperty('zero', 0);
    expect(obj).not.toHaveProperty('a.x');
    fails(() => expect(obj).toHaveProperty('a.b[0].c', 6), /got 5/);
    fails(() => expect(null).toHaveProperty('a'));
  });

  it('toContain / toContainEqual', () => {
    expect([1, 2, 3]).toContain(2);
    expect('hello world').toContain('world');
    expect(new Set(['a'])).toContain('a');
    expect([{ a: 1 }]).toContainEqual({ a: 1 });
    expect([{ a: 1 }]).not.toContain({ a: 1 });
    fails(() => expect([1]).toContain(2), /to contain 2/);
  });

  it('toBeCloseTo', () => {
    expect(0.1 + 0.2).toBeCloseTo(0.3);
    expect(3.14159).toBeCloseTo(3.14, 2);
    expect(3.14159).not.toBeCloseTo(3.15, 2);
    expect(1.0004).toBeCloseTo(1, 3);
    fails(() => expect(1.01).toBeCloseTo(1, 2), /close to 1/);
  });

  it('numeric comparisons', () => {
    expect(5).toBeGreaterThan(4);
    expect(5).toBeGreaterThanOrEqual(5);
    expect(4).toBeLessThan(5);
    expect(5).toBeLessThanOrEqual(5);
    fails(() => expect(5).toBeGreaterThan(5));
    fails(() => expect(6).toBeLessThanOrEqual(5));
  });

  it('toHaveLength / toBeInstanceOf / toBeNaN', () => {
    expect([1, 2]).toHaveLength(2);
    expect('abc').toHaveLength(3);
    expect(new Date()).toBeInstanceOf(Date);
    expect(new TypeError('x')).toBeInstanceOf(Error);
    expect(NaN).toBeNaN();
    fails(() => expect([]).toHaveLength(1), /Expected length 1, got 0/);
    fails(() => expect({}).toBeInstanceOf(Date), /\(Object\) to be instance of Date/);
  });
});

describe('resolves / rejects', () => {
  it('resolves runs any matcher on the resolved value', async () => {
    await expect(Promise.resolve({ ok: true, n: 3 })).resolves.toEqual({ ok: true, n: 3 });
    await expect(Promise.resolve({ ok: true, n: 3 })).resolves.toMatchObject({ ok: true });
    await expect(Promise.resolve(5)).resolves.not.toBe(4);
    await expect(Promise.resolve(5)).not.resolves.toBe(4);
    await failsAsync(() => expect(Promise.resolve(1)).resolves.toBe(2), /Expected 1 to be 2/);
    await failsAsync(
      () => expect(Promise.reject(new Error('nope'))).resolves.toBe(1),
      /to resolve but it rejected/
    );
  });

  it('rejects.toThrow keeps the original message semantics', async () => {
    await expect(Promise.reject(new Error('db timeout'))).rejects.toThrow();
    await expect(Promise.reject(new Error('db timeout'))).rejects.toThrow('timeout');
    await expect(Promise.reject(new RangeError('x'))).rejects.toThrow(RangeError);
    await failsAsync(
      () => expect(Promise.reject(new Error('db timeout'))).rejects.toThrow('auth'),
      /Expected rejection message to include 'auth', got 'db timeout'/
    );
    await failsAsync(() => expect(Promise.resolve(1)).rejects.toThrow(), /to reject but it resolved/);
  });

  it('rejects works with other matchers on the reason', async () => {
    class NotFound extends Error { status = 404; }
    await expect(Promise.reject(new NotFound('missing'))).rejects.toBeInstanceOf(NotFound);
    await expect(Promise.reject(new NotFound('missing'))).rejects.toHaveProperty('status', 404);
  });

  it('accepts a function returning a promise', async () => {
    await expect(async () => 7).resolves.toBe(7);
  });
});

describe('mock functions', () => {
  it('fn() records calls, results and this', () => {
    const m = fn((a: number, b: number) => a + b);
    vexpect(isMockFunction(m)).toBe(true);
    vexpect(m(1, 2)).toBe(3);
    m.call({ tag: 'ctx' }, 5, 5);
    vexpect(m.mock.calls).toEqual([[1, 2], [5, 5]]);
    vexpect(m.mock.results).toEqual([{ type: 'return', value: 3 }, { type: 'return', value: 10 }]);
    vexpect(m.mock.instances[1]).toEqual({ tag: 'ctx' });
    vexpect(m.mock.lastCall).toEqual([5, 5]);
  });

  it('mockReturnValue / Once / mockImplementation', () => {
    const m = fn().mockReturnValue('default').mockReturnValueOnce('first');
    vexpect(m()).toBe('first');
    vexpect(m()).toBe('default');
    m.mockImplementation((x: number) => x * 2);
    vexpect(m(4)).toBe(8);
    m.mockImplementationOnce(() => 'once');
    vexpect(m(1)).toBe('once');
    vexpect(m(1)).toBe(2);
  });

  it('mockResolvedValue / mockRejectedValue', async () => {
    const ok = fn().mockResolvedValue({ id: 1 });
    await vexpect(ok()).resolves.toEqual({ id: 1 });
    const bad = fn().mockRejectedValue(new Error('down'));
    await vexpect(bad()).rejects.toThrow('down');
  });

  it('records thrown errors', () => {
    const m = fn(() => { throw new Error('x'); });
    vexpect(() => m()).toThrow('x');
    vexpect(m.mock.results[0].type).toBe('throw');
  });

  it('mockClear / mockReset', () => {
    const m = fn().mockReturnValue(1);
    m();
    const calls = m.mock;
    m.mockClear();
    vexpect(m.mock.calls).toEqual([]);
    vexpect(calls.calls).toEqual([]);
    vexpect(m()).toBe(1);
    m.mockReset();
    vexpect(m()).toBeUndefined();
  });

  it('spyOn calls through, can be stubbed and restored', () => {
    const service = {
      factor: 3,
      calc(x: number) { return x * this.factor; }
    };
    const original = service.calc;
    const spy = spyOn(service, 'calc');

    vexpect(service.calc(2)).toBe(6);
    vexpect(spy.mock.calls).toEqual([[2]]);

    spy.mockReturnValue(100);
    vexpect(service.calc(2)).toBe(100);

    spy.mockRestore();
    vexpect(service.calc).toBe(original);
    vexpect(service.calc(2)).toBe(6);
  });

  it('spyOn restores inherited methods by deleting the own property', () => {
    class Base { hello() { return 'hi'; } }
    const obj = new Base();
    const spy = spyOn(obj, 'hello').mockReturnValue('stub');
    vexpect(obj.hello()).toBe('stub');
    spy.mockRestore();
    vexpect(Object.prototype.hasOwnProperty.call(obj, 'hello')).toBe(false);
    vexpect(obj.hello()).toBe('hi');
  });

  it('spyOn rejects non-functions', () => {
    vexpect(() => spyOn({ a: 1 } as any, 'a')).toThrow(/not a function/);
  });
});

describe('mock matchers', () => {
  it('toHaveBeenCalled / Times / With / LastCalledWith', () => {
    const m = fn();
    expect(m).not.toHaveBeenCalled();
    m('a', { deep: [1] });
    m('b');
    expect(m).toHaveBeenCalled();
    expect(m).toHaveBeenCalledTimes(2);
    expect(m).toHaveBeenCalledWith('a', { deep: [1] });
    expect(m).not.toHaveBeenCalledWith('c');
    expect(m).toHaveBeenLastCalledWith('b');
    fails(() => expect(m).toHaveBeenCalledTimes(1), /1 time\(s\), got 2/);
    fails(() => expect(m).toHaveBeenCalledWith('z'), /called with \["z"\]/);
  });

  it('mock matchers reject plain functions', () => {
    fails(() => expect(() => {}).toHaveBeenCalled(), /expects a mock function/);
  });
});
