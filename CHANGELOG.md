# Changelog

All notable changes to AxilJS are documented here. Versions apply to every `@axiljs/*` package; the packages are released together.

## 0.3.6

Shared state is now part of the standard setup: one call makes idempotency, cache, locks, rate limits and AI budgets work correctly across several servers.

### Added

- **`useStores()` (`@axiljs/runtime`)** installs the rate-limit, idempotency, cache and lock stores in one call. Any object with the matching members works, so Redis or custom backends plug in the same way.
- **`createSqlStores(executor, options)` (`@axiljs/stores`)** builds every SQL store at once with a common table prefix, `ensureSchema()` to create all tables at startup and `close()`. Use `lock: 'advisory'` for PostgreSQL advisory locks.
- **`SqlBudgetStore` (`@axiljs/stores`)** keeps `withBudget` usage from `@axiljs/ai` in the database, so token, cost and request limits hold across servers. Additions are atomic, and reservations release exactly.
- **Templates:** `saas-api` and `high-scale-api` open a `DATABASE_URL` connection (SQLite by default, PostgreSQL or MySQL by URL), install the SQL stores with `useStores`, call `wireAll()`, expose the Studio Intent view in development only and close everything on shutdown. `high-scale-api` also installs the cluster event relay in the primary.
- **Documentation:** a "Running several instances" section in the root README explains which state is per process by default and how to share it.

## 0.3.5

### Added

**`@axiljs/stores` (new package): shared state across servers without Redis**

SQL-backed implementations for PostgreSQL, MySQL 8 and SQLite, with no dependencies: `SqlRateLimitStore` (atomic upsert counters), `SqlIdempotencyStore`, `SqlCacheStore` (with tags), `SqlLockProvider` (lease rows with takeover after expiry) and `PgAdvisoryLockProvider`. `fromConnection(conn)` adapts an `@axiljs/orm` connection. Plug them into `setRateLimitStore`, `setIdempotencyStore`, `setCacheStore` and `setLockProvider` from `@axiljs/runtime`, or `rateLimit({ store })` from `@axiljs/security`.

**Multi-server job queue (`@axiljs/queue`)**

`Queue` accepts a `backend`. `SqlQueueBackend` lets several servers share one table: jobs are claimed with `FOR UPDATE SKIP LOCKED` on PostgreSQL and MySQL, locks are renewed while a job runs, stale jobs return to the queue, and results from a server that lost its claim are discarded. Async accessors (`getJobsAsync`, `getStatsAsync`, `cancelAsync`, …) work in both modes.

**Migration safety (`@axiljs/orm`)**

`analyzeMigration(sql, { dialect })` and `MigrationRunner#check()` find statements that take heavy locks or break running code (non-concurrent index builds, NOT NULL without default, column type rewrites, constraints without NOT VALID, renames, drops, unbounded updates and deletes, MySQL table copies, …) and suggest the safe alternative. The runner option `safety: 'warn' | 'block'` checks migrations before running them; `-- axil:allow <rule>` acknowledges an intended change; a migration can export `transaction = false` so `CREATE INDEX CONCURRENTLY` is possible.

**AI governance (`@axiljs/ai`)**

`withBudget` (token, cost and request limits per tenant and time window, checked before the provider is called), `withRedaction` (masks, tokenizes or blocks e-mail addresses, phone numbers, card numbers, IBANs, API keys, JWTs and custom patterns before they reach the model, and restores them in the answer), and `recordingProvider` / `replayProvider` for deterministic, offline tests. AI middleware now returns budget and policy errors with their own status codes.

**Contract testing (`@axiljs/testing`)**

`expectIdempotent`, `expectTenantIsolated` and `expectNoIntentViolations` turn declared intent into HTTP-level tests.

**`axil verify` (`@axiljs/cli`)**

Lists the decorators used in `src/`, separates the ones the runtime enforces from metadata-only ones, flags classes that are never wired, and runs the tests with `AXIL_INTENT_MODE=enforce`. Supports `--static`, `--json` and `--strict`.

**Studio Intent view (`@axiljs/studio`)**

A live view of the intent mode, violations, SLO status, circuit states and enforced decorators. Apps expose the data in development with `app.use(intentEndpoint())`.

**`@axiljs/runtime`**

`AXIL_INTENT_MODE` environment variable, `runWithoutSideEffectReports()` for infrastructure writes, `setRateLimitStore()` for `tRateLimit` / `tThrottle`, and `runtimeReport()` (also published on a global symbol for tools).

### Fixed

- Three regular expressions that could take super-linear time on crafted input (SQL comment stripping in `@axiljs/orm`, key templates and duration parsing in `@axiljs/runtime`), reported by CodeQL.

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
