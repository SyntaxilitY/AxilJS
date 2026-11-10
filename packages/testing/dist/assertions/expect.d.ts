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
export declare class AssertionError extends Error {
    constructor(message: string);
}
type ThrowExpectation = string | RegExp | Function | Error | undefined;
declare class Assertions {
    private negated;
    private value;
    constructor(value: unknown);
    /**
     * Negate the next assertion.
     * expect(x).not.toBe(y)
     */
    get not(): this;
    /**
     * Assert that promises reject.
     * await expect(promise).rejects.toThrow()
     * await expect(promise).rejects.toBeInstanceOf(NotFoundError)
     */
    get rejects(): AsyncAssertions;
    /**
     * Assert on the resolved value of a promise.
     * await expect(promise).resolves.toEqual({ ok: true })
     */
    get resolves(): AsyncAssertions;
    /**
     * Check that two values are strictly equal (===).
     */
    toBe(expected: unknown): void;
    /**
     * Deep equality check (recursively compares objects and arrays).
     */
    toEqual(expected: unknown): void;
    /**
     * Check that an object contains (recursively) the given subset of properties.
     */
    toMatchObject(expected: object | object[]): void;
    /**
     * Check that value is truthy.
     */
    toBeTruthy(): void;
    /**
     * Check that value is falsy.
     */
    toBeFalsy(): void;
    /**
     * Check that value is null.
     */
    toBeNull(): void;
    /**
     * Check that value is undefined.
     */
    toBeUndefined(): void;
    /**
     * Check that value is defined (not undefined).
     */
    toBeDefined(): void;
    /**
     * Check that value is NaN.
     */
    toBeNaN(): void;
    /**
     * Check that value is an instance of a class.
     */
    toBeInstanceOf(cls: Function): void;
    /**
     * Check array or string length.
     */
    toHaveLength(length: number): void;
    /**
     * Check that an array (or other iterable) contains an item (===),
     * or that a string contains a substring.
     */
    toContain(item: unknown): void;
    /**
     * Check that an array (or iterable) contains an item that deep-equals `item`.
     */
    toContainEqual(item: unknown): void;
    /**
     * Check that object has a property. `key` may be a path ("a.b[0].c")
     * or an array of keys; when `value` is given it must deep-equal.
     */
    toHaveProperty(key: string | ReadonlyArray<string | number>, value?: unknown): void;
    /**
     * Check that string matches a pattern.
     */
    toMatch(pattern: string | RegExp): void;
    /**
     * Numeric comparisons.
     */
    toBeGreaterThan(n: number | bigint): void;
    toBeLessThan(n: number | bigint): void;
    toBeGreaterThanOrEqual(n: number | bigint): void;
    toBeLessThanOrEqual(n: number | bigint): void;
    /**
     * Floating point equality: |actual - expected| < 10^-numDigits / 2
     * (numDigits defaults to 2).
     */
    toBeCloseTo(expected: number, numDigits?: number): void;
    /**
     * Check that a function throws. The optional expectation can be a
     * message substring, a RegExp, an error class or an Error instance.
     */
    toThrow(expected?: ThrowExpectation): void;
    private mockCalls;
    /**
     * Check that a mock function was called at least once.
     */
    toHaveBeenCalled(): void;
    /**
     * Check the exact number of calls.
     */
    toHaveBeenCalledTimes(times: number): void;
    /**
     * Check that at least one call received exactly these arguments (deep equal).
     */
    toHaveBeenCalledWith(...args: unknown[]): void;
    /**
     * Check the arguments of the most recent call (deep equal).
     */
    toHaveBeenLastCalledWith(...args: unknown[]): void;
    /**
     * Internal assertion helper with negation support.
     */
    private assert;
}
type MatcherName = Exclude<keyof Assertions, 'not' | 'rejects' | 'resolves'>;
/**
 * Every matcher of expect(), but async: `await expect(p).resolves.toBe(1)`.
 */
export type AsyncAssertions = {
    [K in MatcherName]: (...args: Parameters<Assertions[K]>) => Promise<void>;
} & {
    readonly not: AsyncAssertions;
};
/**
 * Create assertions for a value.
 *
 * Usage:
 *   expect(42).toBe(42)
 *   expect('hello').toMatch('ell')
 *   expect([1,2,3]).toHaveLength(3)
 */
export declare function expect(value: unknown): Assertions;
export {};
//# sourceMappingURL=expect.d.ts.map