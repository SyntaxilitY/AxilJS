# @axiljs/runtime

Makes `@axiljs/decorator` metadata actually run: a per-request context, intent verification (`tPure`, `tReadOnly`, `tTenantIsolated`, `tIdempotent`, `tSlo`, …), resilience and concurrency interceptors (`tRetry`, `tTimeout`, `tCircuitBreaker`, `tBulkhead`, `tCache`, `tLock`, …), audit events, redaction driven by `tRedact` / `tSensitive`, and sensitive data lineage that reports tracked values reaching a response, log, event, queue or LLM request.

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

**Choosing the mode without code.** Set `AXIL_INTENT_MODE=enforce|warn|off` in the environment; `axil verify` uses this to run your tests in enforce mode.

**Infrastructure writes.** Writes made by the framework on behalf of a decorator (a cache entry or idempotency record stored in a database, a lock row) are not the method's own side effects. Wrap such code in `runWithoutSideEffectReports(fn)`; the SQL stores in `@axiljs/stores` and the SQL queue backend already do.

**Status for tools.** `runtimeReport()` returns the mode, enforced decorators, recorded violations, SLO status and circuit states. It is also published on `globalThis[Symbol.for('axiljs.runtime.report')]`, which AxilJS Studio reads for its Intent view.

**Reporting side effects from your own code.** Call `reportSideEffect('payments.write')` before performing an effect the runtime cannot see. Packages that must not depend on `@axiljs/runtime` can call `globalThis[Symbol.for('axiljs.intent.report')]?.(kind, detail)`.

**Keys.** Keyed decorators accept a function of the arguments or a string: `'request.id'`, `'header:<name>'`, `'user'`, `'tenant'`, `'ip'`, `'args.0.id'`, a template such as `'order:{0.id}'`, or `'global'`.

**Shared stores.** Idempotency results, cache entries, locks and rate-limit counters are kept in memory by default, which is correct only for a single process. For several instances, install shared stores in one call:

```typescript
import { createSqlStores, fromConnection } from '@axiljs/stores'
import { useStores } from '@axiljs/runtime'

const stores = createSqlStores(fromConnection(db))
await stores.ensureSchema()
useStores(stores)
```

`useStores({ rateLimit, idempotency, cache, lock })` accepts any object with the matching members, so other backends (Redis, a custom service) plug in the same way. The individual setters `setIdempotencyStore()`, `setCacheStore()`, `setLockProvider()` and `setRateLimitStore()` remain available.

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
| `tRateLimit({ limit, window, key })` | Fixed-window limit per key (`'ip'`, `'user'`, `'tenant'`, custom); `RateLimitExceededError` (429); `setRateLimitStore()` shares counters across processes |
| `tThrottle(calls, periodMs)` | At most `calls` executions per period for the method |
| `tDebounce(ms)` | A burst of calls runs once, with the last arguments; every caller receives that result |

Interceptors run in a fixed order (lower is outer): deprecation and SLO measurement first, then intent scopes, idempotency, audit, rate limits, cache, deduplication, fallback, retry, circuit breaker, bulkhead and concurrency, locks, hedging and finally the per-attempt timeout. `enforcedDecorators()` lists every decorator the runtime enforces, in that order.

The errors above extend `axilError`, so `@axiljs/core` returns them with the right HTTP status. `TimeoutError` from `tTimeout` is a plain `Error` with `code: 'ETIMEDOUT'`; map it in your error middleware (for example to 504).

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

`tRedact` fields are always redacted. `tSensitive` fields are masked in logs and audit events but kept in responses (`redactResponses` defaults to `includeSensitive: false`). `fields` adds name-based rules for plain objects. A `tSensitive` value loaded through the ORM and sent in a response is still reported by sensitive data lineage unless that exit is allowed (see below).

## Sensitive data lineage

Fields marked `@tSensitive(...)` or `@tRedact(...)` are tracked by value for the length of a request. If such a value leaves the process through an exit that is not allowed, the runtime reports a `tSensitive` intent violation, so an email address that ends up in a log line, an event payload or an LLM prompt fails a test instead of reaching a third party.

