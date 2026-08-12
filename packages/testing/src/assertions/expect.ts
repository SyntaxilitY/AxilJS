/**
 * Assertion library.
 * Chainable expect() API similar to Jest.
 *
 * Usage:
 *   expect(value).toBe(expected)
 *   expect(array).toHaveLength(3)
 *   expect(fn).toThrow()
 *   expect(promise).rejects.toThrow()
 */

import { deepEqual } from '../utils/deep-equal';

// ─── Assertion Error ──────────────────────────────────────────────────────────

export class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssertionError';
  }
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
   */
  get rejects(): RejectAssertions {
    return new RejectAssertions(this.value);
  }

  /**
   * Check that two values are strictly equal (===).
   */
  toBe(expected: unknown): void {
    const result = this.value === expected;
    this.assert(
      result,
      `Expected ${JSON.stringify(this.value)} to${this.negated ? ' not' : ''} be ${JSON.stringify(expected)}`
    );
  }

  /**
   * Deep equality check (recursively compares objects and arrays).
   */
  toEqual(expected: unknown): void {
    const result = deepEqual(this.value, expected);
    this.assert(
      result,
      `Expected ${JSON.stringify(this.value)} to${this.negated ? ' not' : ''} deep equal ${JSON.stringify(expected)}`
    );
  }

  /**
   * Check that value is truthy.
   */
  toBeTruthy(): void {
    this.assert(!!this.value, `Expected ${this.value} to be truthy`);
  }

  /**
   * Check that value is falsy.
   */
  toBeFalsy(): void {
    this.assert(!this.value, `Expected ${this.value} to be falsy`);
  }

  /**
   * Check that value is null.
   */
  toBeNull(): void {
    this.assert(this.value === null, `Expected value to be null, got ${this.value}`);
  }

  /**
   * Check that value is undefined.
   */
  toBeUndefined(): void {
    this.assert(this.value === undefined, `Expected value to be undefined`);
  }

  /**
   * Check that value is defined (not undefined).
   */
  toBeDefined(): void {
    this.assert(this.value !== undefined, `Expected value to be defined`);
  }

  /**
   * Check that value is an instance of a class.
   */
  toBeInstanceOf(cls: Function): void {
    const result = this.value instanceof cls;
    this.assert(
      result,
      `Expected value to be instance of ${cls.name}`
    );
  }

  /**
   * Check array or string length.
   */
  toHaveLength(length: number): void {
    const actual = (this.value as any)?.length;
    this.assert(
      actual === length,
      `Expected length ${length}, got ${actual}`
    );
  }

    /**
   * Check that array or string contains an item.
   */
  toContain(item: unknown): void {
    // Separate handling for arrays and strings to satisfy TypeScript
    let result = false;

    if (Array.isArray(this.value)) {
      // Array check
      result = (this.value as unknown[]).includes(item);
    } else if (typeof this.value === 'string') {
      // String check
      result = this.value.includes(String(item));
    }

    this.assert(
      result,
      `Expected ${JSON.stringify(this.value)} to contain ${JSON.stringify(item)}`
    );
  }

  /**
   * Check that object has a property.
   */
  toHaveProperty(key: string, value?: unknown): void {
    const obj = this.value as Record<string, unknown>;
    const hasKey = key in obj;

    if (value !== undefined) {
      const result = hasKey && deepEqual(obj[key], value);
      this.assert(
        result,
        `Expected object to have property '${key}' with value ${JSON.stringify(value)}`
      );
    } else {
      this.assert(hasKey, `Expected object to have property '${key}'`);
    }
  }

  /**
   * Check that string matches a pattern.
   */
  toMatch(pattern: string | RegExp): void {
    const str = this.value as string;
    const result =
      typeof pattern === 'string'
        ? str.includes(pattern)
        : pattern.test(str);

    this.assert(
      result,
      `Expected '${str}' to match ${pattern}`
    );
  }

  /**
   * Numeric comparisons.
   */
  toBeGreaterThan(n: number): void {
    this.assert((this.value as number) > n, `Expected ${this.value} > ${n}`);
  }

  toBeLessThan(n: number): void {
    this.assert((this.value as number) < n, `Expected ${this.value} < ${n}`);
  }

  toBeGreaterThanOrEqual(n: number): void {
    this.assert((this.value as number) >= n, `Expected ${this.value} >= ${n}`);
  }

  toBeLessThanOrEqual(n: number): void {
    this.assert((this.value as number) <= n, `Expected ${this.value} <= ${n}`);
  }

  /**
   * Check that a function throws.
   */
  toThrow(message?: string): void {
    let threw = false;
    let thrownMessage = '';

    try {
      (this.value as Function)();
    } catch (e) {
      threw = true;
      thrownMessage = (e as Error).message;
    }

    if (message) {
      this.assert(
        threw && thrownMessage.includes(message),
        `Expected function to throw with message: '${message}'`
      );
    } else {
      this.assert(threw, 'Expected function to throw');
    }
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

// ─── Promise Rejection Assertions ─────────────────────────────────────────────

class RejectAssertions {
  constructor(private promise: unknown) {}

  async toThrow(message?: string): Promise<void> {
    try {
      await (this.promise as Promise<unknown>);
      throw new AssertionError('Expected promise to reject but it resolved');
    } catch (error) {
      if (error instanceof AssertionError) throw error;

      if (message) {
        const errorMessage = (error as Error).message;
        if (!errorMessage.includes(message)) {
          throw new AssertionError(
            `Expected rejection message to include '${message}', got '${errorMessage}'`
          );
        }
      }
    }
  }
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