import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as R from '../src/runner/test-runner';
import { expect as axilExpect } from '../src/assertions/expect';

// The runner keeps a global registry: start every test from a clean slate
beforeEach(() => {
  R.resetTests();
});

async function run(options: R.RunOptions = {}): Promise<R.RunSummary> {
  return R.runTestsWithResults({ silent: true, ...options });
}

describe('runner: basics', () => {
  it('runs passing and failing tests and reports totals', async () => {
    R.describe('math', () => {
      R.it('adds', () => { axilExpect(1 + 1).toBe(2); });
      R.it('fails', () => { axilExpect(1).toBe(2); });
    });

    const summary = await run();
    expect(summary.passed).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.success).toBe(false);
    expect(summary.results.find(r => r.test === 'fails')!.error!.message).toContain('to be 2');
  });

  it('runTests() still resolves to a boolean and clears the registry', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      R.describe('s', () => { R.it('ok', () => {}); });
      expect(await R.runTests()).toBe(true);
      // registry was reset → an empty run passes with 0 tests
      const again = await run();
      expect(again.passed + again.failed + again.skipped).toBe(0);
    } finally {
      log.mockRestore();
    }
  });

  it('test is an alias of it; it outside describe throws', () => {
    expect(R.test).toBe(R.it);
    expect(() => R.it('orphan', () => {})).toThrow(/inside a 'describe'/);
  });

  it('resetTests() drops registered suites', async () => {
    R.describe('gone', () => { R.it('x', () => { throw new Error('should not run'); }); });
    R.resetTests();
    const summary = await run();
    expect(summary.results).toHaveLength(0);
  });
});

describe('runner: nesting and hooks', () => {
  it('prefixes nested suite names', async () => {
    R.describe('Users', () => {
      R.describe('create', () => {
        R.it('works', () => {});
      });
      R.it('top', () => {});
    });

    const summary = await run();
    expect(summary.results.map(r => r.fullName)).toEqual([
      'Users > create > works',
      'Users > top'
    ]);
    expect(summary.results[0].suite).toBe('Users > create');
  });

  it('inherits hooks: parent beforeEach first, child afterEach first', async () => {
    const order: string[] = [];

    R.describe('outer', () => {
      R.beforeAll(() => { order.push('outer beforeAll'); });
      R.beforeEach(() => { order.push('outer beforeEach'); });
      R.afterEach(() => { order.push('outer afterEach'); });
      R.afterAll(() => { order.push('outer afterAll'); });

      R.describe('inner', () => {
        R.beforeAll(() => { order.push('inner beforeAll'); });
        R.beforeEach(() => { order.push('inner beforeEach'); });
        R.afterEach(() => { order.push('inner afterEach'); });
        R.afterAll(() => { order.push('inner afterAll'); });
        R.it('t1', () => { order.push('t1'); });
      });

      R.it('t2', () => { order.push('t2'); });
    });

    await run();
    expect(order).toEqual([
      'outer beforeAll',
      'inner beforeAll',
      'outer beforeEach', 'inner beforeEach', 't1', 'inner afterEach', 'outer afterEach',
      'inner afterAll',
      'outer beforeEach', 't2', 'outer afterEach',
      'outer afterAll'
    ]);
  });

  it('runs multiple hooks of the same type in registration order', async () => {
    const order: string[] = [];
    R.describe('s', () => {
      R.beforeEach(() => { order.push('b1'); });
      R.beforeEach(async () => { await Promise.resolve(); order.push('b2'); });
      R.afterEach(() => { order.push('a1'); });
      R.afterEach(() => { order.push('a2'); });
      R.beforeAll(() => { order.push('ba1'); });
      R.beforeAll(() => { order.push('ba2'); });
      R.it('t', () => { order.push('t'); });
    });
    await run();
    expect(order).toEqual(['ba1', 'ba2', 'b1', 'b2', 't', 'a1', 'a2']);
  });

  it('fails every test of a suite whose beforeAll throws', async () => {
    R.describe('broken', () => {
      R.beforeAll(() => { throw new Error('db down'); });
      R.it('a', () => {});
      R.describe('child', () => { R.it('b', () => {}); });
    });
    R.describe('fine', () => { R.it('c', () => {}); });

    const summary = await run();
    expect(summary.failed).toBe(2);
    expect(summary.passed).toBe(1);
    expect(summary.results.filter(r => !r.passed && !r.skipped).every(r => r.error!.message === 'db down')).toBe(true);
  });

  it('a failing beforeEach fails the test without running it', async () => {
    const ran = vi.fn();
    R.describe('s', () => {
      R.beforeEach(() => { throw new Error('setup'); });
      R.it('t', ran);
    });
    const summary = await run();
    expect(summary.failed).toBe(1);
    expect(ran).not.toHaveBeenCalled();
  });

  it('a failing afterEach fails the test', async () => {
    R.describe('s', () => {
      R.afterEach(() => { throw new Error('cleanup failed'); });
      R.it('t', () => {});
    });
    const summary = await run();
    expect(summary.failed).toBe(1);
    expect(summary.results[0].error!.message).toBe('cleanup failed');
  });
});

