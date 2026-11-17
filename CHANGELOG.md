# Changelog

All notable changes to AxilJS are documented here. Versions apply to every `@axiljs/*` package; the packages are released together.

## 0.3.4

### Added

**Intent verification (`@axiljs/runtime`)**

Decorators that declare a contract are now checked at runtime. In development a broken contract throws `IntentViolationError`; in production it is recorded and emitted as `runtime.intent.violation` (`configureIntent({ mode })` selects `enforce`, `warn` or `off`).

- `tReadOnly`: no writes anywhere in the call tree (database writes, `tSideEffect` methods, and with `installSideEffectProbes()` non-GET `fetch` calls and `node:fs` writes).
- `tPure`: no side effects of any kind.
- `tSideEffect(kind)`: reports its effect to the calling scope.
- `tTenantIsolated`: requires a tenant context and rejects results that contain another tenant's rows.
- `tIdempotent`: one execution per key; concurrent and later duplicates receive the same result; pluggable `IdempotencyStore`.
- `tSlo`: rolling latency percentile and error rate per method, `runtime.slo.breach` / `runtime.slo.recovered` events and `getSloReport()`.
- `tDeprecated`: one-time deprecation warning and a violation after `removeAfter`.
- `tDeadline`: rejects calls after an absolute timestamp.
- `reportSideEffect()`, `getIntentViolations()`, `enforcedDecorators()`.

**Resilience and concurrency interceptors (`@axiljs/runtime`)**

`tCircuitBreaker`, `tFallback`, `tBulkhead`, `tConcurrency`, `tMutex`, `tLock` (pluggable `LockProvider`), `tDedupe`, `tHedge`, `tCache` / `tCachePut` / `tCacheEvict` / `tCacheInvalidate` (pluggable `CacheStore`), `tRateLimit`, `tThrottle` and `tDebounce` now execute. The runtime enforces 26 decorators, up from 3. All runtime errors extend `axilError` and carry an HTTP status.

**Durable job storage (`@axiljs/queue`)**

`FileQueueStore` persists jobs to a journal and snapshot so they survive a restart. Jobs that were running when the process stopped are retried.

**Cluster-wide rate limiting (`@axiljs/security`)**

`ClusterStore` and `installClusterRateLimitPrimary()` share rate-limit counters across `node:cluster` workers. If the primary does not answer, workers fall back to local counting.

**Cross-process events (`@axiljs/events`)**

`EventBus` accepts a transport. `emit(type, payload, { broadcast: true })` delivers to other processes. Includes `ClusterTransport`, `installClusterEventRelay()`, `InMemoryTransport` and `createLinkedTransports()`.

**`@axiljs/scale`**

`serve()` accepts `onPrimary`, a hook that runs in the primary before workers start, for installing the cluster rate-limit and event services.

**`@axiljs/orm`**

Every statement is classified as a read or a write (`classifyStatement()`) and reported to the runtime's intent checks before it executes, so a write inside `tReadOnly` is stopped before it reaches the database.

### Fixed

- Wired methods now always return a rejected promise when an interceptor throws synchronously, instead of throwing.
- Rate limits are no longer multiplied by the number of workers in cluster mode (with `ClusterStore`).
- Queued jobs are no longer lost on restart (with `FileQueueStore`).

### Documentation

- Rewritten root README.
- New sections in the `runtime`, `queue`, `security`, `events` and `scale` READMEs.
- Added `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md` and a sponsor button.
