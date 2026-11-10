"use strict";
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
 *   - per-test timeout: it(name, fn, timeoutMs) (default 5000 ms)
 *   - it.each(table)(name, fn) / describe.each(table)(name, fn)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.test = exports.it = exports.describe = exports.DEFAULT_TIMEOUT = void 0;
exports.resetTests = resetTests;
exports.xit = xit;
exports.fit = fit;
exports.xdescribe = xdescribe;
exports.fdescribe = fdescribe;
exports.beforeAll = beforeAll;
exports.afterAll = afterAll;
exports.beforeEach = beforeEach;
exports.afterEach = afterEach;
exports.runTestsWithResults = runTestsWithResults;
exports.runTests = runTests;
exports.DEFAULT_TIMEOUT = 5000;
// ─── Global Test Registry ─────────────────────────────────────────────────────
function createSuite(name, parent) {
    return {
        name,
        parent,
        items: [],
        beforeAll: [],
        afterAll: [],
        beforeEach: [],
        afterEach: [],
        skip: false,
        only: false
    };
}
// Invisible root; top-level describe() blocks are its children
let root = createSuite('', null);
// Currently active suite (set by describe())
let currentSuite = null;
/**
 * Clear every registered suite, test and hook.
 * runTests() does this automatically after a run.
 */
function resetTests() {
    root = createSuite('', null);
    currentSuite = null;
}
// ─── Name formatting (it.each) ────────────────────────────────────────────────
function formatValue(v) {
    if (typeof v === 'string')
        return v;
    if (typeof v === 'function')
        return `[Function ${v.name || 'anonymous'}]`;
    if (typeof v === 'bigint')
        return `${v}n`;
    if (typeof v === 'symbol')
        return v.toString();
    if (v === undefined)
        return 'undefined';
    try {
        return JSON.stringify(v) ?? String(v);
    }
    catch {
        return String(v);
    }
}
function formatEachName(template, row, index) {
    const args = Array.isArray(row) ? row : [row];
    let i = 0;
    let name = template.replace(/%([sdifjop#%])/g, (match, flag) => {
        if (flag === '%')
            return '%';
        if (flag === '#')
            return String(index);
        if (i >= args.length)
            return match;
        const value = args[i++];
        switch (flag) {
            case 'd':
            case 'i':
                return String(Math.trunc(Number(value)));
            case 'f':
                return String(Number(value));
            case 's':
                return typeof value === 'string' ? value : formatValue(value);
            default:
                return formatValue(value);
        }
    });
    // $key / $key.path interpolation for object rows
    if (row !== null && typeof row === 'object' && !Array.isArray(row)) {
        name = name.replace(/\$([A-Za-z_][\w.]*)/g, (match, path) => {
            let cur = row;
            for (const part of path.split('.')) {
                if (cur === null || cur === undefined || !(part in Object(cur)))
                    return match;
                cur = cur[part];
            }
            return formatValue(cur);
        });
    }
    return name;
}
// ─── Test Registration Functions ──────────────────────────────────────────────
function registerSuite(name, fn, flags = {}) {
    const parent = currentSuite ?? root;
    const suite = createSuite(name, parent);
    suite.skip = !!flags.skip;
    suite.only = !!flags.only;
    parent.items.push({ kind: 'suite', suite });
    const previousSuite = currentSuite;
    currentSuite = suite;
    try {
        // Execute the describe block to register tests
        fn();
    }
    finally {
        currentSuite = previousSuite;
    }
}
function registerTest(name, fn, timeout, flags, strict) {
    if (!currentSuite) {
        if (strict)
            throw new Error(`'it' must be called inside a 'describe' block`);
        return;
    }
    if (timeout !== undefined && (!Number.isFinite(timeout) || timeout <= 0)) {
        throw new Error(`Invalid timeout for '${name}': ${timeout}`);
    }
    currentSuite.items.push({
        kind: 'test',
        test: { name, fn, skip: !!flags.skip, only: !!flags.only, timeout }
    });
}
function rowArgs(row) {
    return Array.isArray(row) ? row : [row];
}
/**
 * Define a test suite. Suites can be nested.
 *
 * Usage:
 *   describe('UserService', () => {
 *     it('should work', () => { ... })
 *   })
 */
exports.describe = Object.assign(function describe(name, fn) {
    registerSuite(name, fn);
}, {
    skip(name, fn) {
        registerSuite(name, fn, { skip: true });
    },
    only(name, fn) {
        registerSuite(name, fn, { only: true });
    },
    each(table) {
        return (name, fn) => {
            table.forEach((row, index) => {
                registerSuite(formatEachName(name, row, index), () => fn(...rowArgs(row)));
            });
        };
    }
});
/**
 * Register a test case.
 * The optional third argument is a timeout in ms (default 5000).
 */
exports.it = Object.assign(function it(name, fn, timeout) {
    registerTest(name, fn, timeout, {}, true);
}, {
    skip(name, _fn, timeout) {
        registerTest(name, async () => { }, timeout, { skip: true }, true);
    },
    only(name, fn, timeout) {
        registerTest(name, fn, timeout, { only: true }, true);
    },
    each(table) {
        return (name, fn, timeout) => {
            table.forEach((row, index) => {
                registerTest(formatEachName(name, row, index), () => fn(...rowArgs(row)), timeout, {}, true);
            });
        };
    }
});
// Alias: test() = it()
exports.test = exports.it;
/**
 * Skip a test.
 */
function xit(name, _fn) {
    registerTest(name, async () => { }, undefined, { skip: true }, false);
}
/**
 * Run only this test (and other 'only' tests).
 */
function fit(name, fn, timeout) {
    registerTest(name, fn, timeout, { only: true }, false);
}
/** Skip a whole suite. */
function xdescribe(name, fn) {
    registerSuite(name, fn, { skip: true });
}
/** Run only this suite (and other 'only' tests/suites). */
function fdescribe(name, fn) {
    registerSuite(name, fn, { only: true });
}
/**
 * Setup hooks. Several hooks of the same type may be registered per suite;
 * they run in registration order. Hooks outside any describe() are ignored.
 */
function beforeAll(fn) {
    if (currentSuite)
        currentSuite.beforeAll.push(fn);
}
function afterAll(fn) {
    if (currentSuite)
        currentSuite.afterAll.push(fn);
}
function beforeEach(fn) {
    if (currentSuite)
        currentSuite.beforeEach.push(fn);
}
function afterEach(fn) {
    if (currentSuite)
        currentSuite.afterEach.push(fn);
}
// ─── Test Runner ──────────────────────────────────────────────────────────────
function withTimeout(fn, ms, label) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`${label} timed out after ${ms}ms`));
        }, ms);
        Promise.resolve()
            .then(fn)
            .then(() => { clearTimeout(timer); resolve(); }, (err) => { clearTimeout(timer); reject(err); });
    });
}
function toError(err) {
    return err instanceof Error ? err : new Error(String(err));
}
function suitePath(suite) {
    const names = [];
    for (let s = suite; s && s !== root; s = s.parent) {
        names.unshift(s.name);
    }
    return names;
}
function hasOnly(suite) {
    return suite.items.some(item => item.kind === 'test'
        ? item.test.only
        : item.suite.only || hasOnly(item.suite));
}
/**
 * Run all registered test suites and return a detailed summary.
 * The registry is cleared afterwards.
 */