describe('runner: skip / only', () => {
  it('it.skip, xit and describe.skip skip tests', async () => {
    const ran: string[] = [];
    R.describe('s', () => {
      R.it('runs', () => { ran.push('runs'); });
      R.it.skip('skipped', () => { ran.push('skipped'); });
      R.xit('xit', () => { ran.push('xit'); });
    });
    R.describe.skip('whole suite', () => {
      R.it('a', () => { ran.push('a'); });
      R.describe('nested', () => { R.it('b', () => { ran.push('b'); }); });
    });

    const summary = await run();
    expect(ran).toEqual(['runs']);
    expect(summary.passed).toBe(1);
    expect(summary.skipped).toBe(4);
  });

  it('it.only runs only the focused tests across all suites', async () => {
    const ran: string[] = [];
    R.describe('a', () => {
      R.it('a1', () => { ran.push('a1'); });
      R.it.only('a2', () => { ran.push('a2'); });
    });
    R.describe('b', () => {
      R.it('b1', () => { ran.push('b1'); });
      R.fit('b2', () => { ran.push('b2'); });
    });

    const summary = await run();
    expect(ran).toEqual(['a2', 'b2']);
    expect(summary.skipped).toBe(2);
  });

  it('describe.only runs every test inside it (but honours it.skip)', async () => {
    const ran: string[] = [];
    R.describe('other', () => { R.it('o', () => { ran.push('o'); }); });
    R.describe.only('focus', () => {
      R.it('f1', () => { ran.push('f1'); });
      R.it.skip('f2', () => { ran.push('f2'); });
      R.describe('deeper', () => { R.it('f3', () => { ran.push('f3'); }); });
    });

    await run();
    expect(ran).toEqual(['f1', 'f3']);
  });

  it('hooks of suites without runnable tests are not executed', async () => {
    const hook = vi.fn();
    R.describe.skip('s', () => {
      R.beforeAll(hook);
      R.it('t', () => {});
    });
    await run();
    expect(hook).not.toHaveBeenCalled();
  });
});

describe('runner: timeouts', () => {
  it('fails a test that exceeds its own timeout', async () => {
    R.describe('slow', () => {
      R.it('hangs', () => new Promise(() => {}), 30);
      R.it('quick', async () => {}, 1000);
    });
    const summary = await run();
    const hung = summary.results.find(r => r.test === 'hangs')!;
    expect(hung.passed).toBe(false);
    expect(hung.error!.message).toMatch(/timed out after 30ms/);
    expect(summary.passed).toBe(1);
  });

  it('applies the default timeout from run options', async () => {
    R.describe('slow', () => {
      R.it('hangs', () => new Promise(() => {}));
    });
    const summary = await run({ timeout: 20 });
    expect(summary.results[0].error!.message).toMatch(/timed out after 20ms/);
  });

  it('defaults to 5000ms', () => {
    expect(R.DEFAULT_TIMEOUT).toBe(5000);
  });

  it('rejects invalid timeouts', () => {
    R.describe('s', () => {
      expect(() => R.it('bad', () => {}, -1)).toThrow(/Invalid timeout/);
    });
  });
});

describe('runner: each', () => {
  it('it.each with array rows and printf-style names', async () => {
    const seen: number[][] = [];
    R.describe('add', () => {
      R.it.each([[1, 1, 2], [2, 3, 5]])('%i + %i = %i', (a: number, b: number, sum: number) => {
        seen.push([a, b, sum]);
        axilExpect(a + b).toBe(sum);
      });
    });
    const summary = await run();
    expect(seen).toEqual([[1, 1, 2], [2, 3, 5]]);
    expect(summary.results.map(r => r.test)).toEqual(['1 + 1 = 2', '2 + 3 = 5']);
  });

  it('it.each with object rows, $key and %# names', async () => {
    R.describe('users', () => {
      R.it.each([{ name: 'ann', age: 3 }, { name: 'bob', age: 4 }])('#%# $name is $age', (row: any) => {
        axilExpect(typeof row.name).toBe('string');
      });
      R.it.each(['x', 'y'])('value %s', (v: string) => { axilExpect(v.length).toBe(1); });
    });
    const summary = await run();
    expect(summary.results.map(r => r.test)).toEqual([
      '#0 ann is 3', '#1 bob is 4', 'value x', 'value y'
    ]);
    expect(summary.success).toBe(true);
  });

  it('describe.each creates one suite per row', async () => {
    R.describe.each([['sqlite'], ['postgres']])('driver %s', (driver: string) => {
      R.it('has a name', () => { axilExpect(driver.length).toBeGreaterThan(0); });
    });
    const summary = await run();
    expect(summary.results.map(r => r.fullName)).toEqual([
      'driver sqlite > has a name',
      'driver postgres > has a name'
    ]);
  });
});
