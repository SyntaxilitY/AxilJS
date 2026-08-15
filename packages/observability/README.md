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

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