async function runTestsWithResults(options = {}) {
    const defaultTimeout = options.timeout ?? exports.DEFAULT_TIMEOUT;
    const log = options.silent
        ? (..._args) => { }
        : (...args) => console.log(...args);
    const logError = options.silent
        ? (..._args) => { }
        : (...args) => console.error(...args);
    const results = [];
    let totalPassed = 0;
    let totalFailed = 0;
    let totalSkipped = 0;
    const startTime = Date.now();
    const tree = root;
    // Check if any tests or suites use 'only' mode
    const onlyMode = hasOnly(tree);
    /** Would this test run (not skipped, passes the only filter)? */
    const isRunnable = (test, inSkipped, inOnly) => !inSkipped && !test.skip && (!onlyMode || inOnly || test.only);
    const countRunnable = (suite, inSkipped, inOnly) => {
        const skipped = inSkipped || suite.skip;
        const only = inOnly || suite.only;
        let n = 0;
        for (const item of suite.items) {
            if (item.kind === 'test') {
                if (isRunnable(item.test, skipped, only))
                    n++;
            }
            else {
                n += countRunnable(item.suite, skipped, only);
            }
        }
        return n;
    };
    const record = (suite, test, passed, skipped, durationMs, error) => {
        const path = suitePath(suite);
        results.push({
            suite: path.join(' > '),
            test: test.name,
            fullName: [...path, test.name].join(' > '),
            passed,
            skipped,
            error,
            durationMs
        });
    };
    const markAllFailed = (suite, inSkipped, inOnly, error) => {
        const skipped = inSkipped || suite.skip;
        const only = inOnly || suite.only;
        let n = 0;
        for (const item of suite.items) {
            if (item.kind === 'test') {
                if (isRunnable(item.test, skipped, only)) {
                    record(suite, item.test, false, false, 0, error);
                    n++;
                }
            }
            else {
                n += markAllFailed(item.suite, skipped, only, error);
            }
        }
        return n;
    };
    const runSuite = async (suite, depth, inSkipped, inOnly, eachChain) => {
        const skipped = inSkipped || suite.skip;
        const only = inOnly || suite.only;
        const indent = '  '.repeat(depth);
        const isRoot = suite === tree;
        if (!isRoot)
            log(`${indent}\x1b[1m${suite.name}\x1b[0m`);
        const runnable = countRunnable(suite, inSkipped, inOnly);
        // Parent beforeEach hooks run before this suite's; afterEach the reverse
        const chain = {
            before: [...eachChain.before, ...suite.beforeEach],
            after: [...suite.afterEach, ...eachChain.after]
        };
        // Run beforeAll (only when something in this subtree will run)
        if (runnable > 0) {
            try {
                for (const hook of suite.beforeAll) {
                    await withTimeout(hook, defaultTimeout, 'beforeAll hook');
                }
            }
            catch (e) {
                const error = toError(e);
                logError(`${indent}  \x1b[31m✗ beforeAll failed:\x1b[0m ${error.message}`);
                // The suite's tests never ran — that must fail the run, not pass it
                const failed = markAllFailed(suite, inSkipped, inOnly, error);
                totalFailed += Math.max(1, failed);
                for (const hook of suite.afterAll) {
                    try {
                        await withTimeout(hook, defaultTimeout, 'afterAll hook');
                    }
                    catch { }
                }
                return;
            }
        }
        for (const item of suite.items) {
            if (item.kind === 'suite') {
                await runSuite(item.suite, isRoot ? depth : depth + 1, skipped, only, chain);
                continue;
            }
            const testCase = item.test;
            const testIndent = isRoot ? indent : `${indent}  `;
            // Skip tests based on skip/only
            if (!isRunnable(testCase, skipped, only)) {
                log(`${testIndent}\x1b[33m○\x1b[0m ${testCase.name} \x1b[90m(skipped)\x1b[0m`);
                totalSkipped++;
                record(suite, testCase, false, true, 0);
                continue;
            }
            const timeout = testCase.timeout ?? defaultTimeout;
            const testStart = Date.now();
            let passed = true;
            let error;
            try {
                // beforeEach failure fails this test instead of being swallowed
                for (const hook of chain.before) {
                    await withTimeout(hook, timeout, 'beforeEach hook');
                }
                await withTimeout(testCase.fn, timeout, `Test "${testCase.name}"`);
            }
            catch (err) {
                passed = false;
                error = toError(err);
            }
            // Run afterEach (innermost first); a failure fails the test
            for (const hook of chain.after) {
                try {
                    await withTimeout(hook, timeout, 'afterEach hook');
                }
                catch (err) {
                    if (passed) {
                        passed = false;
                        error = toError(err);
                    }
                }
            }
            const duration = Date.now() - testStart;
            record(suite, testCase, passed, false, duration, error);
            if (passed) {
                totalPassed++;
                log(`${testIndent}\x1b[32m✓\x1b[0m ${testCase.name} \x1b[90m(${duration}ms)\x1b[0m`);
            }
            else {
                totalFailed++;
                log(`${testIndent}\x1b[31m✗\x1b[0m ${testCase.name} \x1b[90m(${duration}ms)\x1b[0m`);
                log(`${testIndent}  \x1b[31m${error?.message}\x1b[0m`);
                if (error?.stack && process.env.NODE_ENV !== 'production') {
                    const stackLines = error.stack.split('\n').slice(1, 3);
                    stackLines.forEach(line => log(`${testIndent}  \x1b[90m${line.trim()}\x1b[0m`));
                }
            }
        }
        // Run afterAll
        if (runnable > 0) {
            for (const hook of suite.afterAll) {
                try {
                    await withTimeout(hook, defaultTimeout, 'afterAll hook');
                }
                catch { }
            }
        }
        if (depth === 0 && !isRoot)
            log('');
    };
    log('\n\x1b[36m[AxilJS Test]\x1b[0m Running tests...\n');
    try {
        await runSuite(tree, 0, false, false, { before: [], after: [] });
    }
    finally {
        // Reset for next run
        resetTests();
    }
    // Print summary
    const totalTime = Date.now() - startTime;
    log('─'.repeat(50));
    log(`\x1b[32m${totalPassed} passed\x1b[0m` +
        (totalFailed > 0 ? `, \x1b[31m${totalFailed} failed\x1b[0m` : '') +
        (totalSkipped > 0 ? `, \x1b[33m${totalSkipped} skipped\x1b[0m` : '') +
        `  \x1b[90m(${totalTime}ms)\x1b[0m`);
    log('');
    return {
        success: totalFailed === 0,
        passed: totalPassed,
        failed: totalFailed,
        skipped: totalSkipped,
        durationMs: totalTime,
        results
    };
}
/**
 * Run all registered test suites.
 * Called at the end of the test file or by the CLI.
 * Resolves to true when no test failed.
 */
async function runTests(options = {}) {
    const summary = await runTestsWithResults(options);
    return summary.success;
}
//# sourceMappingURL=test-runner.js.map