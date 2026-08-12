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
export declare class AssertionError extends Error {
    constructor(message: string);
}
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
     */
    get rejects(): RejectAssertions;
    /**
     * Check that two values are strictly equal (===).
     */
    toBe(expected: unknown): void;
    /**
     * Deep equality check (recursively compares objects and arrays).
     */
    toEqual(expected: unknown): void;
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
     * Check that value is an instance of a class.
     */
    toBeInstanceOf(cls: Function): void;
    /**
     * Check array or string length.
     */
    toHaveLength(length: number): void;
    /**
   * Check that array or string contains an item.
   */
    toContain(item: unknown): void;
    /**
     * Check that object has a property.
     */
    toHaveProperty(key: string, value?: unknown): void;
    /**
     * Check that string matches a pattern.
     */
    toMatch(pattern: string | RegExp): void;
    /**
     * Numeric comparisons.
     */
    toBeGreaterThan(n: number): void;
    toBeLessThan(n: number): void;
    toBeGreaterThanOrEqual(n: number): void;
    toBeLessThanOrEqual(n: number): void;
    /**
     * Check that a function throws.
     */
    toThrow(message?: string): void;
    /**
     * Internal assertion helper with negation support.
     */
    private assert;
}
declare class RejectAssertions {
    private promise;
    constructor(promise: unknown);
    toThrow(message?: string): Promise<void>;
}
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