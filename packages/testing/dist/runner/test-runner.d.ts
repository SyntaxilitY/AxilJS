/**
 * REstJS Test Runner.
 * Minimal, fast test runner with built-in assertions.
 * Zero dependencies - pure Node.js.
 *
 * Usage:
 *   import { describe, it, expect } from '@restjs/testing'
 *
 *   describe('UserService', () => {
 *     it('should create a user', async () => {
 *       const user = await userService.create({ name: 'Tariq' })
 *       expect(user.name).toBe('Tariq')
 *     })
 *   })
 */
/**
 * Define a test suite.
 *
 * Usage:
 *   describe('UserService', () => {
 *     it('should work', () => { ... })
 *   })
 */
export declare function describe(name: string, fn: () => void): void;
/**
 * Register a test case.
 */
export declare function it(name: string, fn: () => void | Promise<void>): void;
export declare const test: typeof it;
/**
 * Skip a test.
 */
export declare function xit(name: string, _fn: () => void | Promise<void>): void;
/**
 * Run only this test (and other 'only' tests).
 */
export declare function fit(name: string, fn: () => void | Promise<void>): void;
/**
 * Setup hooks.
 */
export declare function beforeAll(fn: () => void | Promise<void>): void;
export declare function afterAll(fn: () => void | Promise<void>): void;
export declare function beforeEach(fn: () => void | Promise<void>): void;
export declare function afterEach(fn: () => void | Promise<void>): void;
/**
 * Run all registered test suites.
 * Called at the end of the test file or by the CLI.
 */
export declare function runTests(): Promise<boolean>;
//# sourceMappingURL=test-runner.d.ts.map