# @axiljs/runtime

Makes `@axiljs/decorator` metadata actually run: a per-request context, interceptors for `tRetry` / `tTimeout` / `tAudit`, and redaction driven by `tRedact` / `tSensitive`.

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
