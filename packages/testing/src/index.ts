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
export { TestClient, TestRequest, createTestClient } from './http/test-client';
export type { TestResponse } from './http/test-client';

// Contract testing (idempotency, tenant isolation, runtime intent)
export {
  expectIdempotent,
  expectTenantIsolated,
  expectNoIntentViolations,
  extractRows,
  ContractViolationError,
  DEFAULT_IDEMPOTENCY_IGNORE,
  RUNTIME_REPORT_KEY
} from './contracts';
export type {
  RequestSpec,
  RequestAs,
  ContractClient,
  ContractMethod,
  IdempotencyOptions,
  IdempotencyReport,
  TenantSeed,
  ForbiddenProbe,
  TenantIsolationOptions,
  TenantIsolationReport
} from './contracts';
