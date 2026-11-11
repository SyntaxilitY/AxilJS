# @axiljs/observability

Structured logging, Prometheus metrics, distributed tracing, and health checks.

Part of the [AxilJS](https://github.com/SyntaxilitY/AxilJS) ecosystem.

## Install

```bash
npm install @axiljs/observability
```

## Usage

```typescript
import { Logger, MetricsRegistry, HealthChecker,
         observabilityMiddleware, metricsHandler } from '@axiljs/observability'

const logger  = new Logger({ name: 'MyApp' })
const metrics = new MetricsRegistry()
const health  = new HealthChecker()

health.addCheck('database', async () => ({ message: 'Connected' }))

app.use(observabilityMiddleware({ metrics }))
app.get('/health',   health.handler())
app.get('/metrics',  metricsHandler(metrics))
```

## Trace propagation

`observabilityMiddleware` continues an incoming W3C `traceparent` (or B3
headers) and returns the new span in the response `traceparent`. Set
`propagate: false` to always start a new trace. Manually:

```typescript
const span = tracer.startSpan('job', { parent: tracer.extractContext(headers) })
```

### Child spans in handlers

With a `tracer`, the middleware exposes the request's server span to later
middleware and handlers:

| `req.locals` key | Value |
|---|---|
| `span` | the server `Span` (`getRequestSpan(req)` returns it typed) |
| `tracer` | the `Tracer` passed to the middleware |
| `traceContext` | `{ traceId, spanId }` of the server span (`getTraceContext(req)`) |

```typescript
import { getRequestSpan } from '@axiljs/observability'

app.get('/orders/:id', async (req, res) => {
  const parent = getRequestSpan(req)

  // Child span around local work (ended and exported automatically)
  const order = await tracer.trace('db.order', () => db.find(req.params.id), parent)

  // Propagate to a downstream service
  const child = tracer.startSpan('http.inventory', { parent })
  await fetch(inventoryUrl, { headers: tracer.injectContext(child) })
  tracer.exportSpan(child.end())

  res.success(order)
})
```

## Route labels

The `path` metric label is the raw path by default. Use `pathLabel` to avoid
high-cardinality labels:

```typescript
app.use(observabilityMiddleware({ metrics, pathLabel: (req) => req.path.replace(/\/\d+/g, '/:id') }))
```

## Health check timeouts

Each check times out after 5000ms by default and is reported `unhealthy`, so a
hung dependency can't hang `/health`.

```typescript
const health = new HealthChecker({ defaultTimeoutMs: 3000 })
health.addCheck('db', () => db.ping(), { timeoutMs: 1000 }) // 0 disables
```

## Metric registration

Registering a name again with the same type returns the existing metric
(original help/labels/buckets are kept). Registering it with a different type
throws. HELP text is escaped per the Prometheus text format.

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
