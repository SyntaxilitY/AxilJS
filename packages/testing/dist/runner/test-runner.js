"use strict";
/**
 * @axilJS Test Runner.
 * Minimal, fast test runner with built-in assertions.
 * Zero dependencies - pure Node.js.
 *
 * Usage:
 *   import { describe, it, expect } from '@axil/testing'
 *
 *   describe('UserService', () => {
 *     it('should create a user', async () => {
 *       const user = await userService.create({ name: 'Tariq' })
 *       expect(user.name).toBe('Tariq')
 *     })
 *   })
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.test = void 0;
exports.describe = describe;
exports.it = it;
exports.xit = xit;
exports.fit = fit;
exports.beforeAll = beforeAll;
exports.afterAll = afterAll;
exports.beforeEach = beforeEach;
exports.afterEach = afterEach;
exports.runTests = runTests;
// ─── Global Test Registry ─────────────────────────────────────────────────────
// All registered test suites
let suites = [];
// Currently active suite (set by describe())
let currentSuite = null;
// ─── Test Registration Functions ──────────────────────────────────────────────
/**
 * Define a test suite.
 *
 * Usage:
 *   describe('UserService', () => {
 *     it('should work', () => { ... })
 *   })
 */
function describe(name, fn) {
    const suite = { name, tests: [] };
    suites.push(suite);
    const previousSuite = currentSuite;
    currentSuite = suite;
    // Execute the describe block to register tests
    fn();
    currentSuite = previousSuite;
}
/**
 * Register a test case.
 */
function it(name, fn) {
    if (!currentSuite) {
        throw new Error(`'it' must be called inside a 'describe' block`);
    }
    currentSuite.tests.push({ name, fn, skip: false, only: false });
}
// Alias: test() = it()
exports.test = it;
/**
 * Skip a test.
 */
function xit(name, _fn) {
    if (!currentSuite)
        return;
    currentSuite.tests.push({ name, fn: async () => { }, skip: true, only: false });
}
/**
 * Run only this test (and other 'only' tests).
 */
function fit(name, fn) {
    if (!currentSuite)
        return;
    currentSuite.tests.push({ name, fn, skip: false, only: true });
}
/**
 * Setup hooks.
 */
function beforeAll(fn) {
    if (currentSuite)
        currentSuite.beforeAllFn = fn;
}
function afterAll(fn) {
    if (currentSuite)
        currentSuite.afterAllFn = fn;
}
function beforeEach(fn) {
    if (currentSuite)
        currentSuite.beforeEachFn = fn;
}
function afterEach(fn) {
    if (currentSuite)
        currentSuite.afterEachFn = fn;
}
// ─── Test Runner ──────────────────────────────────────────────────────────────
/**
 * Run all registered test suites.
 * Called at the end of the test file or by the CLI.
 */
async function runTests() {
    const results = [];
    let totalPassed = 0;
    let totalFailed = 0;
    let totalSkipped = 0;
    const startTime = Date.now();
    // Check if any tests use 'only' mode
    const hasOnly = suites.some(s => s.tests.some(t => t.only));
    console.log('\n\x1b[36m[@axilJS Test]\x1b[0m Running tests...\n');
    for (const suite of suites) {
        console.log(`\x1b[1m${suite.name}\x1b[0m`);
        // Run beforeAll
        if (suite.beforeAllFn) {
            try {
                await suite.beforeAllFn();
            }
            catch (e) {
                console.error(`  \x1b[31m✗ beforeAll failed:\x1b[0m`, e);
                continue;
            }
        }
        for (const testCase of suite.tests) {
            // Skip tests based on skip/only
            if (testCase.skip || (hasOnly && !testCase.only)) {
                console.log(`  \x1b[33m○\x1b[0m ${testCase.name} \x1b[90m(skipped)\x1b[0m`);
                totalSkipped++;
                continue;
            }
            // Run beforeEach
            if (suite.beforeEachFn) {
                try {
                    await suite.beforeEachFn();
                }
                catch { }
            }
            const testStart = Date.now();
            let passed = true;
            let error;
            try {
                await testCase.fn();
            }
            catch (err) {
                passed = false;
                error = err instanceof Error ? err : new Error(String(err));
            }
            const duration = Date.now() - testStart;
            results.push({
                suite: suite.name,
                test: testCase.name,
                passed,
                error,
                durationMs: duration
            });
            if (passed) {
                totalPassed++;
                console.log(`  \x1b[32m✓\x1b[0m ${testCase.name} \x1b[90m(${duration}ms)\x1b[0m`);
            }
            else {
                totalFailed++;
                console.log(`  \x1b[31m✗\x1b[0m ${testCase.name} \x1b[90m(${duration}ms)\x1b[0m`);
                console.log(`    \x1b[31m${error?.message}\x1b[0m`);
                if (error?.stack && process.env.NODE_ENV !== 'production') {
                    const stackLines = error.stack.split('\n').slice(1, 3);
                    stackLines.forEach(line => console.log(`    \x1b[90m${line.trim()}\x1b[0m`));
                }
            }
            // Run afterEach
            if (suite.afterEachFn) {
                try {
                    await suite.afterEachFn();
                }
                catch { }
            }
        }
        // Run afterAll
        if (suite.afterAllFn) {
            try {
                await suite.afterAllFn();
            }
            catch { }
        }
        console.log('');
    }
    // Print summary
    const totalTime = Date.now() - startTime;
    console.log('─'.repeat(50));
    console.log(`\x1b[32m${totalPassed} passed\x1b[0m` +
        (totalFailed > 0 ? `, \x1b[31m${totalFailed} failed\x1b[0m` : '') +
        (totalSkipped > 0 ? `, \x1b[33m${totalSkipped} skipped\x1b[0m` : '') +
        `  \x1b[90m(${totalTime}ms)\x1b[0m`);
    console.log('');
    // Reset for next run
    suites = [];
    currentSuite = null;
    return totalFailed === 0;
}
//# sourceMappingURL=test-runner.js.map