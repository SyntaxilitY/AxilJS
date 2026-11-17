# @axiljs/runtime

Makes `@axiljs/decorator` metadata actually run: a per-request context, intent verification (`tPure`, `tReadOnly`, `tTenantIsolated`, `tIdempotent`, `tSlo`, …), resilience and concurrency interceptors (`tRetry`, `tTimeout`, `tCircuitBreaker`, `tBulkhead`, `tCache`, `tLock`, …), audit events and redaction driven by `tRedact` / `tSensitive`.

Part of the [AxilJS](https://github.com/SyntaxilitY/AxilJS) ecosystem.

## Install

```bash
npm install @axiljs/runtime
```

## Request context

```typescript
import { Application } from '@axiljs/core'
import { requestContext, getContext } from '@axiljs/runtime'

const app = new Application()
app.use(requestContext())   // register before auth

// anywhere downstream, no `req` needed:
const ctx = getContext()    // { requestId, user, tenantId, req, bag } | undefined
```

The request ID comes from `req.locals.requestId`, then a valid `x-request-id` header, then `crypto.randomUUID()`, and is echoed back in the response. `user` and `tenantId` are read lazily from `req.locals`, so auth and tenancy middleware can run after it.

For jobs and cron tasks: `runWithContext({ requestId, user, tenantId }, () => work())`.

## Interceptors

```typescript
import { tAudit, tRetry, tTimeout } from '@axiljs/decorator'
import { wire } from '@axiljs/runtime'

class Payments {
  @tAudit({ action: 'payment.charged', compliance: ['PCI-DSS'], includeRequest: true })
  @tRetry({ attempts: 3, backoff: 'exponential', retryOn: ['TimeoutError', 'ECONNRESET'] })
  @tTimeout(2000)
  async charge(id: string, amount: number) { /* ... */ }
}

wire(Payments)   // or wireAll() once at startup
```

| Decorator | Order | Behaviour |
|---|---|---|
| `tAudit` | 100 (outermost) | One `audit.log` event per logical call (after retries) on the global event bus, same shape as `@axiljs/cloud`'s `auditLog()`. Actor, tenant, request ID, IP come from the context. `args`/`result` are redacted. |
| `tRetry` | 200 | `@axiljs/circuit` `retry()`. `retryOn` matches `error.name` or `error.code`. Emits `runtime.retry`. |
| `tTimeout` | 300 (innermost) | Per-attempt deadline; rejects with `TimeoutError` (`name: 'TimeoutError'`, `code: 'ETIMEDOUT'`). The underlying work is not cancelled. |

Wired methods always return a Promise. `wire()` is idempotent and subclasses never double-wrap. Interceptors are resolved when a class is wired, so register custom ones first:

```typescript
registerInterceptor({
  decorator: 'tIdempotent',
  order: 150,
  async intercept(invocation, options, proceed) { /* ... */ return proceed() }
})
```

## Intent verification

Some decorators state what a method promises. The runtime checks those promises while the code runs, so a broken promise fails a test instead of becoming a data leak or a duplicate charge.

| Decorator | What is checked |
|---|---|
| `tReadOnly()` | No write inside the call tree: database writes (reported by `@axiljs/orm`), `tSideEffect` methods, and, with probes installed, non-GET `fetch` and `node:fs` writes |
| `tPure()` | No side effect of any kind, reads included |
| `tSideEffect(kind)` | Reports `kind` to the caller, so a pure or read-only caller fails when it calls this method |
| `tTenantIsolated()` | The call runs inside a tenant context, and the result contains no rows whose `tenantId` / `tenant_id` belongs to another tenant |
| `tIdempotent({ key })` | One execution per key: concurrent duplicates share the running call, later duplicates get the stored result; failures are not stored |
| `tSlo({ latency, percentile, errorBudget })` | Latency percentile and error rate over the last 1000 calls; emits `runtime.slo.breach` / `runtime.slo.recovered` |
| `tDeprecated({ removeAfter })` | Warns once on use; a violation after the removal date |
| `tDeadline(at)` | Rejects calls after an absolute timestamp (`DeadlineExceededError`, HTTP 410) |

```typescript
import { tReadOnly, tTenantIsolated, tIdempotent } from '@axiljs/decorator'
import { wire, configureIntent, installSideEffectProbes } from '@axiljs/runtime'

class Orders {
  @tReadOnly()
  @tTenantIsolated()
  async list() { return this.repo.findAll() }        // an INSERT here throws in development

  @tIdempotent({ key: 'header:idempotency-key', ttl: 86_400_000 })
  async pay(orderId: string) { return this.gateway.charge(orderId) }
}
wire(Orders)

installSideEffectProbes()              // optional: also report fetch() and fs writes
configureIntent({ mode: 'enforce' })   // 'enforce' | 'warn' | 'off'
```

**Modes.** `enforce` throws `IntentViolationError` (default outside production). `warn` records the violation, emits `runtime.intent.violation` and prints one warning per target (default when `NODE_ENV=production`). `off` disables the checks. `getIntentViolations()` returns the recorded violations and `getSloReport()` the SLO status of every `tSlo` method.

**Reporting side effects from your own code.** Call `reportSideEffect('payments.write')` before performing an effect the runtime cannot see. Packages that must not depend on `@axiljs/runtime` can call `globalThis[Symbol.for('axiljs.intent.report')]?.(kind, detail)`.

**Keys.** Keyed decorators accept a function of the arguments or a string: `'request.id'`, `'header:<name>'`, `'user'`, `'tenant'`, `'ip'`, `'args.0.id'`, a template such as `'order:{0.id}'`, or `'global'`.

**Shared stores.** Results of `tIdempotent` are kept in memory by default; call `setIdempotencyStore()` with a shared implementation for multi-instance deployments.

## Resilience and concurrency

| Decorator | Behaviour |
|---|---|
| `tCircuitBreaker({ threshold, resetTimeout, halfOpenAttempts })` | Opens after `threshold` consecutive failures and fails fast with `CircuitOpenError` (503); lets probe calls through after `resetTimeout` |
| `tFallback({ value })` / `tFallback({ method })` | Returns a value, or calls another method with `(...args, error)`, when the call fails |
| `tBulkhead({ name, concurrency, queue })` | Capacity shared by every method that uses the same name; `CapacityExceededError` (503) when full |
| `tConcurrency({ limit, strategy, key })` | Per-method or per-key limit; `strategy` is `'queue'` (default), `'reject'` or `'drop-oldest'` |
| `tMutex({ key })` | One call at a time per method (or key) |
| `tLock({ key, ttl, wait })` | Keyed lock with wait timeout (`LockTimeoutError`, 409) and automatic release after `ttl`; `setLockProvider()` for cross-process locks |
| `tDedupe({ key, window })` | Concurrent calls with the same key share one execution |
| `tHedge({ delay, maxAttempts })` | Starts another attempt when the first is slower than `delay`; the first success wins |
| `tCache({ key, ttl, tags, condition })` | Memoizes results; `tCachePut`, `tCacheEvict`, `tCacheInvalidate(...tags)` keep it fresh; `setCacheStore()` for a shared cache |
| `tRateLimit({ limit, window, key })` | Fixed-window limit per key (`'ip'`, `'user'`, `'tenant'`, custom); `RateLimitExceededError` (429) |
| `tThrottle(calls, periodMs)` | At most `calls` executions per period for the method |
| `tDebounce(ms)` | A burst of calls runs once, with the last arguments; every caller receives that result |

Interceptors run in a fixed order (lower is outer): deprecation and SLO measurement first, then intent scopes, idempotency, audit, rate limits, cache, deduplication, fallback, retry, circuit breaker, bulkhead and concurrency, locks, hedging and finally the per-attempt timeout. `enforcedDecorators()` lists every decorator the runtime enforces, in that order.

All runtime errors extend `axilError`, so `@axiljs/core` returns them with the right HTTP status.

## Redaction

```typescript
import { tRedact, tSensitive } from '@axiljs/decorator'
import { redact, redactResponses, redactingTransport } from '@axiljs/runtime'

class User {
  @tRedact({ strategy: 'remove' }) passwordHash = ''
  @tRedact({ strategy: 'mask', visibleChars: 4 }) card = ''
  @tRedact({ strategy: 'hash' }) ssn = ''
  @tSensitive('PII') email = ''
}

redact(user)                       // plain copy; input never mutated
app.use(redactResponses())         // res.json() and res.success()/created()/... bodies
new Logger({ transports: [redactingTransport(new ConsoleTransport(), { fields: { authorization: 'mask' } })] })
```

`tRedact` fields are always redacted. `tSensitive` fields are masked in logs and audit events but kept in responses (`redactResponses` defaults to `includeSensitive: false`). `fields` adds name-based rules for plain objects.
