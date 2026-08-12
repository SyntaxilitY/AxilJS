"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssertionError = void 0;
exports.expect = expect;
const deep_equal_1 = require("../utils/deep-equal");
// ─── Assertion Error ──────────────────────────────────────────────────────────
class AssertionError extends Error {
    constructor(message) {
        super(message);
        this.name = 'AssertionError';
    }
}
exports.AssertionError = AssertionError;
// ─── Assertions ───────────────────────────────────────────────────────────────
class Assertions {
    negated = false;
    value;
    constructor(value) {
        this.value = value;
    }
    /**
     * Negate the next assertion.
     * expect(x).not.toBe(y)
     */
    get not() {
        this.negated = !this.negated;
        return this;
    }
    /**
     * Assert that promises reject.
     * await expect(promise).rejects.toThrow()
     */
    get rejects() {
        return new RejectAssertions(this.value);
    }
    /**
     * Check that two values are strictly equal (===).
     */
    toBe(expected) {
        const result = this.value === expected;
        this.assert(result, `Expected ${JSON.stringify(this.value)} to${this.negated ? ' not' : ''} be ${JSON.stringify(expected)}`);
    }
    /**
     * Deep equality check (recursively compares objects and arrays).
     */
    toEqual(expected) {
        const result = (0, deep_equal_1.deepEqual)(this.value, expected);
        this.assert(result, `Expected ${JSON.stringify(this.value)} to${this.negated ? ' not' : ''} deep equal ${JSON.stringify(expected)}`);
    }
    /**
     * Check that value is truthy.
     */
    toBeTruthy() {
        this.assert(!!this.value, `Expected ${this.value} to be truthy`);
    }
    /**
     * Check that value is falsy.
     */
    toBeFalsy() {
        this.assert(!this.value, `Expected ${this.value} to be falsy`);
    }
    /**
     * Check that value is null.
     */
    toBeNull() {
        this.assert(this.value === null, `Expected value to be null, got ${this.value}`);
    }
    /**
     * Check that value is undefined.
     */
    toBeUndefined() {
        this.assert(this.value === undefined, `Expected value to be undefined`);
    }
    /**
     * Check that value is defined (not undefined).
     */
    toBeDefined() {
        this.assert(this.value !== undefined, `Expected value to be defined`);
    }
    /**
     * Check that value is an instance of a class.
     */
    toBeInstanceOf(cls) {
        const result = this.value instanceof cls;
        this.assert(result, `Expected value to be instance of ${cls.name}`);
    }
    /**
     * Check array or string length.
     */
    toHaveLength(length) {
        const actual = this.value?.length;
        this.assert(actual === length, `Expected length ${length}, got ${actual}`);
    }
    /**
   * Check that array or string contains an item.
   */
    toContain(item) {
        // Separate handling for arrays and strings to satisfy TypeScript
        let result = false;
        if (Array.isArray(this.value)) {
            // Array check
            result = this.value.includes(item);
        }
        else if (typeof this.value === 'string') {
            // String check
            result = this.value.includes(String(item));
        }
        this.assert(result, `Expected ${JSON.stringify(this.value)} to contain ${JSON.stringify(item)}`);
    }
    /**
     * Check that object has a property.
     */
    toHaveProperty(key, value) {
        const obj = this.value;
        const hasKey = key in obj;
        if (value !== undefined) {
            const result = hasKey && (0, deep_equal_1.deepEqual)(obj[key], value);
            this.assert(result, `Expected object to have property '${key}' with value ${JSON.stringify(value)}`);
        }
        else {
            this.assert(hasKey, `Expected object to have property '${key}'`);
        }
    }
    /**
     * Check that string matches a pattern.
     */
    toMatch(pattern) {
        const str = this.value;
        const result = typeof pattern === 'string'
            ? str.includes(pattern)
            : pattern.test(str);
        this.assert(result, `Expected '${str}' to match ${pattern}`);
    }
    /**
     * Numeric comparisons.
     */
    toBeGreaterThan(n) {
        this.assert(this.value > n, `Expected ${this.value} > ${n}`);
    }
    toBeLessThan(n) {
        this.assert(this.value < n, `Expected ${this.value} < ${n}`);
    }
    toBeGreaterThanOrEqual(n) {
        this.assert(this.value >= n, `Expected ${this.value} >= ${n}`);
    }
    toBeLessThanOrEqual(n) {
        this.assert(this.value <= n, `Expected ${this.value} <= ${n}`);
    }
    /**
     * Check that a function throws.
     */
    toThrow(message) {
        let threw = false;
        let thrownMessage = '';
        try {
            this.value();
        }
        catch (e) {
            threw = true;
            thrownMessage = e.message;
        }
        if (message) {
            this.assert(threw && thrownMessage.includes(message), `Expected function to throw with message: '${message}'`);
        }
        else {
            this.assert(threw, 'Expected function to throw');
        }
    }
    /**
     * Internal assertion helper with negation support.
     */
    assert(condition, message) {
        const finalCondition = this.negated ? !condition : condition;
        if (!finalCondition) {
            throw new AssertionError(message);
        }
    }
}
// ─── Promise Rejection Assertions ─────────────────────────────────────────────
class RejectAssertions {
    promise;
    constructor(promise) {
        this.promise = promise;
    }
    async toThrow(message) {
        try {
            await this.promise;
            throw new AssertionError('Expected promise to reject but it resolved');
        }
        catch (error) {
            if (error instanceof AssertionError)
                throw error;
            if (message) {
                const errorMessage = error.message;
                if (!errorMessage.includes(message)) {
                    throw new AssertionError(`Expected rejection message to include '${message}', got '${errorMessage}'`);
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
function expect(value) {
    return new Assertions(value);
}
//# sourceMappingURL=expect.js.map