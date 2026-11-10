/**
 * @axiljs/testing - Public API
 */

// Test runner
export {
  describe,
  it,
  test,
  xit,
  fit,
  xdescribe,
  fdescribe,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  runTests,
  runTestsWithResults,
  resetTests,
  DEFAULT_TIMEOUT
} from './runner/test-runner';
export type {
  TestFunction,
  DescribeFunction,
  TestResult,
  RunOptions,
  RunSummary
} from './runner/test-runner';

// Assertions
export { expect, AssertionError } from './assertions/expect';
export type { AsyncAssertions } from './assertions/expect';

// Mock functions and spies
export { fn, spyOn, isMockFunction } from './mock/mock';
export type { MockFunction, MockState, MockResult } from './mock/mock';

// HTTP test client
export { TestClient, createTestClient } from './http/test-client';
export type { TestResponse } from './http/test-client';
