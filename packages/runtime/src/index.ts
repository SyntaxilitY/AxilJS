/**
 * @axiljs/runtime - Public API
 *
 * Executes the metadata recorded by @axiljs/decorator.
 */

export { requestContext, getContext, runWithContext } from './context';
export type { RequestContext, RequestContextOptions } from './context';

export {
  wire,
  wireAll,
  unwrap,
  registerInterceptor,
  unregisterInterceptor,
  listInterceptors
} from './interceptors';
export type { Interceptor, Invocation } from './interceptors';

export {
  TimeoutError,
  auditInterceptor,
  retryInterceptor,
  timeoutInterceptor,
  registerBuiltins
} from './builtins';

export { redact, redactResponses, redactingTransport } from './redact';
export type { RedactOptions, RedactRule } from './redact';

export {
  configureIntent,
  getIntentMode,
  getIntentViolations,
  clearIntentViolations,
  violate,
  reportSideEffect,
  runWithoutSideEffectReports,
  currentIntentScope,
  installSideEffectProbes,
  setIdempotencyStore,
  MemoryIdempotencyStore,
  getSloReport,
  resetSloReport,
  IntentViolationError,
  DeadlineExceededError,
  pureInterceptor,
  readOnlyInterceptor,
  sideEffectInterceptor,
  tenantIsolatedInterceptor,
  idempotentInterceptor,
  sloInterceptor,
  deprecatedInterceptor,
  deadlineInterceptor
} from './intent';
export type { IntentMode, IntentViolation, IdempotencyStore, SloReport, SideEffectProbeOptions } from './intent';

export {
  Semaphore,
  MemoryCacheStore,
  setCacheStore,
  getCacheStore,
  setLockProvider,
  setRateLimitStore,
  getCircuitStates,
  resetResilienceState,
  RateLimitExceededError,
  CircuitOpenError,
  CapacityExceededError,
  LockTimeoutError,
  rateLimitInterceptor,
  throttleInterceptor,
  debounceInterceptor,
  cacheInterceptor,
  cachePutInterceptor,
  cacheEvictInterceptor,
  cacheInvalidateInterceptor,
  dedupeInterceptor,
  fallbackInterceptor,
  circuitBreakerInterceptor,
  bulkheadInterceptor,
  concurrencyInterceptor,
  mutexInterceptor,
  lockInterceptor,
  hedgeInterceptor
} from './resilience';
export type { CacheStore, LockProvider, RateLimitCounterStore } from './resilience';

export {
  trackSensitive,
  checkSink,
  allowSensitive,
  configureLineage,
  resetLineage,
  trackedSensitiveOrigins
} from './lineage';
export type { SensitiveSink, SensitiveLeak, ObserveHint, LineageOptions } from './lineage';

export { useStores } from './stores';
export type { RuntimeStores } from './stores';

export { resolveKey, parseDuration } from './keys';
export type { KeySpec } from './keys';

export { enforcedDecorators, runtimeReport } from './report';
export type { RuntimeReport } from './report';

import { registerBuiltins } from './builtins';
registerBuiltins();