```typescript
import { tSensitive } from '@axiljs/decorator'
import { requestContext, allowSensitive } from '@axiljs/runtime'

@Entity('users')
class User extends BaseModel {
  @PrimaryKey() id!: number
  @Column() @tSensitive('PII') email!: string
}

app.use(requestContext())   // lineage is per request; nothing is tracked outside a context

app.get('/users/:id/summary', async (req, res) => {
  const user = await User.find(req.params.id)   // user.email is now tracked
  logger.info('summary', { email: user.email })  // violation: User.email (PII) reached log
  res.success({ id: user.id, email: user.email }) // violation: User.email (PII) reached response
})
```

**Sources.** `@axiljs/orm` reports every entity a `BaseModel` hydrates and every row a `BaseRepository` loads (column names are mapped back to properties). Call `trackSensitive(value)` for values from elsewhere (an HTTP client, a cache); plain objects can be described with `trackSensitive(rows, { entity: User, columns: { email: 'email_address' } })`. Objects, arrays and maps are walked with a depth limit and are cycle-safe.

**Sinks.** Each exit checks its payload with `checkSink(sink, payload, target?)`:

| Sink | Where it is checked |
|---|---|
| `response` | `@axiljs/core` `res.json()`, `res.text()`, `res.html()`, `res.send()` and every envelope helper (`res.success()`, ...) before the body is serialized |
| `log` | `@axiljs/observability` `ConsoleTransport` and `FileTransport`; `redactingTransport()` (after redaction) |
| `event` | `@axiljs/events` `EventBus.emit()` |
| `queue` | `@axiljs/queue` `Queue.add()` / `addMany()` |
| `ai` | `@axiljs/ai` provider requests (OpenAI, Anthropic, Gemini, Ollama; completions, streams and embeddings) |

The payload is scanned for tracked values in nested strings, numbers, object keys, `toJSON()` output, buffers and already-serialized JSON text. A value masked or hashed by `redact()` no longer matches and passes. The violation names the origin and classification (`User.email (PII) reached log`) and the current route as target; the value itself never appears in the violation, the error or the warning. `checkSink` returns the leaks found, so custom exits (a mailer, a webhook client) can call it with their own sink name.

**Allowing an exit.** Returning a user's own email from a profile endpoint is legitimate; say so explicitly:

```typescript
// Only inside fn (sync or async)
app.get('/me', async (req, res) => {
  const me = await User.find(getContext()!.user!.id)
  allowSensitive('response', () => res.success(me))
})

// For the rest of the current request (e.g. from a route middleware)
const allowResponse: MiddlewareFn = (_req, _res, next) => { allowSensitive('response'); next() }

// Without code at the call site, keyed by origin: 'User.email', 'User.*', a classification ('PII') or '*'
configureLineage({ allow: { response: ['User.email'], ai: ['INTERNAL'] } })
```

**Modes.** Lineage uses the intent mode (`configureIntent` / `AXIL_INTENT_MODE`). In `enforce` the sink throws `IntentViolationError` before anything is written: a response becomes the app's error response (HTTP 500, code `INTENT_VIOLATION`), `emit()` and `Queue.add()` reject, the provider request is not sent. Loggers never throw, so in enforce mode the leaking log entry is dropped and the violation recorded. In `warn` the violation is recorded, emitted as `runtime.intent.violation` and printed once per target and leak. `off` disables the checks; `configureLineage({ enabled: false })` disables tracking as well.

**Options.** `configureLineage({ minLength: 4, maxValues: 500, maxDepth: 8 })`. `trackedSensitiveOrigins()` lists the origins tracked in the current request (never the values); `resetLineage()` restores the defaults.

**Limitations.**

- Only strings of at least 4 characters (after trimming) and numbers with at least 4 digits are tracked; shorter values would match too much. Numbers match only on digit boundaries.
- Tracking is by exact value. A value that is transformed (hashed, encrypted, split, re-encoded, lower-cased, base64) is not recognized, and a value that leaves through an exit without a check (raw sockets, `fetch`, files written directly, `res.raw`) is not seen.
- Taint lives in the request context of one process; it does not follow a value into a queue worker or another service. Values tracked are capped per request (`maxValues`).
- Thrown errors are not a checked sink: an error message carrying a tracked value is caught only when it is written as a response or log entry.
- Custom log transports are checked only when wrapped in `redactingTransport()` or when they call `checkSink('log', entry)` themselves.
- Packages report through `globalThis[Symbol.for('axiljs.sensitive.observe')]` and `globalThis[Symbol.for('axiljs.sensitive.sink')]`, so lineage is active only when `@axiljs/runtime` is loaded in the process.
