/**
 * Template: microservice
 *
 * A production-shaped service in front of a flaky downstream: the downstream
 * call goes through a circuit breaker, retries with exponential backoff and a
 * per-attempt timeout, and falls back to the last known value when the circuit
 * is open. JSON logs with request ids, Prometheus metrics, W3C trace context
 * forwarded downstream, liveness/readiness probes and graceful shutdown.
 * Tests run against a fake downstream (node:http on port 0) that can be told
 * to fail or slow down.
 */

import type { ProjectTemplate, TemplateContext } from './types'

export const microserviceTemplate: ProjectTemplate = {
  id:       'microservice',
  title:    'Resilient microservice',
  summary:  'Circuit breaker, retries, metrics, tracing and probes',
  category: 'Production',
  highlights: [
    'Circuit breaker + retry + timeout on the downstream',
    'Last-known fallback while the circuit is open',
    'JSON logs with request ids, /metrics for Prometheus',
    'W3C traceparent forwarded to the downstream call',
    'Readiness probe and graceful SIGTERM drain'
  ],
  packages: ['@axiljs/core', '@axiljs/circuit', '@axiljs/observability', '@axiljs/config', '@axiljs/testing'],
  port:     3006,

  dependencies: ctx => ({
    '@axiljs/circuit':       ctx.axilRange,
    '@axiljs/config':        ctx.axilRange,
    '@axiljs/core':          ctx.axilRange,
    '@axiljs/observability': ctx.axilRange
  }),

  scripts: {
    // Builds, then starts the fake pricing service on :4000 for local runs
    'fake-downstream': 'tsc && node dist/dev/fake-pricing-server.js'
  },

  files: (ctx: TemplateContext) => ({
    'README.md': `# ${ctx.name}

A resilient [AxilJS](https://github.com/SyntaxilitY/AxilJS) microservice, created with
\`axil create ${ctx.name} --template microservice\`.

It serves stock quotes by calling a **pricing** service that is allowed to be slow,
flaky or down, and shows how to stay up when it is:

- **@axiljs/circuit**: every pricing call runs through a \`CircuitBreaker\`, which wraps
  \`retry()\` (exponential backoff with jitter), which wraps \`withTimeout()\` per attempt.
  While the circuit is open the service answers from its last known quotes instead of
  piling more load on a broken dependency.
- **@axiljs/observability**:
  - \`Logger\` writes one JSON line per event, every request line carries its \`requestId\` and \`traceId\`
  - \`MetricsRegistry\` + \`metricsHandler\` at \`/metrics\` (HTTP metrics from \`observabilityMiddleware\`,
    plus downstream attempts, retries, latency and the circuit state)
  - \`Tracer\` continues an incoming W3C \`traceparent\` and forwards it to the pricing call
  - \`HealthChecker\` at \`/health/live\` and \`/health/ready\`; readiness reports the circuit state
- **Graceful shutdown**: on SIGTERM readiness turns 503, in-flight requests finish, then the process exits
- **@axiljs/config**: every timeout, retry and breaker setting comes from \`.env\`
- **@axiljs/testing**: tests run against a fake pricing service that can be told to fail or slow down

## Run

\`\`\`bash
npm install
cp .env.example .env        # PowerShell: Copy-Item .env.example .env
npm run fake-downstream     # terminal 1: fake pricing service on http://127.0.0.1:4000
npm run dev                 # terminal 2: this service on http://localhost:3006
\`\`\`

Point \`PRICING_URL\` at the real pricing service when you have one.

Production build:

\`\`\`bash
npm run build
NODE_ENV=production npm start
\`\`\`

## Test

\`\`\`bash
npm test                    # axil test: compiles with tsc, runs src/**/*.test.ts
\`\`\`

The tests start the fake pricing service on a random port and use millisecond
timeouts and backoff, so the whole suite (retries, timeouts, an opening circuit) runs in about a second.

## Endpoints

| Method | Path                     | Description                                         | Success | Errors             |
|--------|--------------------------|-----------------------------------------------------|---------|--------------------|
| GET    | \`/\`                      | Service name, version and endpoints                 | 200     |                    |
| GET    | \`/api/quotes/:symbol\`    | Quote from pricing, or last known while circuit open | 200     | 400, 404, 502, 503, 504 |
| GET    | \`/health/live\`           | Liveness: the process is up                         | 200     |                    |
| GET    | \`/health/ready\`          | Readiness: circuit state, shutdown state            | 200     | 503                |
| GET    | \`/metrics\`               | Prometheus text format                              | 200     |                    |

What \`GET /api/quotes/:symbol\` answers:

| Situation                                   | Status | Body / headers                                                      |
|---------------------------------------------|--------|---------------------------------------------------------------------|
| Pricing answers                             | 200    | \`{ symbol, price, currency, asOf, stale: false, source: "pricing" }\` |
| Pricing fails, then recovers within retries | 200    | same; \`downstream_retries_total\` goes up                            |
| Unknown symbol (pricing says 404)           | 404    | \`NOT_FOUND\`, never retried, never counted against the circuit      |
| Every attempt fails                         | 502    | \`DOWNSTREAM_UNAVAILABLE\`                                            |
| Every attempt times out                     | 504    | \`DOWNSTREAM_TIMEOUT\`                                                |
| Circuit open, quote seen before             | 200    | last known quote, \`stale: true\`, \`source: "last-known"\`, \`x-fallback: last-known\` |
| Circuit open, quote never seen              | 503    | \`DOWNSTREAM_CIRCUIT_OPEN\` and a \`Retry-After\` header               |

Every response carries \`x-request-id\` (yours if you send a sane one, a UUID otherwise)
and \`traceparent\`. Errors share one shape:

\`\`\`json
{ "error": { "code": "DOWNSTREAM_TIMEOUT", "message": "pricing timed out after 800ms", "requestId": "4b0c..." } }
\`\`\`

### curl

\`\`\`bash
curl -i http://localhost:3006/api/quotes/AAPL
curl -i http://localhost:3006/api/quotes/NOPE                                          # 404
curl -H "x-request-id: demo-123" \\
     -H "traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01" \\
     http://localhost:3006/api/quotes/MSFT                                             # same trace id downstream
curl http://localhost:3006/health/ready
curl http://localhost:3006/metrics

# Break the fake pricing service, then watch retries, 502s, the circuit opening and the fallback
curl -X POST http://127.0.0.1:4000/__chaos -d '{"failAll":true}'
for i in 1 2 3 4 5 6; do curl -s http://localhost:3006/api/quotes/AAPL; echo; done
curl -i http://localhost:3006/health/ready                                              # 503 while open
curl -X POST http://127.0.0.1:4000/__chaos -d '{"delayMs":2000}'                        # slow instead of failing
curl -X POST http://127.0.0.1:4000/__chaos -d '{"reset":true}'
\`\`\`

### PowerShell

\`curl\` is an alias for \`Invoke-WebRequest\` in Windows PowerShell, so use \`curl.exe\` or \`Invoke-RestMethod\`:

\`\`\`powershell
Invoke-RestMethod http://localhost:3006/api/quotes/AAPL
Invoke-RestMethod http://127.0.0.1:4000/__chaos -Method Post -Body '{"failAll":true}'
1..6 | ForEach-Object { curl.exe -s http://localhost:3006/api/quotes/AAPL; "" }
curl.exe -s http://localhost:3006/metrics
\`\`\`

## How the downstream call is protected

\`\`\`
CircuitBreaker('pricing')            open after BREAKER_FAILURE_THRESHOLD failed calls
  └─ retry()                         RETRY_ATTEMPTS, exponential backoff from RETRY_DELAY_MS, jitter
       └─ withTimeout()              PRICING_TIMEOUT_MS per attempt; the fetch is aborted on timeout
            └─ fetch(PRICING_URL/prices/:symbol)   traceparent + x-request-id forwarded
\`\`\`

- Only retryable failures are retried: network errors, timeouts, 5xx and 429. A 404 is an answer, not a failure.
- The breaker counts one failure per *logical* call (after the retries), so a single flaky
  attempt never opens it. Below 10 calls in \`BREAKER_WINDOW_MS\` it opens after
  \`BREAKER_FAILURE_THRESHOLD\` failures; above that, at a 50% failure rate.
- After \`BREAKER_RESET_MS\` one probe call is let through (half-open). Success closes the circuit, failure reopens it.
- The breaker's own deadline is derived from the retry budget, so it never cuts a retry sequence short.
- State changes are logged as JSON (\`circuit state changed\`) and exported as the \`circuit_state\` gauge.
  The breaker itself also prints a plain \`[CircuitBreaker] 'pricing': CLOSED → OPEN\` line to stdout.

**Readiness and the circuit.** By default \`/health/ready\` returns 503 while the circuit is
open, so the orchestrator stops routing traffic to this instance. That is right when
other instances may still reach the dependency (a bad network path, a broken connection
pool). When every instance shares the same dependency, all of them go unready together
and the fallback is never served; set \`READINESS_FOLLOWS_CIRCUIT=false\` for that case.
The check still reports the state either way.

## Configuration

| Variable                    | Default                 | Description                                                  |
|-----------------------------|-------------------------|--------------------------------------------------------------|
| \`PORT\`                      | \`3006\`                  | HTTP port                                                    |
| \`HOST\`                      | \`127.0.0.1\`             | Bind address (\`0.0.0.0\` in containers)                       |
| \`NODE_ENV\`                  | \`development\`           | \`development\`, \`production\` or \`test\`                        |
| \`LOG_LEVEL\`                 | \`info\`                  | \`debug\`, \`info\`, \`warn\`, \`error\`, \`fatal\`                    |
| \`LOG_FORMAT\`                | \`json\`                  | \`json\` (one line per event) or \`pretty\`                      |
| \`PRICING_URL\`               | \`http://127.0.0.1:4000\` | Base URL of the pricing service                              |
| \`PRICING_TIMEOUT_MS\`        | \`800\`                   | Deadline per attempt                                         |
| \`RETRY_ATTEMPTS\`            | \`3\`                     | Attempts per call, including the first                       |
| \`RETRY_DELAY_MS\`            | \`100\`                   | First backoff delay; doubles per retry, ±25% jitter          |
| \`BREAKER_FAILURE_THRESHOLD\` | \`5\`                     | Failed calls that open the circuit                           |
| \`BREAKER_RESET_MS\`          | \`30000\`                 | Time open before a half-open probe                           |
| \`BREAKER_WINDOW_MS\`         | \`60000\`                 | Rolling window for failure counting (0 = cumulative)         |
| \`READINESS_FOLLOWS_CIRCUIT\` | \`true\`                  | \`/health/ready\` is 503 while the circuit is open             |
| \`SHUTDOWN_DRAIN_MS\`         | \`5000\`                  | After SIGTERM: report not-ready this long before closing     |
| \`SHUTDOWN_TIMEOUT_MS\`       | \`10000\`                 | Then force-close connections still busy after this long      |

## Graceful shutdown

On SIGTERM (or Ctrl+C) \`src/main.ts\`:

1. flips readiness to 503 and waits \`SHUTDOWN_DRAIN_MS\`, so the load balancer stops sending new requests,
2. stops accepting connections and closes idle keep-alive sockets,
3. waits for in-flight requests, force-closing anything left after \`SHUTDOWN_TIMEOUT_MS\`,
4. exits 0.

Keep \`SHUTDOWN_DRAIN_MS + SHUTDOWN_TIMEOUT_MS\` below the orchestrator's grace period
(Kubernetes: \`terminationGracePeriodSeconds\`, 30 s by default). \`.env.example\` sets the
drain to 0 so Ctrl+C is instant in development.

## Deploy

\`\`\`bash
axil deploy --port 3006
\`\`\`

writes \`deploy/Dockerfile\` (multi-stage: \`npm run build\`, then \`node dist/main.js\`),
\`deploy/deployment.yaml\` and \`deploy/deploy.sh\`. The generated Kubernetes probes already
point at \`/health/live\` and \`/health/ready\`. In the container set \`HOST=0.0.0.0\` and
\`PRICING_URL\` (add them to the \`env:\` list in \`deployment.yaml\`), and scrape \`/metrics\`.
Add an \`axil.scaling.json\` (\`axil capacity --init\`) to size replicas, pod resources and the
grace period from a throughput target.

## Project structure

\`\`\`
src/
  main.ts                       entry point: loadEnv, logger, listen, graceful shutdown
  app.ts                        createApp(config, options): middleware, routes, probes, metrics
  config.ts                     typed config (defineConfig)
  telemetry.ts                  Logger, MetricsRegistry and Tracer for one app
  pricing/pricing-client.ts     the protected downstream call: breaker -> retry -> timeout -> fetch
  quotes/quote-service.ts       last-known cache and the circuit-open fallback
  middleware/request-context.ts request id, server span, child logger, access log
  middleware/error-handler.ts   thrown errors -> { error: { code, message, requestId } }
  dev/fake-pricing.ts           fake downstream used by the tests (fail / slow down on demand)
  dev/fake-pricing-server.ts    the same fake on :4000 for local runs (npm run fake-downstream)
  app.test.ts                   tests
\`\`\`

## Next steps

- Replace the fake with your real dependency: only \`PricingClient.request()\` knows the wire format
- Export spans: pass an \`exporter\` to \`new Tracer()\` in \`src/telemetry.ts\` (Jaeger, Zipkin, an OTLP bridge)
- Several replicas? The last-known cache and the circuit are per process; that is usually what you want
- Need authentication and a database too? See \`axil create my-api --template rest-api\`
`,

    '.env.example': `# Server
PORT=3006
HOST=127.0.0.1
NODE_ENV=development

# Logging: debug | info | warn | error | fatal, format json | pretty
LOG_LEVEL=info
LOG_FORMAT=json

# Downstream pricing service (npm run fake-downstream starts a fake on :4000)
PRICING_URL=http://127.0.0.1:4000
PRICING_TIMEOUT_MS=800

# Retries: attempts include the first call; delay doubles per retry
RETRY_ATTEMPTS=3
RETRY_DELAY_MS=100

# Circuit breaker
BREAKER_FAILURE_THRESHOLD=5
BREAKER_RESET_MS=30000
BREAKER_WINDOW_MS=60000
READINESS_FOLLOWS_CIRCUIT=true

# Graceful shutdown (use SHUTDOWN_DRAIN_MS=5000 or more behind a load balancer)
SHUTDOWN_DRAIN_MS=0
SHUTDOWN_TIMEOUT_MS=10000
`,

    'src/config.ts': `/**
 * Typed configuration, read from environment variables.
 * loadEnv() in src/main.ts fills process.env from .env first.
 */

import { defineConfig } from '@axiljs/config'

export function loadConfig(source: Record<string, string | undefined> = process.env) {
  return defineConfig({
    PORT:                      { type: 'number',  default: 3006, min: 0, max: 65535 },
    HOST:                      { type: 'string',  default: '127.0.0.1' },
    NODE_ENV:                  { type: 'string',  default: 'development', enum: ['development', 'production', 'test'] },
    LOG_LEVEL:                 { type: 'string',  default: 'info', enum: ['debug', 'info', 'warn', 'error', 'fatal'] },
    LOG_FORMAT:                { type: 'string',  default: 'json', enum: ['json', 'pretty'] },

    // Downstream
    PRICING_URL:               { type: 'string',  default: 'http://127.0.0.1:4000' },
    PRICING_TIMEOUT_MS:        { type: 'number',  default: 800, min: 1 },
    RETRY_ATTEMPTS:            { type: 'number',  default: 3, min: 1, max: 10 },
    RETRY_DELAY_MS:            { type: 'number',  default: 100, min: 0 },

    // Circuit breaker
    BREAKER_FAILURE_THRESHOLD: { type: 'number',  default: 5, min: 1 },
    BREAKER_RESET_MS:          { type: 'number',  default: 30000, min: 1 },
    BREAKER_WINDOW_MS:         { type: 'number',  default: 60000, min: 0 },
    READINESS_FOLLOWS_CIRCUIT: { type: 'boolean', default: true },

    // Graceful shutdown
    SHUTDOWN_DRAIN_MS:         { type: 'number',  default: 5000, min: 0 },
    SHUTDOWN_TIMEOUT_MS:       { type: 'number',  default: 10000, min: 0 }
  }, source)
}

export type Config = ReturnType<typeof loadConfig>
`,

    'src/telemetry.ts': `/**
 * Logger, metrics and tracer for one app instance.
 * Nothing here is global, so every test gets a clean registry.
 */

import { Logger, MetricsRegistry, Tracer } from '@axiljs/observability'
import type { LogLevel } from '@axiljs/observability'
import type { Config } from './config.js'

export interface Telemetry {
  logger:  Logger
  metrics: MetricsRegistry
  tracer:  Tracer
}

export function createLogger(config: Config, name: string): Logger {
  return new Logger({
    name,
    level:  config.LOG_LEVEL as LogLevel,
    format: config.LOG_FORMAT === 'pretty' ? 'pretty' : 'json'
  })
}

export function createTelemetry(config: Config, name: string, logger?: Logger): Telemetry {
  const log = logger ?? createLogger(config, name)
  return {
    logger:  log,
    metrics: new MetricsRegistry(),
    // Finished spans go to the debug log instead of piling up in memory.
    // Swap the exporter for Jaeger / Zipkin / OTLP in production.
    tracer: new Tracer({
      serviceName: name,
      exporter: span => log.debug('span', {
        traceId:      span.traceId,
        spanId:       span.spanId,
        parentSpanId: span.parentSpanId,
        span:         span.name,
        status:       span.status,
        durationMs:   (span.endTime ?? Date.now()) - span.startTime
      })
    })
  }
}
`,

    'src/middleware/request-context.ts': `/**
 * Per-request context: request id, server span and a child logger.
 *
 * - x-request-id: a sane incoming id is kept, otherwise a UUID; echoed back
 * - traceparent: an incoming W3C trace is continued, otherwise a new one starts;
 *   the server span's context is returned in the response headers
 * - req.locals.log: a Logger whose every line carries requestId and traceId
 * - one "request completed" line per request (probes and /metrics at debug)
 */

import { randomUUID } from 'node:crypto'
import type { axilRequest, MiddlewareFn } from '@axiljs/core'
import type { Logger, Span, Tracer } from '@axiljs/observability'

export interface RequestLocals {
  requestId: string
  span:      Span
  log:       Logger
}

const SANE_ID = /^[A-Za-z0-9._:-]{1,128}$/
const QUIET   = new Set(['/health/live', '/health/ready', '/metrics'])

/** Typed access to what requestContext() put on req.locals. */
export function locals(req: axilRequest): RequestLocals {
  return req.locals as unknown as RequestLocals
}

export function requestContext(logger: Logger, tracer: Tracer): MiddlewareFn {
  return (req, res, next) => {
    const started  = Date.now()
    const incoming = req.headers['x-request-id']
    const candidate = Array.isArray(incoming) ? incoming[0] : incoming
    const requestId = candidate && SANE_ID.test(candidate) ? candidate : randomUUID()

    const span = tracer.startSpan('http.server', { parent: tracer.extractContext(req.headers) })
    span.setAttributes({ 'http.method': req.method, 'http.path': req.path, 'request.id': requestId })

    const log = logger.child({ requestId, traceId: span.traceId })
    Object.assign(req.locals, { requestId, span, log } satisfies RequestLocals)

    res.header('x-request-id', requestId)
    res.header('traceparent', tracer.injectContext(span).traceparent)

    res.raw.once('finish', () => {
      const status = res.raw.statusCode
      tracer.exportSpan(span.setAttribute('http.status_code', status).setStatus(status < 500 ? 'ok' : 'error').end())

      const line = { method: req.method, path: req.path, status, durationMs: Date.now() - started }
      if (QUIET.has(req.path)) log.debug('request completed', line)
      else log.info('request completed', line)
    })

    return next()
  }
}
`,

    'src/middleware/error-handler.ts': `/**
 * Error handler: turns thrown errors into one JSON shape.
 *
 *   { "error": { "code": "DOWNSTREAM_TIMEOUT", "message": "...", "requestId": "..." } }
 *
 * axilError subclasses keep their status and code (that includes the
 * downstream errors: 502, 503, 504); anything else is a 500 whose message is
 * hidden in production. 5xx are logged with the request's logger.
 */

import { axilError } from '@axiljs/core'
import type { ErrorMiddlewareFn } from '@axiljs/core'
import type { Logger } from '@axiljs/observability'

export function errorHandler(env: string, fallbackLogger: Logger): ErrorMiddlewareFn {
  // Four parameters: that is how Application.use() recognises an error handler
  return (err, req, res, _next) => {
    const known  = err instanceof axilError
    const status = known ? err.statusCode : 500
    const code   = known ? err.code : 'INTERNAL_ERROR'
    const log    = (req.locals.log as Logger | undefined) ?? fallbackLogger

    if (status >= 500) {
      log.error('request failed', { method: req.method, path: req.path, status, code, error: err.message })
    }

    // Tell clients when to come back while the circuit is open
    if (known && code === 'DOWNSTREAM_CIRCUIT_OPEN') {
      const retryAfter = (err.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds
      if (retryAfter) res.header('Retry-After', String(retryAfter))
    }

    res.status(status).json({
      error: {
        code,
        message:   !known && env === 'production' ? 'Internal server error' : err.message,
        requestId: req.locals.requestId,
        ...(known && err.details !== undefined ? { details: err.details } : {})
      }
    })
  }
}
`,

    'src/pricing/pricing-client.ts': `/**
 * The protected downstream call.
 *
 *   CircuitBreaker      one failure per logical call, fail fast while OPEN
 *     └─ retry()        exponential backoff + jitter, retryable errors only
 *          └─ withTimeout()   per attempt; the fetch is aborted when it fires
 *               └─ fetch()    traceparent + x-request-id forwarded
 *
 * Every attempt is a child span of the call span, which is a child of the
 * incoming request's span, so the downstream sees the same trace id.
 */

import { CircuitBreaker, retry, withTimeout } from '@axiljs/circuit'
import type { CircuitState } from '@axiljs/circuit'
import { axilError } from '@axiljs/core'
import type { Counter, Histogram, Logger, MetricsRegistry, Span, Tracer } from '@axiljs/observability'

export interface Quote {
  symbol:   string
  price:    number
  currency: string
  asOf:     string
}

/** A failed downstream call. 502 by default, 504 for timeouts. */
export class DownstreamError extends axilError {
  constructor(
    message: string,
    readonly retryable: boolean,
    statusCode = 502,
    code = 'DOWNSTREAM_UNAVAILABLE'
  ) {
    super(message, statusCode, code)
    this.name = 'DownstreamError'
  }
}

export interface PricingClientOptions {
  baseUrl:          string
  timeoutMs:        number
  retryAttempts:    number
  retryDelayMs:     number
  failureThreshold: number
  resetTimeoutMs:   number
  windowMs:         number
  logger:           Logger
  metrics:          MetricsRegistry
  tracer:           Tracer
}

/** What a caller passes along: the request's span, id and logger. */
export interface CallContext {
  span?:      Span
  requestId?: string
  log?:       Logger
}

const TARGET = 'pricing'
const STATE_VALUE: Record<CircuitState, number> = { CLOSED: 0, HALF_OPEN: 1, OPEN: 2 }

export class PricingClient {
  readonly breaker: CircuitBreaker
  private readonly attempts: Counter
  private readonly retries:  Counter
  private readonly latency:  Histogram
  private readonly baseUrl:  string

  constructor(private readonly options: PricingClientOptions) {
    const { metrics, logger } = options
    this.baseUrl  = options.baseUrl.replace(/\\/+$/, '')
    this.attempts = metrics.counter('downstream_requests_total', 'Downstream HTTP attempts by outcome', ['target', 'outcome'])
    this.retries  = metrics.counter('downstream_retries_total', 'Downstream attempts that were retried', ['target'])
    this.latency  = metrics.histogram('downstream_request_duration_ms', 'Downstream attempt duration in milliseconds',
      [5, 10, 25, 50, 100, 250, 500, 1000, 2500], ['target'])

    const state = metrics.gauge('circuit_state', 'Circuit breaker state: 0 closed, 1 half-open, 2 open', ['circuit'])
    state.set(STATE_VALUE.CLOSED, { circuit: TARGET })

    this.breaker = new CircuitBreaker(TARGET, {
      failureThreshold: options.failureThreshold,
      resetTimeoutMs:   options.resetTimeoutMs,
      rollingWindowMs:  options.windowMs,
      // The breaker has its own deadline; give it the whole retry budget
      requestTimeoutMs: retryBudgetMs(options)
    })

    this.breaker.on('stateChange', (to: CircuitState, from: CircuitState) => {
      state.set(STATE_VALUE[to], { circuit: TARGET })
      logger.warn('circuit state changed', { circuit: TARGET, from, to })
    })
  }

  /** Current quote, or null when pricing does not know the symbol. */
  async getQuote(symbol: string, ctx: CallContext = {}): Promise<Quote | null> {
    const { tracer } = this.options
    const span = tracer.startSpan('pricing.getQuote', ctx.span ? { parent: ctx.span } : {})
    span.setAttribute('pricing.symbol', symbol)

    try {
      const quote = await this.breaker.execute(() => retry(() => this.attempt(symbol, span, ctx), {
        attempts: this.options.retryAttempts,
        delay:    this.options.retryDelayMs,
        backoff:  'exponential',
        jitter:   true,
        retryIf:  err => err instanceof DownstreamError && err.retryable,
        onRetry:  (attempt, err, delayMs) => {
          this.retries.inc({ target: TARGET })
          span.addEvent('retry', { attempt, delayMs, error: err.message })
          ctx.log?.warn('retrying pricing call', { attempt, delayMs, error: err.message })
        }
      }))
      span.setStatus('ok')
      return quote
    } catch (err) {
      span.setStatus('error', (err as Error).message)
      throw err
    } finally {
      tracer.exportSpan(span.end())
    }
  }

  /** One HTTP attempt with its own span and deadline. */
  private async attempt(symbol: string, parent: Span, ctx: CallContext): Promise<Quote | null> {
    const { tracer, timeoutMs } = this.options
    const span       = tracer.startSpan('GET /prices/:symbol', { parent })
    const controller = new AbortController()
    const started    = Date.now()
    let outcome      = 'success'

    const headers: Record<string, string> = {
      accept: 'application/json',
      // W3C traceparent (+ B3) for this attempt's span: same trace id, new span id
      ...tracer.injectContext(span)
    }
    if (ctx.requestId) headers['x-request-id'] = ctx.requestId

    const url = this.baseUrl + '/prices/' + encodeURIComponent(symbol)
    const timeoutMessage = TARGET + ' timed out after ' + timeoutMs + 'ms'

    try {
      const quote = await withTimeout(this.request(url, headers, controller.signal, span), timeoutMs, timeoutMessage)
      outcome = quote ? 'success' : 'not_found'
      span.setStatus('ok')
      return quote
    } catch (err) {
      controller.abort()   // stop the request that withTimeout gave up on
      const error = err instanceof DownstreamError
        ? err
        : (err as Error).message === timeoutMessage
          ? new DownstreamError(timeoutMessage, true, 504, 'DOWNSTREAM_TIMEOUT')
          : new DownstreamError(TARGET + ' unreachable: ' + describe(err), true)
      outcome = error.code === 'DOWNSTREAM_TIMEOUT' ? 'timeout' : 'error'
      span.setStatus('error', error.message)
      throw error
    } finally {
      this.attempts.inc({ target: TARGET, outcome })
      this.latency.observe(Date.now() - started, { target: TARGET })
      tracer.exportSpan(span.end())
    }
  }

  /** The wire format of the pricing service lives here and nowhere else. */
  private async request(url: string, headers: Record<string, string>, signal: AbortSignal, span: Span): Promise<Quote | null> {
    const res = await fetch(url, { headers, signal })
    span.setAttribute('http.status_code', res.status)

    if (res.status === 404) {
      await res.arrayBuffer()
      return null
    }
    if (!res.ok) {
      await res.arrayBuffer()
      // 5xx and 429 are worth another try; other 4xx mean our request is wrong
      throw new DownstreamError(TARGET + ' responded ' + res.status, res.status >= 500 || res.status === 429)
    }

    const body = await res.json() as Partial<Quote>
    if (typeof body.symbol !== 'string' || typeof body.price !== 'number') {
      throw new DownstreamError(TARGET + ' returned an unexpected body', false)
    }
    return {
      symbol:   body.symbol,
      price:    body.price,
      currency: body.currency ?? 'USD',
      asOf:     body.asOf ?? new Date().toISOString()
    }
  }
}

/** Worst case for one logical call: every attempt times out, plus backoff (+25% jitter) and slack. */
function retryBudgetMs(o: PricingClientOptions): number {
  const backoff = o.retryDelayMs * (2 ** (o.retryAttempts - 1) - 1) * 1.25
  return Math.ceil(o.retryAttempts * o.timeoutMs + backoff + 1000)
}

function describe(err: unknown): string {
  const cause = (err as { cause?: { code?: string; message?: string } })?.cause
  return cause?.code ?? cause?.message ?? (err as Error)?.message ?? String(err)
}
`,

    'src/quotes/quote-service.ts': `/**
 * Quotes: live from pricing, or the last known quote while the circuit is open.
 *
 * The fallback only kicks in when the breaker refuses the call. Ordinary
 * failures (502/504) are reported as such, so clients see the truth while
 * the service is still trying.
 */

import { CircuitOpenError } from '@axiljs/circuit'
import { axilError, NotFoundError } from '@axiljs/core'
import type { Counter, MetricsRegistry } from '@axiljs/observability'
import type { CallContext, PricingClient, Quote } from '../pricing/pricing-client.js'

export interface QuoteResult extends Quote {
  stale:  boolean
  source: 'pricing' | 'last-known'
}

export class QuoteService {
  // Insertion-ordered, so the first key is the least recently refreshed
  private readonly lastKnown = new Map<string, Quote>()
  private readonly fallbacks: Counter

  constructor(
    private readonly pricing: PricingClient,
    metrics: MetricsRegistry,
    private readonly retryAfterSeconds: number,
    private readonly maxCached = 1000
  ) {
    this.fallbacks = metrics.counter('fallback_responses_total', 'Requests answered while the circuit was open', ['result'])
  }

  async get(symbol: string, ctx: CallContext): Promise<QuoteResult> {
    try {
      const quote = await this.pricing.getQuote(symbol, ctx)
      if (!quote) throw new NotFoundError('Unknown symbol: ' + symbol)
      this.remember(quote)
      return { ...quote, stale: false, source: 'pricing' }
    } catch (err) {
      if (!(err instanceof CircuitOpenError)) throw err

      const last = this.lastKnown.get(symbol)
      this.fallbacks.inc({ result: last ? 'last-known' : 'unavailable' })
      ctx.log?.warn('circuit open, serving fallback', { symbol, fallback: last ? 'last-known' : 'none' })

      if (last) return { ...last, stale: true, source: 'last-known' }
      throw new axilError('Pricing is temporarily unavailable, try again shortly', 503,
        'DOWNSTREAM_CIRCUIT_OPEN', { retryAfterSeconds: this.retryAfterSeconds })
    }
  }

  private remember(quote: Quote): void {
    this.lastKnown.delete(quote.symbol)
    this.lastKnown.set(quote.symbol, quote)
    if (this.lastKnown.size > this.maxCached) {
      const oldest = this.lastKnown.keys().next().value
      if (oldest !== undefined) this.lastKnown.delete(oldest)
    }
  }
}
`,

    'src/app.ts': `/**
 * Application factory.
 * Builds the app without listening, so tests can drive it directly.
 */

import { Application, BadRequestError } from '@axiljs/core'
import type { axilRequest } from '@axiljs/core'
import { HealthChecker, metricsHandler, observabilityMiddleware } from '@axiljs/observability'
import type { Logger } from '@axiljs/observability'
import type { Config } from './config.js'
import { createTelemetry } from './telemetry.js'
import { PricingClient } from './pricing/pricing-client.js'
import { QuoteService } from './quotes/quote-service.js'
import { errorHandler } from './middleware/error-handler.js'
import { locals, requestContext } from './middleware/request-context.js'

export const SERVICE = '${ctx.name}'
export const VERSION = '1.0.0'

/** Shared with main.ts: flipped on SIGTERM so readiness fails before the server closes. */
export interface Lifecycle {
  draining: boolean
}

export interface AppOptions {
  /** Defaults to a JSON logger at LOG_LEVEL. Tests pass one with a capturing transport. */
  logger?:    Logger
  lifecycle?: Lifecycle
}

// Letters, digits and dots (BRK.B), 1-10 characters
const SYMBOL = /^[A-Z0-9.]{1,10}$/

export function createApp(config: Config, options: AppOptions = {}): Application {
  const { logger, metrics, tracer } = createTelemetry(config, SERVICE, options.logger)
  const lifecycle = options.lifecycle ?? { draining: false }

  const pricing = new PricingClient({
    baseUrl:          config.PRICING_URL,
    timeoutMs:        config.PRICING_TIMEOUT_MS,
    retryAttempts:    config.RETRY_ATTEMPTS,
    retryDelayMs:     config.RETRY_DELAY_MS,
    failureThreshold: config.BREAKER_FAILURE_THRESHOLD,
    resetTimeoutMs:   config.BREAKER_RESET_MS,
    windowMs:         config.BREAKER_WINDOW_MS,
    logger, metrics, tracer
  })
  const quotes = new QuoteService(pricing, metrics, Math.ceil(config.BREAKER_RESET_MS / 1000))

  // ─── Health ─────────────────────────────────────────────────────────────────

  const health = new HealthChecker({ defaultTimeoutMs: 1000 })
  health.addCheck('shutdown', async () => {
    if (lifecycle.draining) throw new Error('draining: shutting down')
  })
  health.addCheck('pricing-circuit', async () => {
    const stats = pricing.breaker.getStats()
    if (stats.state === 'OPEN' && config.READINESS_FOLLOWS_CIRCUIT) {
      throw new Error('circuit pricing is OPEN (' + stats.failureCount + ' failures)')
    }
    return { message: 'circuit ' + stats.state, details: { ...stats } }
  })

  // ─── App ────────────────────────────────────────────────────────────────────

  const app = new Application({
    server:  { port: config.PORT, host: config.HOST, methodNotAllowed: true },
    env:     config.NODE_ENV,
    logging: false   // the JSON access log in requestContext() replaces core's pretty logger
  })

  app.use(requestContext(logger, tracer))
  app.use(observabilityMiddleware({ metrics, pathLabel }))

  app.get('/', (_req, res) => {
    res.success({
      service: SERVICE,
      version: VERSION,
      endpoints: [
        'GET /api/quotes/:symbol',
        'GET /health/live',
        'GET /health/ready',
        'GET /metrics'
      ]
    }, 'Service info')
  })

  app.get('/api/quotes/:symbol', async (req, res) => {
    const symbol = req.params.symbol.toUpperCase()
    if (!SYMBOL.test(symbol)) throw new BadRequestError('symbol must be 1-10 letters, digits or dots')

    const { requestId, span, log } = locals(req)
    const quote = await quotes.get(symbol, { requestId, span, log })

    if (quote.stale) res.header('x-fallback', 'last-known')
    res.success(quote, quote.stale ? 'Last known quote (pricing unavailable)' : 'Quote')
  })

  app.get('/health/live',  health.livenessHandler())
  app.get('/health/ready', health.readinessHandler())
  app.get('/metrics',      metricsHandler(metrics))

  app.use(errorHandler(config.NODE_ENV, logger))

  return app
}

/** Route templates as metric labels: one series per route, not per symbol. */
const KNOWN_PATHS = new Set(['/', '/health/live', '/health/ready', '/metrics'])

function pathLabel(req: axilRequest): string {
  if (/^\\/api\\/quotes\\/[^/]+$/.test(req.path)) return '/api/quotes/:symbol'
  return KNOWN_PATHS.has(req.path) ? req.path : 'unmatched'
}
`,

    'src/main.ts': `/**
 * ${ctx.name}
 * Entry point: load .env, build the app, listen, drain on SIGTERM.
 */

import { loadEnv } from '@axiljs/config'
import { createApp, SERVICE } from './app.js'
import type { Lifecycle } from './app.js'
import { loadConfig } from './config.js'
import { createLogger } from './telemetry.js'

loadEnv()

const config    = loadConfig()
const logger    = createLogger(config, SERVICE)
const lifecycle: Lifecycle = { draining: false }
const app       = createApp(config, { logger, lifecycle })

// core prints a colored startup banner on listen; keep stdout pure JSON in production
const print = console.log
if (config.NODE_ENV === 'production') console.log = () => {}
const { port, host } = await app.listen().finally(() => { console.log = print })
logger.info('listening', { port, host, pricing: config.PRICING_URL, env: config.NODE_ENV })

let stopping = false

async function shutdown(signal: string): Promise<void> {
  if (stopping) return
  stopping = true

  // 1. Fail readiness so the load balancer stops sending new requests
  lifecycle.draining = true
  logger.info('shutdown: draining', { signal, drainMs: config.SHUTDOWN_DRAIN_MS })
  await new Promise(resolve => setTimeout(resolve, config.SHUTDOWN_DRAIN_MS))

  // 2. Stop accepting, drop idle keep-alive sockets, let in-flight requests finish
  const server = app.getServer()
  const force  = setTimeout(() => {
    logger.warn('shutdown: forcing open connections closed', { timeoutMs: config.SHUTDOWN_TIMEOUT_MS })
    server?.closeAllConnections()
  }, config.SHUTDOWN_TIMEOUT_MS)
  force.unref()
  server?.closeIdleConnections()

  try {
    await app.close()
    logger.info('shutdown: complete')
    process.exit(0)
  } catch (err) {
    logger.error('shutdown: failed', { error: (err as Error).message })
    process.exit(1)
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT',  () => void shutdown('SIGINT'))
`,

    'src/dev/fake-pricing.ts': `/**
 * A fake pricing service on node:http, for tests and local runs.
 *
 *   GET  /prices/:symbol   { symbol, price, currency, asOf } or 404
 *   POST /__chaos          { "failNext": 2 } | { "failAll": true } | { "delayMs": 500 } | { "reset": true }
 *
 * Tests drive the same switches directly: failNext(), failAll(), delay(), reset().
 * Every request is recorded (path + headers) so tests can assert on what was sent.
 */

import { createServer } from 'node:http'
import type { IncomingHttpHeaders, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

const PRICES: Record<string, number> = {
  'AAPL':  189.84,
  'MSFT':  411.22,
  'NVDA':  124.6,
  'AMZN':  178.15,
  'BRK.B': 412.9
}

export interface RecordedRequest {
  method:  string
  path:    string
  headers: IncomingHttpHeaders
}

export interface FakePricing {
  readonly url:      string
  readonly requests: RecordedRequest[]
  /** Fail the next \`count\` price requests with \`status\`. */
  failNext(count: number, status?: number): void
  /** Fail every price request until reset(). */
  failAll(status?: number): void
  /** Answer every price request after \`ms\` until reset(). */
  delay(ms: number): void
  /** Healthy again, and forget recorded requests. */
  reset(): void
  close(): Promise<void>
}

interface Chaos {
  failNext?: number
  failAll?:  boolean
  delayMs?:  number
  status?:   number
  reset?:    boolean
}

export async function startFakePricing(port = 0, host = '127.0.0.1'): Promise<FakePricing> {
  const requests: RecordedRequest[] = []
  let failCount  = 0
  let failAlways = false
  let failStatus = 503
  let delayMs    = 0

  const reset = () => {
    failCount = 0
    failAlways = false
    failStatus = 503
    delayMs = 0
    requests.length = 0
  }

  const server = createServer((req, res) => {
    const path = (req.url ?? '/').split('?')[0]

    if (req.method === 'POST' && path === '/__chaos') {
      let raw = ''
      req.on('data', chunk => { raw += chunk })
      req.on('end', () => {
        let chaos: Chaos
        try {
          chaos = JSON.parse(raw || '{}') as Chaos
        } catch {
          return send(res, 400, { error: 'invalid JSON' })
        }
        if (chaos.reset) reset()
        if (chaos.status) failStatus = chaos.status
        if (chaos.failNext !== undefined) failCount = chaos.failNext
        if (chaos.failAll !== undefined) failAlways = chaos.failAll
        if (chaos.delayMs !== undefined) delayMs = chaos.delayMs
        send(res, 200, { failNext: failCount, failAll: failAlways, delayMs, status: failStatus })
      })
      return
    }

    requests.push({ method: req.method ?? 'GET', path, headers: req.headers })

    const respond = () => {
      if (failAlways || failCount > 0) {
        if (failCount > 0) failCount--
        return send(res, failStatus, { error: 'injected failure' })
      }
      const match  = /^\\/prices\\/([^/]+)$/.exec(path)
      const symbol = match ? decodeURIComponent(match[1]).toUpperCase() : ''
      const price  = PRICES[symbol]
      if (price === undefined) return send(res, 404, { error: 'unknown symbol' })
      send(res, 200, { symbol, price, currency: 'USD', asOf: new Date().toISOString() })
    }

    if (delayMs <= 0) return respond()
    const timer = setTimeout(respond, delayMs)
    res.on('close', () => clearTimeout(timer))   // caller gave up (timeout → abort)
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => resolve())
  })
  const address = server.address() as AddressInfo

  return {
    url: 'http://' + host + ':' + address.port,
    requests,
    failNext(count, status = 503) { failCount = count; failStatus = status },
    failAll(status = 503) { failAlways = true; failStatus = status },
    delay(ms) { delayMs = ms },
    reset,
    close() {
      server.closeAllConnections()
      return new Promise(resolve => server.close(() => resolve()))
    }
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  if (res.writableEnded || res.destroyed) return
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}
`,

    'src/dev/fake-pricing-server.ts': `/**
 * Runs the fake pricing service for local development:
 *   npm run fake-downstream        (FAKE_PRICING_PORT, default 4000)
 */

import { startFakePricing } from './fake-pricing.js'

const port = Number(process.env.FAKE_PRICING_PORT ?? 4000)
const fake = await startFakePricing(port)

console.log('fake pricing service on ' + fake.url)
console.log('  GET  ' + fake.url + '/prices/AAPL')
console.log('  POST ' + fake.url + '/__chaos   {"failNext":3} | {"failAll":true} | {"delayMs":2000} | {"reset":true}')

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    await fake.close()
    process.exit(0)
  })
}
`,

    'src/app.test.ts': `import { describe, it, expect, beforeAll, afterAll, beforeEach, createTestClient } from '@axiljs/testing'
import { Logger } from '@axiljs/observability'
import type { LogEntry } from '@axiljs/observability'
import { createApp, SERVICE } from './app.js'
import type { AppOptions } from './app.js'
import { loadConfig } from './config.js'
import { startFakePricing } from './dev/fake-pricing.js'
import type { FakePricing } from './dev/fake-pricing.js'

const TRACE_ID  = '4bf92f3577b34da6a3ce929d0e0e4736'
const PARENT_ID = '00f067aa0ba902b7'

describe('${ctx.name}', () => {
  let fake: FakePricing

  beforeAll(async () => { fake = await startFakePricing() })
  afterAll(async () => { await fake.close() })
  beforeEach(() => fake.reset())

  // A fresh app (and so a fresh circuit and metrics registry) per test.
  // Millisecond timeouts and backoff keep the suite fast.
  function setup(env: Record<string, string> = {}, options: AppOptions = {}) {
    const config = loadConfig({
      NODE_ENV:                  'test',
      LOG_LEVEL:                 'fatal',
      PRICING_URL:               fake.url,
      PRICING_TIMEOUT_MS:        '60',
      RETRY_ATTEMPTS:            '3',
      RETRY_DELAY_MS:            '5',
      BREAKER_FAILURE_THRESHOLD: '3',
      BREAKER_RESET_MS:          '60000',
      ...env
    })
    return createTestClient(createApp(config, options))
  }

  /** Make pricing fail until the circuit opens (3 failed calls). */
  async function tripCircuit(client: ReturnType<typeof setup>, symbol = 'AAPL') {
    fake.failAll()
    for (let i = 0; i < 3; i++) {
      const res = await client.get('/api/quotes/' + symbol)
      expect(res.status).toBe(502)
      expect(res.body.error.code).toBe('DOWNSTREAM_UNAVAILABLE')
    }
  }

  describe('GET /api/quotes/:symbol', () => {
    it('returns a live quote from the downstream', async () => {
      const res = await setup().get('/api/quotes/aapl')
      expect(res.status).toBe(200)
      expect(res.body.data).toMatchObject({ symbol: 'AAPL', price: 189.84, currency: 'USD', stale: false, source: 'pricing' })
      expect(fake.requests).toHaveLength(1)
      expect(fake.requests[0].path).toBe('/prices/AAPL')
    })

    it('passes a downstream 404 through without retrying', async () => {
      const res = await setup().get('/api/quotes/NOPE')
      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('NOT_FOUND')
      expect(fake.requests).toHaveLength(1)
    })

    it('rejects an invalid symbol without calling the downstream', async () => {
      const res = await setup().get('/api/quotes/' + encodeURIComponent('<script>'))
      expect(res.status).toBe(400)
      expect(fake.requests).toHaveLength(0)
    })
  })

  describe('request ids and logs', () => {
    it('echoes x-request-id, forwards it downstream and logs it as JSON fields', async () => {
      const entries: LogEntry[] = []
      const logger = new Logger({ name: 'test', level: 'info', format: 'json', transports: [{ write: e => { entries.push(e) } }] })

      const res = await setup({}, { logger }).get('/api/quotes/MSFT').set('x-request-id', 'req-abc-123')
      expect(res.status).toBe(200)
      expect(res.headers['x-request-id']).toBe('req-abc-123')
      expect(fake.requests[0].headers['x-request-id']).toBe('req-abc-123')

      const line = entries.find(e => e.message === 'request completed')
      expect(line).toBeDefined()
      expect(line!.requestId).toBe('req-abc-123')
      expect(line!.status).toBe(200)
      expect(line!.path).toBe('/api/quotes/MSFT')
    })

    it('generates a request id when none (or a malformed one) is sent', async () => {
      const res = await setup().get('/api/quotes/MSFT').set('x-request-id', 'bad id with spaces')
      expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)
    })
  })

  describe('tracing', () => {
    it('continues the incoming trace and forwards traceparent to the downstream', async () => {
      const res = await setup().get('/api/quotes/NVDA').set('traceparent', '00-' + TRACE_ID + '-' + PARENT_ID + '-01')
      expect(res.status).toBe(200)

      const sent = String(fake.requests[0].headers['traceparent'])
      const match = /^00-([0-9a-f]{32})-([0-9a-f]{16})-01$/.exec(sent)
      expect(match).not.toBeNull()
      expect(match![1]).toBe(TRACE_ID)        // same trace
      expect(match![2]).not.toBe(PARENT_ID)   // new span for the downstream attempt
      expect(String(res.headers['traceparent']).startsWith('00-' + TRACE_ID + '-')).toBe(true)
    })

    it('starts a new trace when the caller sends none', async () => {
      const res = await setup().get('/api/quotes/NVDA')
      expect(String(res.headers['traceparent'])).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/)
      expect(String(fake.requests[0].headers['traceparent']).split('-')[1])
        .toBe(String(res.headers['traceparent']).split('-')[1])
    })
  })

  describe('retry and timeout', () => {
    it('retries a transient failure and recovers', async () => {
      fake.failNext(2)
      const client = setup()
      const res = await client.get('/api/quotes/AMZN')
      expect(res.status).toBe(200)
      expect(res.body.data.price).toBe(178.15)
      expect(fake.requests).toHaveLength(3)

      const metrics = await client.get('/metrics')
      expect(metrics.text).toContain('downstream_retries_total{target="pricing"} 2')
      expect(metrics.text).toContain('downstream_requests_total{outcome="error",target="pricing"} 2')
      expect(metrics.text).toContain('downstream_requests_total{outcome="success",target="pricing"} 1')
    })

    it('gives up with 502 when every attempt fails', async () => {
      fake.failNext(3)
      const res = await setup().get('/api/quotes/AMZN')
      expect(res.status).toBe(502)
      expect(res.body.error.code).toBe('DOWNSTREAM_UNAVAILABLE')
      expect(res.body.error.requestId).toBeDefined()
      expect(fake.requests).toHaveLength(3)
    })

    it('times out a slow downstream with 504', async () => {
      fake.delay(1000)
      const res = await setup().get('/api/quotes/AAPL')
      expect(res.status).toBe(504)
      expect(res.body.error.code).toBe('DOWNSTREAM_TIMEOUT')
      expect(fake.requests).toHaveLength(3)   // every attempt timed out
    })
  })

  describe('circuit breaker', () => {
    it('opens after repeated failures and serves the last known quote', async () => {
      const client = setup()
      expect((await client.get('/api/quotes/AAPL')).status).toBe(200)   // remembered

      await tripCircuit(client)
      const calls = fake.requests.length

      const res = await client.get('/api/quotes/AAPL')
      expect(res.status).toBe(200)
      expect(res.headers['x-fallback']).toBe('last-known')
      expect(res.body.data).toMatchObject({ symbol: 'AAPL', price: 189.84, stale: true, source: 'last-known' })
      expect(fake.requests.length).toBe(calls)   // failed fast, no downstream call
    })

    it('answers 503 with Retry-After for a symbol it has never seen', async () => {
      const client = setup()
      await tripCircuit(client)

      const res = await client.get('/api/quotes/MSFT')
      expect(res.status).toBe(503)
      expect(res.body.error.code).toBe('DOWNSTREAM_CIRCUIT_OPEN')
      expect(res.headers['retry-after']).toBe('60')

      const metrics = await client.get('/metrics')
      expect(metrics.text).toContain('circuit_state{circuit="pricing"} 2')
      expect(metrics.text).toContain('fallback_responses_total{result="unavailable"} 1')
    })
  })

  describe('health', () => {
    it('is live and ready while the circuit is closed', async () => {
      const client = setup()
      const live = await client.get('/health/live')
      expect(live.status).toBe(200)
      expect(live.body.status).toBe('alive')

      const ready = await client.get('/health/ready')
      expect(ready.status).toBe(200)
      expect(ready.body.ready).toBe(true)
      expect(ready.body.checks['pricing-circuit'].message).toBe('circuit CLOSED')
    })

    it('turns unready while the circuit is open, but stays live', async () => {
      const client = setup()
      await tripCircuit(client)

      const ready = await client.get('/health/ready')
      expect(ready.status).toBe(503)
      expect(ready.body.ready).toBe(false)
      expect(ready.body.checks['pricing-circuit'].status).toBe('unhealthy')
      expect(ready.body.checks['pricing-circuit'].message).toContain('OPEN')

      expect((await client.get('/health/live')).status).toBe(200)
    })

    it('stays ready with an open circuit when READINESS_FOLLOWS_CIRCUIT=false', async () => {
      const client = setup({ READINESS_FOLLOWS_CIRCUIT: 'false' })
      await tripCircuit(client)

      const ready = await client.get('/health/ready')
      expect(ready.status).toBe(200)
      expect(ready.body.checks['pricing-circuit'].message).toBe('circuit OPEN')
    })

    it('turns unready while draining for shutdown', async () => {
      const lifecycle = { draining: false }
      const client = setup({}, { lifecycle })
      expect((await client.get('/health/ready')).status).toBe(200)

      lifecycle.draining = true
      const ready = await client.get('/health/ready')
      expect(ready.status).toBe(503)
      expect(ready.body.checks.shutdown.status).toBe('unhealthy')
    })
  })

  describe('metrics and service info', () => {
    it('exposes HTTP and downstream metrics in Prometheus format', async () => {
      const client = setup()
      await client.get('/api/quotes/AAPL')

      const res = await client.get('/metrics')
      expect(res.status).toBe(200)
      expect(String(res.headers['content-type'])).toContain('text/plain')
      expect(res.text).toContain('http_requests_total{method="GET",path="/api/quotes/:symbol",status="200"} 1')
      expect(res.text).toContain('# TYPE downstream_request_duration_ms histogram')
      expect(res.text).toContain('circuit_state{circuit="pricing"} 0')
    })

    it('describes the service and returns JSON 404s', async () => {
      const client = setup()
      const info = await client.get('/')
      expect(info.status).toBe(200)
      expect(info.body.data.service).toBe(SERVICE)

      const missing = await client.get('/nope')
      expect(missing.status).toBe(404)
      expect(missing.body.error.code).toBe('NOT_FOUND')
    })
  })
})
`
  }),

  nextSteps: () => [
    ['npm test', 'Fake downstream: retries, timeouts, circuit'],
    ['npm run fake-downstream', 'Fake pricing service on :4000 (own terminal)']
  ]
}
