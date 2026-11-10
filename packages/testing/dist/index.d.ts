/**
 * @axiljs/testing - Public API
 */
export { describe, it, test, xit, fit, xdescribe, fdescribe, beforeAll, afterAll, beforeEach, afterEach, runTests, runTestsWithResults, resetTests, DEFAULT_TIMEOUT } from './runner/test-runner';
export type { TestFunction, DescribeFunction, TestResult, RunOptions, RunSummary } from './runner/test-runner';
export { expect, AssertionError } from './assertions/expect';
export type { AsyncAssertions } from './assertions/expect';
export { fn, spyOn, isMockFunction } from './mock/mock';
export type { MockFunction, MockState, MockResult } from './mock/mock';
export { TestClient, createTestClient } from './http/test-client';
export type { TestResponse } from './http/test-client';
//# sourceMappingURL=index.d.ts.map