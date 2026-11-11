/**
 * AxilJS Test Runner.
 * Minimal, fast test runner with built-in assertions.
 * Zero dependencies - pure Node.js.
 *
 * Usage:
 *   import { describe, it, expect } from '@axiljs/testing'
 *
 *   describe('UserService', () => {
 *     it('should create a user', async () => {
 *       const user = await userService.create({ name: 'Tariq' })
 *       expect(user.name).toBe('Tariq')
 *     })
 *   })
 *
 * Features:
 *   - nested describe() blocks; test names are prefixed with every parent
 *     ("Users > create > rejects duplicates")
 *   - hooks are inherited: parent beforeEach runs before the child's,
 *     child afterEach runs before the parent's; several hooks of the same
 *     type run in registration order
 *   - it.skip / it.only / describe.skip / describe.only (+ xit/fit,
 *     xdescribe/fdescribe)
 *   - hooks outside any describe() apply to every test in that file
 *     (outermost: they run before / after the describe-level hooks)
 *   - per-test timeout: it(name, fn, timeoutMs) (default 5000 ms)
 *   - it.each(table)(name, fn) / describe.each(table)(name, fn)
 */
type HookFn = () => void | Promise<void>;
type TestFn = () => void | Promise<void>;
export interface TestResult {
    suite: string;
    test: string;
    fullName: string;
    passed: boolean;
    skipped: boolean;
    error?: Error;
    durationMs: number;
}
export interface RunOptions {
    timeout?: number;
    silent?: boolean;
}
export interface RunSummary {
    success: boolean;
    passed: number;
    failed: number;
    skipped: number;
    durationMs: number;
    results: TestResult[];
}
export declare const DEFAULT_TIMEOUT = 5000;
/**
 * Clear every registered suite, test and hook.
 * runTests() does this automatically after a run.
 */
export declare function resetTests(): void;
type EachTable = ReadonlyArray<unknown>;
export interface TestFunction {
    (name: string, fn: TestFn, timeout?: number): void;
    /** Register a skipped test. */
    skip(name: string, fn?: TestFn, timeout?: number): void;
    /** Run only this test (and other `only` tests/suites). */
    only(name: string, fn: TestFn, timeout?: number): void;
    /**
     * Parameterised tests:
     *   it.each([[1, 1, 2], [2, 2, 4]])('%i + %i = %i', (a, b, sum) => ...)
     *   it.each([{ a: 1 }])('a is $a', ({ a }) => ...)
     */
    each(table: EachTable): (name: string, fn: (...args: any[]) => void | Promise<void>, timeout?: number) => void;
}
export interface DescribeFunction {
    (name: string, fn: () => void): void;
    skip(name: string, fn: () => void): void;
    only(name: string, fn: () => void): void;
    each(table: EachTable): (name: string, fn: (...args: any[]) => void) => void;
}
/**
 * Define a test suite. Suites can be nested.
 *
 * Usage:
 *   describe('UserService', () => {
 *     it('should work', () => { ... })
 *   })
 */
export declare const describe: DescribeFunction;
/**
 * Register a test case.
 * The optional third argument is a timeout in ms (default 5000).
 */
export declare const it: TestFunction;
export declare const test: TestFunction;
/**
 * Skip a test.
 */
export declare function xit(name: string, _fn: () => void | Promise<void>): void;
/**
 * Run only this test (and other 'only' tests).
 */
export declare function fit(name: string, fn: () => void | Promise<void>, timeout?: number): void;
/** Skip a whole suite. */
export declare function xdescribe(name: string, fn: () => void): void;
/** Run only this suite (and other 'only' tests/suites). */
export declare function fdescribe(name: string, fn: () => void): void;
/**
 * Setup hooks. Several hooks of the same type may be registered per suite;
 * they run in registration order. Hooks outside any describe() apply to every
 * test in the file that registered them, outside the describe-level hooks.
 */
export declare function beforeAll(fn: HookFn): void;
export declare function afterAll(fn: HookFn): void;
export declare function beforeEach(fn: HookFn): void;
export declare function afterEach(fn: HookFn): void;
/**
 * Run all registered test suites and return a detailed summary.
 * The registry is cleared afterwards.
 */
export declare function runTestsWithResults(options?: RunOptions): Promise<RunSummary>;
/**
 * Run all registered test suites.
 * Called at the end of the test file or by the CLI.
 * Resolves to true when no test failed.
 */
export declare function runTests(options?: RunOptions): Promise<boolean>;
export {};
//# sourceMappingURL=test-runner.d.ts.map