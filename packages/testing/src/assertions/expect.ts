/**
 * Assertion library.
 * Chainable expect() API similar to Jest.
 *
 * Usage:
 *   expect(value).toBe(expected)
 *   expect(array).toHaveLength(3)
 *   expect(fn).toThrow()
 *   expect(obj).toMatchObject({ user: { name: 'Tariq' } })
 *   expect(mockFn).toHaveBeenCalledWith('a', 1)
 *   await expect(promise).resolves.toEqual({ ok: true })
 *   await expect(promise).rejects.toThrow('boom')
 */

import { deepEqual } from '../utils/deep-equal';
import { isMockFunction } from '../mock/mock';

// ─── Assertion Error ──────────────────────────────────────────────────────────

export class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssertionError';
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`;
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'symbol') return value.toString();
  if (value === undefined) return 'undefined';
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** Parse "a.b[0].c" (or an array path) into keys. */
function parsePath(path: string | ReadonlyArray<string | number>): Array<string | number> {
  if (Array.isArray(path)) return [...path];
  const keys: Array<string | number> = [];
  (path as string).replace(/[^.[\]]+|\[(\d+)\]/g, (match, index) => {
    keys.push(index !== undefined ? Number(index) : match);
    return match;
  });
  return keys;
}

/** Recursive subset match used by toMatchObject. */
function matchesObject(actual: unknown, expected: unknown): boolean {
  if (expected === null || typeof expected !== 'object') {
    return deepEqual(actual, expected);
  }
  if (
    expected instanceof Date ||
    expected instanceof RegExp ||
    expected instanceof Map ||
    expected instanceof Set
  ) {
    return deepEqual(actual, expected);
  }
  if (actual === null || typeof actual !== 'object') return false;

  if (Array.isArray(expected)) {
    if (!Array.isArray(actual) || actual.length !== expected.length) return false;
    return expected.every((item, i) => matchesObject(actual[i], item));
  }

  return Object.keys(expected as object).every(key =>
    Object.prototype.hasOwnProperty.call(actual, key) || key in (actual as object)
      ? matchesObject((actual as any)[key], (expected as any)[key])
      : false
  );
}

type ThrowExpectation = string | RegExp | Function | Error | undefined;

/** Does `error` satisfy a toThrow() expectation? */
function matchesThrown(error: unknown, expected: ThrowExpectation): boolean {
  if (expected === undefined) return true;
  const message = error instanceof Error ? error.message : String(error);
  if (typeof expected === 'string') return message.includes(expected);
  if (expected instanceof RegExp) return expected.test(message);
  if (expected instanceof Error) return message === expected.message;
  if (typeof expected === 'function') return error instanceof (expected as any);
  return false;
}

function describeThrowExpectation(expected: ThrowExpectation): string {
  if (expected === undefined) return '';
  if (typeof expected === 'string') return ` with message: '${expected}'`;
  if (expected instanceof RegExp) return ` with message matching ${expected}`;
  if (expected instanceof Error) return ` with message: '${expected.message}'`;
  return ` an instance of ${(expected as Function).name || 'the given class'}`;
}

// ─── Assertions ───────────────────────────────────────────────────────────────

class Assertions {
  private negated: boolean = false;
  private value: unknown;

  constructor(value: unknown) {
    this.value = value;
  }

  /**
   * Negate the next assertion.
   * expect(x).not.toBe(y)
   */
  get not(): this {
    this.negated = !this.negated;
    return this;
  }

  /**
   * Assert that promises reject.
   * await expect(promise).rejects.toThrow()
   * await expect(promise).rejects.toBeInstanceOf(NotFoundError)
   */
  get rejects(): AsyncAssertions {
    return createAsyncAssertions(this.value, 'rejects', this.negated);
  }

  /**
   * Assert on the resolved value of a promise.
   * await expect(promise).resolves.toEqual({ ok: true })
   */
  get resolves(): AsyncAssertions {
    return createAsyncAssertions(this.value, 'resolves', this.negated);
  }

  /**
   * Check that two values are strictly equal (===).
   */
  toBe(expected: unknown): void {
    const result = this.value === expected;
    this.assert(
      result,
      `Expected ${fmt(this.value)} to${this.negated ? ' not' : ''} be ${fmt(expected)}`
    );
  }

  /**
   * Deep equality check (recursively compares objects and arrays).
   */
  toEqual(expected: unknown): void {
    const result = deepEqual(this.value, expected);
    this.assert(
      result,
      `Expected ${fmt(this.value)} to${this.negated ? ' not' : ''} deep equal ${fmt(expected)}`
    );
  }

  /**
   * Check that an object contains (recursively) the given subset of properties.
   */
  toMatchObject(expected: object | object[]): void {
    this.assert(
      matchesObject(this.value, expected),
      `Expected ${fmt(this.value)} to${this.negated ? ' not' : ''} match object ${fmt(expected)}`
    );
  }

  /**
   * Check that value is truthy.
   */
  toBeTruthy(): void {
    this.assert(!!this.value, `Expected ${fmt(this.value)} to${this.negated ? ' not' : ''} be truthy`);
  }

  /**
   * Check that value is falsy.
   */
  toBeFalsy(): void {
    this.assert(!this.value, `Expected ${fmt(this.value)} to${this.negated ? ' not' : ''} be falsy`);
  }

  /**
   * Check that value is null.
   */
  toBeNull(): void {
    this.assert(this.value === null, `Expected ${fmt(this.value)} to${this.negated ? ' not' : ''} be null`);
  }

  /**
   * Check that value is undefined.
   */
  toBeUndefined(): void {
    this.assert(this.value === undefined, `Expected ${fmt(this.value)} to${this.negated ? ' not' : ''} be undefined`);
  }

  /**
   * Check that value is defined (not undefined).
   */
  toBeDefined(): void {
    this.assert(this.value !== undefined, `Expected value to${this.negated ? ' not' : ''} be defined`);
  }

  /**
   * Check that value is NaN.
   */
  toBeNaN(): void {
    this.assert(Number.isNaN(this.value), `Expected ${fmt(this.value)} to${this.negated ? ' not' : ''} be NaN`);
  }

  /**
   * Check that value is an instance of a class.
   */
  toBeInstanceOf(cls: Function): void {
    const result = this.value instanceof (cls as any);
    const actual = this.value === null || this.value === undefined
      ? String(this.value)
      : (this.value as object).constructor?.name ?? typeof this.value;
    this.assert(
      result,
      `Expected value (${actual}) to${this.negated ? ' not' : ''} be instance of ${cls.name}`
    );
  }

  /**
   * Check array or string length.
   */
  toHaveLength(length: number): void {
    const actual = (this.value as any)?.length;
    this.assert(
      actual === length,
      `Expected length${this.negated ? ' not' : ''} ${length}, got ${actual}`
    );
  }

  /**
   * Check that an array (or other iterable) contains an item (===),
   * or that a string contains a substring.
   */
  toContain(item: unknown): void {
    let result = false;

    if (typeof this.value === 'string') {
      result = this.value.includes(String(item));
    } else if (Array.isArray(this.value)) {
      result = (this.value as unknown[]).includes(item);
    } else if (this.value !== null && typeof (this.value as any)?.[Symbol.iterator] === 'function') {
      result = Array.from(this.value as Iterable<unknown>).includes(item);
    }

    this.assert(
      result,
      `Expected ${fmt(this.value)} to${this.negated ? ' not' : ''} contain ${fmt(item)}`
    );
  }

  /**
   * Check that an array (or iterable) contains an item that deep-equals `item`.
   */
  toContainEqual(item: unknown): void {
    const list = this.value !== null && typeof (this.value as any)?.[Symbol.iterator] === 'function'
      ? Array.from(this.value as Iterable<unknown>)
      : [];
    this.assert(
      list.some(v => deepEqual(v, item)),
      `Expected ${fmt(this.value)} to${this.negated ? ' not' : ''} contain equal ${fmt(item)}`
    );
  }

  /**
   * Check that object has a property. `key` may be a path ("a.b[0].c")
   * or an array of keys; when `value` is given it must deep-equal.
   */
  toHaveProperty(key: string | ReadonlyArray<string | number>, value?: unknown): void {
    const keys = parsePath(key);
    let current: any = this.value;
    let hasKey = keys.length > 0;

    for (const k of keys) {
      if (current === null || current === undefined || !(k in Object(current))) {
        hasKey = false;
        break;
      }
      current = current[k];
    }

    const label = Array.isArray(key) ? key.join('.') : key;

    if (arguments.length > 1) {
      const result = hasKey && deepEqual(current, value);
      this.assert(
        result,
        `Expected object to${this.negated ? ' not' : ''} have property '${label}' with value ${fmt(value)}` +
          (hasKey ? `, got ${fmt(current)}` : '')
      );
    } else {
      this.assert(hasKey, `Expected object to${this.negated ? ' not' : ''} have property '${label}'`);
    }
  }

  /**
   * Check that string matches a pattern.
   */
  toMatch(pattern: string | RegExp): void {
    const str = this.value as string;
    const result =
      typeof str === 'string' &&
      (typeof pattern === 'string' ? str.includes(pattern) : pattern.test(str));

    this.assert(
      result,
      `Expected '${str}' to${this.negated ? ' not' : ''} match ${pattern}`
    );
  }

  /**
   * Numeric comparisons.
   */
  toBeGreaterThan(n: number | bigint): void {
    this.assert((this.value as number) > n, `Expected ${fmt(this.value)} to${this.negated ? ' not' : ''} be > ${n}`);
  }

  toBeLessThan(n: number | bigint): void {
    this.assert((this.value as number) < n, `Expected ${fmt(this.value)} to${this.negated ? ' not' : ''} be < ${n}`);
  }

  toBeGreaterThanOrEqual(n: number | bigint): void {
    this.assert((this.value as number) >= n, `Expected ${fmt(this.value)} to${this.negated ? ' not' : ''} be >= ${n}`);
  }

  toBeLessThanOrEqual(n: number | bigint): void {
    this.assert((this.value as number) <= n, `Expected ${fmt(this.value)} to${this.negated ? ' not' : ''} be <= ${n}`);
  }

  /**
   * Floating point equality: |actual - expected| < 10^-numDigits / 2
   * (numDigits defaults to 2).
   */
  toBeCloseTo(expected: number, numDigits: number = 2): void {
    const actual = this.value as number;
    const pass =
      (actual === Infinity && expected === Infinity) ||
      (actual === -Infinity && expected === -Infinity) ||
      (typeof actual === 'number' && Math.abs(actual - expected) < Math.pow(10, -numDigits) / 2);
    this.assert(
      pass,
      `Expected ${fmt(actual)} to${this.negated ? ' not' : ''} be close to ${expected} (${numDigits} digits)`
    );
  }

  /**
   * Check that a function throws. The optional expectation can be a
   * message substring, a RegExp, an error class or an Error instance.
   */
  toThrow(expected?: ThrowExpectation): void {
    let threw = false;
    let thrown: unknown;

    if (typeof this.value !== 'function') {
      throw new AssertionError('toThrow() expects a function (wrap the call: expect(() => fn()).toThrow())');
    }

    try {
      (this.value as Function)();
    } catch (e) {
      threw = true;
      thrown = e;
    }

    if (expected !== undefined) {
      this.assert(
        threw && matchesThrown(thrown, expected),
        `Expected function to${this.negated ? ' not' : ''} throw${describeThrowExpectation(expected)}` +
          (threw ? ` (threw ${fmt(thrown)})` : '')
      );
    } else {
      this.assert(threw, `Expected function to${this.negated ? ' not' : ''} throw`);
    }
  }

  // ── Mock matchers ──────────────────────────────────────────────────────────

  private mockCalls(matcher: string): unknown[][] {
    if (!isMockFunction(this.value)) {
      throw new AssertionError(`${matcher}() expects a mock function created with fn() or spyOn()`);
    }
    return this.value.mock.calls as unknown[][];
  }

  /**
   * Check that a mock function was called at least once.
   */
  toHaveBeenCalled(): void {
    const calls = this.mockCalls('toHaveBeenCalled');
    this.assert(
      calls.length > 0,
      `Expected mock function to${this.negated ? ' not' : ''} have been called` +
        (this.negated ? `, but it was called ${calls.length} time(s)` : '')
    );
  }

  /**
   * Check the exact number of calls.
   */
  toHaveBeenCalledTimes(times: number): void {
    const calls = this.mockCalls('toHaveBeenCalledTimes');
    this.assert(
      calls.length === times,
      `Expected mock function to${this.negated ? ' not' : ''} have been called ${times} time(s), got ${calls.length}`
    );
  }

  /**
   * Check that at least one call received exactly these arguments (deep equal).
   */
  toHaveBeenCalledWith(...args: unknown[]): void {
    const calls = this.mockCalls('toHaveBeenCalledWith');
    this.assert(
      calls.some(call => deepEqual(call, args)),
      `Expected mock function to${this.negated ? ' not' : ''} have been called with ${fmt(args)}` +
        `, calls were ${fmt(calls)}`
    );
  }

  /**
   * Check the arguments of the most recent call (deep equal).
   */
  toHaveBeenLastCalledWith(...args: unknown[]): void {
    const calls = this.mockCalls('toHaveBeenLastCalledWith');
    const last = calls[calls.length - 1];
    this.assert(
      last !== undefined && deepEqual(last, args),
      `Expected last call to${this.negated ? ' not' : ''} have been with ${fmt(args)}, got ${fmt(last)}`
    );
  }

  /**
   * Internal assertion helper with negation support.
   */
  private assert(condition: boolean, message: string): void {
    const finalCondition = this.negated ? !condition : condition;
    if (!finalCondition) {
      throw new AssertionError(message);
    }
  }
}

// ─── Promise Assertions (resolves / rejects) ──────────────────────────────────

type MatcherName = Exclude<keyof Assertions, 'not' | 'rejects' | 'resolves'>;

/**
 * Every matcher of expect(), but async: `await expect(p).resolves.toBe(1)`.
 */
export type AsyncAssertions = {
  [K in MatcherName]: (...args: Parameters<Assertions[K]>) => Promise<void>;
} & {
  readonly not: AsyncAssertions;
};

function createAsyncAssertions(
  subject: unknown,
  mode: 'resolves' | 'rejects',
  negated: boolean
): AsyncAssertions {
  return new Proxy({} as AsyncAssertions, {
    get(_target, prop) {
      if (prop === 'not') return createAsyncAssertions(subject, mode, !negated);
      // Not thenable itself, so `await expect(p).resolves` doesn't hang
      if (prop === 'then' || typeof prop === 'symbol') return undefined;

      return async (...args: unknown[]): Promise<void> => {
        const promise = typeof subject === 'function' ? (subject as Function)() : subject;
        let value: unknown;

        if (mode === 'resolves') {
          try {
            value = await promise;
          } catch (error) {
            throw new AssertionError(`Expected promise to resolve but it rejected with ${fmt(error)}`);
          }
        } else {
          let rejected = false;
          try {
            await promise;
          } catch (error) {
            rejected = true;
            value = error;
          }
          if (!rejected) {
            throw new AssertionError('Expected promise to reject but it resolved');
          }

          // rejects.toThrow(expectation) checks the rejection reason directly
          if (prop === 'toThrow') {
            const expected = args[0] as ThrowExpectation;
            const ok = matchesThrown(value, expected);
            if (negated ? ok : !ok) {
              const errorMessage = value instanceof Error ? value.message : String(value);
              throw new AssertionError(
                typeof expected === 'string' && !negated
                  ? `Expected rejection message to include '${expected}', got '${errorMessage}'`
                  : `Expected rejection to${negated ? ' not' : ''} be${describeThrowExpectation(expected)} (got ${fmt(value)})`
              );
            }
            return;
          }
        }

        const assertions = new Assertions(value);
        const target = negated ? assertions.not : assertions;
        const matcher = (target as any)[prop];
        if (typeof matcher !== 'function') {
          throw new TypeError(`Unknown matcher: ${String(prop)}`);
        }
        matcher.apply(target, args);
      };
    }
  });
}

// ─── Entry Point ──────────────────────────────────────────────────────────────

/**
 * Create assertions for a value.
 *
 * Usage:
 *   expect(42).toBe(42)
 *   expect('hello').toMatch('ell')
 *   expect([1,2,3]).toHaveLength(3)
 */
export function expect(value: unknown): Assertions {
  return new Assertions(value);
}
