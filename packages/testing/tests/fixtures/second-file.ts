// Simulates a second test file: registers its own top-level hook and suite.
import * as R from '../../src/runner/test-runner';

export function registerSecondFile(log: string[]): void {
  R.beforeEach(() => { log.push('file2:beforeEach'); });
  R.describe('second', () => {
    R.it('t2', () => { log.push('file2:test'); });
  });
}
