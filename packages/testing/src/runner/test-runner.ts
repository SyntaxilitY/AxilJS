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

// ─── Types ────────────────────────────────────────────────────────────────────

type HookFn = () => void | Promise<void>;
type TestFn = () => void | Promise<void>;

interface TestCase {
  name: string;
  fn: TestFn;
  skip: boolean;
  only: boolean;
  timeout?: number;
}

interface TestSuite {
  name: string;
  parent: TestSuite | null;
  // Tests and child suites in declaration order
  items: Array<{ kind: 'test'; test: TestCase } | { kind: 'suite'; suite: TestSuite }>;
  beforeAll: HookFn[];
  afterAll: HookFn[];
  beforeEach: HookFn[];
  afterEach: HookFn[];
  skip: boolean;
  only: boolean;
}

export interface TestResult {
  // Full suite path ("Outer > Inner")
  suite: string;
  test: string;
  // Full display name ("Outer > Inner > test")
  fullName: string;
  passed: boolean;
  skipped: boolean;
  error?: Error;
  durationMs: number;
}

export interface RunOptions {
  // Default per-test / per-hook timeout in ms (default: 5000)
  timeout?: number;
  // Suppress console output (default: false)
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

export const DEFAULT_TIMEOUT = 5000;

// ─── Global Test Registry ─────────────────────────────────────────────────────

function createSuite(name: string, parent: TestSuite | null): TestSuite {
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
let root: TestSuite = createSuite('', null);

// Currently active suite (set by describe())
let currentSuite: TestSuite | null = null;

/**
 * Clear every registered suite, test and hook.
 * runTests() does this automatically after a run.
 */
export function resetTests(): void {
  root = createSuite('', null);
  currentSuite = null;
}

// ─── Name formatting (it.each) ────────────────────────────────────────────────

function formatValue(v: unknown): string {
  if (typeof v === 'string') return v;
  if (typeof v === 'function') return `[Function ${v.name || 'anonymous'}]`;
  if (typeof v === 'bigint') return `${v}n`;
  if (typeof v === 'symbol') return v.toString();
  if (v === undefined) return 'undefined';
  try {
    return JSON.stringify(v) ?? String(v);
  } catch {
    return String(v);
  }
}

function formatEachName(template: string, row: unknown, index: number): string {
  const args = Array.isArray(row) ? row : [row];
  let i = 0;

  let name = template.replace(/%([sdifjop#%])/g, (match, flag: string) => {
    if (flag === '%') return '%';
    if (flag === '#') return String(index);
    if (i >= args.length) return match;
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
    name = name.replace(/\$([A-Za-z_][\w.]*)/g, (match, path: string) => {
      let cur: any = row;
      for (const part of path.split('.')) {
        if (cur === null || cur === undefined || !(part in Object(cur))) return match;
        cur = cur[part];
      }
      return formatValue(cur);
    });
  }

  return name;
}

// ─── Test Registration Functions ──────────────────────────────────────────────

function registerSuite(
  name: string,
  fn: () => void,
  flags: { skip?: boolean; only?: boolean } = {}
): void {
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
  } finally {
    currentSuite = previousSuite;
  }
}

function registerTest(
  name: string,
  fn: TestFn,
  timeout: number | undefined,
  flags: { skip?: boolean; only?: boolean },
  strict: boolean
): void {
  if (!currentSuite) {
    if (strict) throw new Error(`'it' must be called inside a 'describe' block`);
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

function rowArgs(row: unknown): unknown[] {
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
export const describe: DescribeFunction = Object.assign(
  function describe(name: string, fn: () => void): void {
    registerSuite(name, fn);
  },
  {
    skip(name: string, fn: () => void): void {
      registerSuite(name, fn, { skip: true });
    },
    only(name: string, fn: () => void): void {
      registerSuite(name, fn, { only: true });
    },
    each(table: EachTable) {
      return (name: string, fn: (...args: any[]) => void): void => {
        table.forEach((row, index) => {
          registerSuite(formatEachName(name, row, index), () => fn(...rowArgs(row)));
        });
      };
    }
  }
);

/**
 * Register a test case.
 * The optional third argument is a timeout in ms (default 5000).
 */
export const it: TestFunction = Object.assign(
  function it(name: string, fn: TestFn, timeout?: number): void {
    registerTest(name, fn, timeout, {}, true);
  },
  {
    skip(name: string, _fn?: TestFn, timeout?: number): void {
      registerTest(name, async () => {}, timeout, { skip: true }, true);
    },
    only(name: string, fn: TestFn, timeout?: number): void {
      registerTest(name, fn, timeout, { only: true }, true);
    },
    each(table: EachTable) {
      return (
        name: string,
        fn: (...args: any[]) => void | Promise<void>,
        timeout?: number
      ): void => {
        table.forEach((row, index) => {
          registerTest(
            formatEachName(name, row, index),
            () => fn(...rowArgs(row)),
            timeout,
            {},
            true
          );
        });
      };
    }
  }
);

// Alias: test() = it()
export const test = it;

/**
 * Skip a test.
 */
export function xit(name: string, _fn: () => void | Promise<void>): void {
  registerTest(name, async () => {}, undefined, { skip: true }, false);
}

/**
 * Run only this test (and other 'only' tests).
 */
export function fit(name: string, fn: () => void | Promise<void>, timeout?: number): void {
  registerTest(name, fn, timeout, { only: true }, false);
}

/** Skip a whole suite. */
export function xdescribe(name: string, fn: () => void): void {
  registerSuite(name, fn, { skip: true });
}

/** Run only this suite (and other 'only' tests/suites). */
export function fdescribe(name: string, fn: () => void): void {
  registerSuite(name, fn, { only: true });
}

/**
 * Setup hooks. Several hooks of the same type may be registered per suite;
 * they run in registration order. Hooks outside any describe() are ignored.
 */
export function beforeAll(fn: HookFn): void {
  if (currentSuite) currentSuite.beforeAll.push(fn);
}

export function afterAll(fn: HookFn): void {
  if (currentSuite) currentSuite.afterAll.push(fn);
}

export function beforeEach(fn: HookFn): void {
  if (currentSuite) currentSuite.beforeEach.push(fn);
}

export function afterEach(fn: HookFn): void {
  if (currentSuite) currentSuite.afterEach.push(fn);
}

// ─── Test Runner ──────────────────────────────────────────────────────────────

function withTimeout(
  fn: () => void | Promise<void>,
  ms: number,
  label: string
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);

    Promise.resolve()
      .then(fn)
      .then(
        () => { clearTimeout(timer); resolve(); },
        (err) => { clearTimeout(timer); reject(err); }
      );
  });
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

function suitePath(suite: TestSuite): string[] {
  const names: string[] = [];
  for (let s: TestSuite | null = suite; s && s !== root; s = s.parent) {
    names.unshift(s.name);
  }
  return names;
}

function hasOnly(suite: TestSuite): boolean {
  return suite.items.some(item =>
    item.kind === 'test'
      ? item.test.only
      : item.suite.only || hasOnly(item.suite)
  );
}

/**
 * Run all registered test suites and return a detailed summary.
 * The registry is cleared afterwards.
 */
export async function runTestsWithResults(options: RunOptions = {}): Promise<RunSummary> {
  const defaultTimeout = options.timeout ?? DEFAULT_TIMEOUT;
  const log = options.silent
    ? (..._args: unknown[]) => {}
    : (...args: unknown[]) => console.log(...args);
  const logError = options.silent
    ? (..._args: unknown[]) => {}
    : (...args: unknown[]) => console.error(...args);

  const results: TestResult[] = [];
  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  const startTime = Date.now();
  const tree = root;

  // Check if any tests or suites use 'only' mode
  const onlyMode = hasOnly(tree);

  /** Would this test run (not skipped, passes the only filter)? */
  const isRunnable = (test: TestCase, inSkipped: boolean, inOnly: boolean): boolean =>
    !inSkipped && !test.skip && (!onlyMode || inOnly || test.only);

  const countRunnable = (suite: TestSuite, inSkipped: boolean, inOnly: boolean): number => {
    const skipped = inSkipped || suite.skip;
    const only = inOnly || suite.only;
    let n = 0;
    for (const item of suite.items) {
      if (item.kind === 'test') {
        if (isRunnable(item.test, skipped, only)) n++;
      } else {
        n += countRunnable(item.suite, skipped, only);
      }
    }
    return n;
  };

  const record = (
    suite: TestSuite,
    test: TestCase,
    passed: boolean,
    skipped: boolean,
    durationMs: number,
    error?: Error
  ): void => {
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

  const markAllFailed = (suite: TestSuite, inSkipped: boolean, inOnly: boolean, error: Error): number => {
    const skipped = inSkipped || suite.skip;
    const only = inOnly || suite.only;
    let n = 0;
    for (const item of suite.items) {
      if (item.kind === 'test') {
        if (isRunnable(item.test, skipped, only)) {
          record(suite, item.test, false, false, 0, error);
          n++;
        }
      } else {
        n += markAllFailed(item.suite, skipped, only, error);
      }
    }
    return n;
  };

  const runSuite = async (
    suite: TestSuite,
    depth: number,
    inSkipped: boolean,
    inOnly: boolean,
    eachChain: { before: HookFn[]; after: HookFn[] }
  ): Promise<void> => {
    const skipped = inSkipped || suite.skip;
    const only = inOnly || suite.only;
    const indent = '  '.repeat(depth);
    const isRoot = suite === tree;

    if (!isRoot) log(`${indent}\x1b[1m${suite.name}\x1b[0m`);

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
      } catch (e) {
        const error = toError(e);
        logError(`${indent}  \x1b[31m✗ beforeAll failed:\x1b[0m ${error.message}`);
        // The suite's tests never ran — that must fail the run, not pass it
        const failed = markAllFailed(suite, inSkipped, inOnly, error);
        totalFailed += Math.max(1, failed);
        for (const hook of suite.afterAll) {
          try { await withTimeout(hook, defaultTimeout, 'afterAll hook'); } catch {}
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
      let error: Error | undefined;

      try {
        // beforeEach failure fails this test instead of being swallowed
        for (const hook of chain.before) {
          await withTimeout(hook, timeout, 'beforeEach hook');
        }
        await withTimeout(testCase.fn, timeout, `Test "${testCase.name}"`);
      } catch (err) {
        passed = false;
        error = toError(err);
      }

      // Run afterEach (innermost first); a failure fails the test
      for (const hook of chain.after) {
        try {
          await withTimeout(hook, timeout, 'afterEach hook');
        } catch (err) {
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
      } else {
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
        try { await withTimeout(hook, defaultTimeout, 'afterAll hook'); } catch {}
      }
    }

    if (depth === 0 && !isRoot) log('');
  };

  log('\n\x1b[36m[AxilJS Test]\x1b[0m Running tests...\n');

  try {
    await runSuite(tree, 0, false, false, { before: [], after: [] });
  } finally {
    // Reset for next run
    resetTests();
  }

  // Print summary
  const totalTime = Date.now() - startTime;

  log('─'.repeat(50));
  log(
    `\x1b[32m${totalPassed} passed\x1b[0m` +
      (totalFailed > 0 ? `, \x1b[31m${totalFailed} failed\x1b[0m` : '') +
      (totalSkipped > 0 ? `, \x1b[33m${totalSkipped} skipped\x1b[0m` : '') +
      `  \x1b[90m(${totalTime}ms)\x1b[0m`
  );
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
export async function runTests(options: RunOptions = {}): Promise<boolean> {
  const summary = await runTestsWithResults(options);
  return summary.success;
}
