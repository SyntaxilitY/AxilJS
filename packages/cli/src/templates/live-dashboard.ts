/**
 * Template: live-dashboard
 *
 * Live app and business metrics: a stats snapshot every second over
 * Server-Sent Events, a Prometheus /metrics endpoint, health probes and a
 * dependency-free browser dashboard served from public/.
 */

import type { ProjectTemplate, TemplateContext } from './types'

export const liveDashboardTemplate: ProjectTemplate = {
  id:       'live-dashboard',
  title:    'Live Dashboard',
  summary:  'SSE live metrics, Prometheus /metrics and health probes',
  category: 'Realtime',
  highlights: [
    'Stats every second over Server-Sent Events',
    'Requests/s, p95 latency, memory, event-loop lag',
    'Prometheus /metrics with custom business counters',
    'Liveness and readiness probes with HealthChecker',
    'Dashboard in public/: vanilla JS + SVG sparklines'
  ],
  packages: ['@axiljs/core', '@axiljs/observability', '@axiljs/validation', '@axiljs/config', '@axiljs/testing'],
  port:     3008,

  dependencies: ctx => ({
    '@axiljs/config':        ctx.axilRange,
    '@axiljs/core':          ctx.axilRange,
    '@axiljs/observability': ctx.axilRange,
    '@axiljs/validation':    ctx.axilRange
  }),

  files: (ctx: TemplateContext) => ({
    'README.md': `# ${ctx.name}

A live metrics dashboard on [AxilJS](https://github.com/SyntaxilitY/AxilJS), created with
\`axil create ${ctx.name} --template live-dashboard\`.

One process serves three views of the same numbers:

- **Live**: \`GET /events\` streams a stats snapshot every second over Server-Sent Events
  (\`createSSE\` from **@axiljs/core**); \`public/index.html\` draws it with vanilla JS and SVG sparklines
- **Prometheus**: \`GET /metrics\` (**@axiljs/observability** \`MetricsRegistry\` + \`metricsHandler\`),
  with HTTP metrics from \`observabilityMiddleware\` and your own business counters
- **Health**: \`GET /health/live\` and \`/health/ready\` (\`HealthChecker\`) with event-loop, memory and
  collector checks, ready for Kubernetes probes or a load balancer

Snapshots contain requests/s, average and p95 latency, 5xx rate, heap/RSS, CPU, event-loop delay
(\`monitorEventLoopDelay\`), business totals and the number of open dashboards.

## Run

\`\`\`bash
npm install
cp .env.example .env        # PowerShell: Copy-Item .env.example .env
npm run dev                 # http://localhost:3008
\`\`\`

Open http://localhost:3008 and press the buttons: orders, sign-ups and request bursts show up
on the tiles within a second.

Production build:

\`\`\`bash
npm run build
npm start
\`\`\`

## Test

\`\`\`bash
npm test                    # axil test: compiles with tsc, runs src/**/*.test.ts
\`\`\`

## Endpoints

| Method | Path            | Description                                             | Success | Errors   |
|--------|-----------------|---------------------------------------------------------|---------|----------|
| GET    | \`/\`             | The dashboard (\`public/index.html\`)                     | 200     |          |
| GET    | \`/events\`       | SSE stream of \`stats\` events, one per interval          | 200     | 503      |
| GET    | \`/api/stats\`    | The latest snapshot as JSON                             | 200     |          |
| POST   | \`/api/orders\`   | Record an order \`{ amount, channel? }\`                  | 201     | 422      |
| POST   | \`/api/signups\`  | Record a sign-up                                        | 201     |          |
| GET    | \`/metrics\`      | Prometheus text format                                  | 200     |          |
| GET    | \`/health\`       | All checks with details                                 | 200     | 503      |
| GET    | \`/health/live\`  | Liveness: the process answers                           | 200     |          |
| GET    | \`/health/ready\` | Readiness: event loop, memory and collector checks      | 200     | 503      |
| GET    | \`/api\`          | Service name, version and endpoints                     | 200     |          |

\`POST /api/orders\` body:

| Field     | Type   | Rules                                           |
|-----------|--------|-------------------------------------------------|
| \`amount\`  | number | dollars, > 0, at most 100000, two decimals max  |
| \`channel\` | string | \`web\`, \`mobile\` or \`partner\` (default \`web\`)    |

\`/events\` answers 503 once \`MAX_STREAMS\` dashboards are connected.

### The stream

\`\`\`text
GET /events
Content-Type: text/event-stream

: connected

id: 42
event: stats
data: {"seq":42,"at":"2026-01-01T12:00:00.000Z","uptimeSec":42,"http":{"rps":12.5,"avgMs":1.8,"p95Ms":4.2,"errorRate":0,"total":512},"process":{"rssMb":61.3,"heapUsedMb":9.8,"heapTotalMb":15.2,"cpuPercent":2.1,"eventLoopLagMs":10.2,"eventLoopLagP99Ms":11.5},"business":{"orders":3,"revenue":129.97,"signups":1},"streams":1}
\`\`\`

The first event is sent on connect, then one every \`SAMPLE_INTERVAL_MS\`; comment lines
(\`: heartbeat\`) every 15 s keep proxies from closing a quiet connection. In the browser:

\`\`\`js
const source = new EventSource('/events')
source.addEventListener('stats', e => console.log(JSON.parse(e.data)))
\`\`\`

### Metrics

| Metric                          | Type      | Labels                     | Source                      |
|---------------------------------|-----------|----------------------------|-----------------------------|
| \`http_requests_total\`           | counter   | \`method\`, \`path\`, \`status\` | \`observabilityMiddleware\`   |
| \`http_request_duration_ms\`      | histogram | \`method\`, \`path\`           | \`observabilityMiddleware\`   |
| \`http_active_requests\`          | gauge     |                            | \`observabilityMiddleware\`   |
| \`shop_orders_total\`             | counter   | \`channel\`                  | \`POST /api/orders\`          |
| \`shop_revenue_cents_total\`      | counter   | \`channel\`                  | \`POST /api/orders\`          |
| \`shop_signups_total\`            | counter   |                            | \`POST /api/signups\`         |
| \`process_resident_memory_bytes\` | gauge     |                            | collector / each scrape     |
| \`nodejs_heap_used_bytes\`        | gauge     |                            | collector / each scrape     |
| \`nodejs_eventloop_lag_p99_ms\`   | gauge     |                            | collector, per interval     |
| \`dashboard_streams\`             | gauge     |                            | open \`/events\` streams      |

The \`path\` label is the route for known paths and \`other\` for everything else, so random 404s
cannot create unbounded series. Revenue is counted in cents so totals stay exact.

### curl

\`\`\`bash
curl -N http://localhost:3008/events                 # Ctrl+C to stop
curl -X POST http://localhost:3008/api/orders -H "Content-Type: application/json" -d '{"amount":49.90,"channel":"mobile"}'
curl -X POST http://localhost:3008/api/signups
curl http://localhost:3008/metrics
curl -i http://localhost:3008/health/ready
\`\`\`

### PowerShell

\`\`\`powershell
Invoke-RestMethod http://localhost:3008/api/orders -Method Post -ContentType 'application/json' -Body '{"amount":49.90,"channel":"mobile"}'
Invoke-RestMethod http://localhost:3008/api/stats | ConvertTo-Json -Depth 5
curl.exe -N http://localhost:3008/events
\`\`\`

## Configuration

| Variable             | Default       | Description                                            |
|----------------------|---------------|--------------------------------------------------------|
| \`PORT\`               | \`3008\`        | HTTP port                                              |
| \`HOST\`               | \`127.0.0.1\`   | Bind address (\`0.0.0.0\` in containers)                 |
| \`NODE_ENV\`           | \`development\` | \`development\`, \`production\` or \`test\`                  |
| \`CORS_ORIGIN\`        | \`*\`           | \`*\` or a comma-separated list of origins               |
| \`SAMPLE_INTERVAL_MS\` | \`1000\`        | Snapshot interval for \`/events\`                        |
| \`MAX_STREAMS\`        | \`100\`         | Open \`/events\` connections allowed                     |
| \`LAG_THRESHOLD_MS\`   | \`200\`         | \`/health/ready\` fails when event-loop p99 is above     |
| \`HEAP_LIMIT_MB\`      | \`1024\`        | \`/health/ready\` fails when heap used is above          |

## Project structure

\`\`\`
public/
  index.html                  the dashboard (vanilla JS, EventSource, SVG sparklines)
src/
  main.ts                     entry point: loadEnv, start sampling, listen, graceful shutdown
  app.ts                      createApp(config, telemetry): routes, SSE, metrics, health
  config.ts                   typed config (defineConfig)
  telemetry/index.ts          createTelemetry(): registry, collector, health checks, streams
  telemetry/collector.ts      StatsCollector: snapshot every interval, process gauges
  telemetry/request-stats.ts  requests/s and latency per window (middleware)
  telemetry/business.ts       business counters (orders, revenue, sign-ups)
  middleware/error-handler.ts thrown errors -> { error: { code, message, details } }
  app.test.ts                 routes, /metrics content and health via createTestClient
  events.test.ts              the SSE stream over a real connection on a random port
  telemetry/telemetry.test.ts collector and request-stats unit tests
\`\`\`

\`createApp()\` never listens, so most tests use \`createTestClient(app)\`. The SSE test listens
on port 0 and reads the stream with \`node:http\`.

## Notes

- \`telemetry.stop()\` ends every open stream: \`server.close()\` waits for open connections, and an
  SSE connection never ends by itself. \`main.ts\` calls it on SIGINT/SIGTERM.
- Stats are per process. Behind a load balancer each instance reports its own; aggregate in
  Prometheus (scrape every instance) rather than in the dashboard.
- Put \`/metrics\` behind your network or an auth middleware in production; it reveals traffic data.

## Next steps

- Record your own business events: add a counter in \`src/telemetry/business.ts\` and a field to
  the snapshot in \`src/telemetry/collector.ts\`
- Add readiness checks for your dependencies with \`health.addCheck('database', async () => { ... })\`
- Point Prometheus at \`/metrics\` and build long-term dashboards in Grafana
`,

    '.env.example': `# Server
PORT=3008
HOST=127.0.0.1
NODE_ENV=development

# CORS: "*" or a comma-separated list of origins
CORS_ORIGIN=*

# Live stats: snapshot interval and open /events streams allowed
SAMPLE_INTERVAL_MS=1000
MAX_STREAMS=100

# /health/ready turns 503 above these
LAG_THRESHOLD_MS=200
HEAP_LIMIT_MB=1024
`,

    'public/index.html': `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${ctx.name} · live dashboard</title>
  <style>
    :root { --bg: #0f1115; --panel: #171a21; --line: #262b36; --text: #e6e8ee; --muted: #8a93a6; --accent: #4f8cff; --good: #22c55e; --bad: #ff6b6b; }
    @media (prefers-color-scheme: light) {
      :root { --bg: #f5f6f8; --panel: #fff; --line: #e1e4ea; --text: #1b1f27; --muted: #667085; --accent: #2563eb; --good: #16a34a; --bad: #c62828; }
    }
    * { box-sizing: border-box; }
    body { margin: 0; font: 15px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); }
    header { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--line); background: var(--panel); }
    header h1 { font-size: 16px; margin: 0; flex: 1; }
    .status { font-size: 13px; color: var(--muted); }
    .status.live::before { content: "● "; color: var(--good); }
    .status.down::before { content: "● "; color: var(--bad); }
    main { padding: 16px; max-width: 1100px; margin: 0 auto; }
    h2 { font-size: 12px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 20px 0 8px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
    .tile { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 12px; }
    .tile .label { font-size: 13px; color: var(--muted); }
    .tile .value { font-size: 26px; font-variant-numeric: tabular-nums; }
    .tile .unit { font-size: 13px; color: var(--muted); margin-left: 4px; }
    .tile svg { display: block; width: 100%; height: 36px; margin-top: 6px; }
    .tile polyline { fill: none; stroke: var(--accent); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
    .actions { display: flex; flex-wrap: wrap; gap: 8px; }
    button { padding: 8px 14px; border: 1px solid var(--line); border-radius: 8px; background: var(--panel); color: var(--text); font: inherit; cursor: pointer; }
    button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
    footer { color: var(--muted); font-size: 13px; padding: 16px; text-align: center; }
    a { color: var(--accent); }
  </style>
</head>
<body>
  <header>
    <h1>${ctx.name}</h1>
    <span id="status" class="status down">connecting…</span>
    <span id="uptime" class="status"></span>
  </header>

  <main>
    <h2>HTTP</h2>
    <div class="grid">
      <div class="tile"><div class="label">Requests / s</div><span class="value" id="rps">–</span><svg id="spark-rps" viewBox="0 0 60 36" preserveAspectRatio="none"><polyline points=""/></svg></div>
      <div class="tile"><div class="label">Latency p95</div><span class="value" id="p95">–</span><span class="unit">ms</span><svg id="spark-p95" viewBox="0 0 60 36" preserveAspectRatio="none"><polyline points=""/></svg></div>
      <div class="tile"><div class="label">Error rate (5xx)</div><span class="value" id="errors">–</span><span class="unit">%</span></div>
      <div class="tile"><div class="label">Requests total</div><span class="value" id="total">–</span></div>
    </div>

    <h2>Process</h2>
    <div class="grid">
      <div class="tile"><div class="label">Heap used</div><span class="value" id="heap">–</span><span class="unit">MB</span><svg id="spark-heap" viewBox="0 0 60 36" preserveAspectRatio="none"><polyline points=""/></svg></div>
      <div class="tile"><div class="label">Event-loop lag p99</div><span class="value" id="lag">–</span><span class="unit">ms</span><svg id="spark-lag" viewBox="0 0 60 36" preserveAspectRatio="none"><polyline points=""/></svg></div>
      <div class="tile"><div class="label">CPU</div><span class="value" id="cpu">–</span><span class="unit">%</span><svg id="spark-cpu" viewBox="0 0 60 36" preserveAspectRatio="none"><polyline points=""/></svg></div>
      <div class="tile"><div class="label">RSS</div><span class="value" id="rss">–</span><span class="unit">MB</span></div>
    </div>

    <h2>Business</h2>
    <div class="grid">
      <div class="tile"><div class="label">Orders</div><span class="value" id="orders">–</span><svg id="spark-orders" viewBox="0 0 60 36" preserveAspectRatio="none"><polyline points=""/></svg></div>
      <div class="tile"><div class="label">Revenue</div><span class="value" id="revenue">–</span><span class="unit">USD</span></div>
      <div class="tile"><div class="label">Sign-ups</div><span class="value" id="signups">–</span></div>
      <div class="tile"><div class="label">Dashboards open</div><span class="value" id="streams">–</span></div>
    </div>

    <h2>Make something happen</h2>
    <div class="actions">
      <button class="primary" id="order">Place a demo order</button>
      <button id="signup">Sign up a user</button>
      <button id="burst">Send 200 requests</button>
    </div>
  </main>

  <footer>
    Live data from <code>GET /events</code> (Server-Sent Events) ·
    <a href="/metrics">/metrics</a> · <a href="/health/ready">/health/ready</a> · <a href="/api/stats">/api/stats</a>
  </footer>

  <script>
    // Dependency-free: EventSource for the stream, inline SVG for sparklines.
    var HISTORY = 60   // points per sparkline (one per snapshot)
    var series = { rps: [], p95: [], heap: [], lag: [], cpu: [], orders: [] }
    var $ = function (id) { return document.getElementById(id) }

    function fmt(n, digits) { return Number(n).toLocaleString(undefined, { maximumFractionDigits: digits === undefined ? 1 : digits }) }

    function spark(name, value) {
      var points = series[name]
      points.push(value)
      if (points.length > HISTORY) points.shift()
      var max = Math.max.apply(null, points.concat([1e-9]))
      var coords = points.map(function (v, i) {
        var x = (HISTORY - points.length + i) * (60 / (HISTORY - 1))
        var y = 34 - (v / max) * 32
        return x.toFixed(1) + ',' + y.toFixed(1)
      })
      $('spark-' + name).firstElementChild.setAttribute('points', coords.join(' '))
    }

    function render(s) {
      $('rps').textContent = fmt(s.http.rps)
      $('p95').textContent = fmt(s.http.p95Ms)
      $('errors').textContent = fmt(s.http.errorRate * 100, 2)
      $('total').textContent = fmt(s.http.total, 0)
      $('heap').textContent = fmt(s.process.heapUsedMb)
      $('lag').textContent = fmt(s.process.eventLoopLagP99Ms)
      $('cpu').textContent = fmt(s.process.cpuPercent)
      $('rss').textContent = fmt(s.process.rssMb)
      $('orders').textContent = fmt(s.business.orders, 0)
      $('revenue').textContent = fmt(s.business.revenue, 2)
      $('signups').textContent = fmt(s.business.signups, 0)
      $('streams').textContent = fmt(s.streams, 0)
      $('uptime').textContent = 'up ' + s.uptimeSec + ' s'

      spark('rps', s.http.rps)
      spark('p95', s.http.p95Ms)
      spark('heap', s.process.heapUsedMb)
      spark('lag', s.process.eventLoopLagP99Ms)
      spark('cpu', s.process.cpuPercent)
      spark('orders', s.business.orders)
    }

    // EventSource reconnects by itself after a drop
    var source = new EventSource('/events')
    source.addEventListener('stats', function (e) { render(JSON.parse(e.data)) })
    source.onopen = function () { $('status').textContent = 'live'; $('status').className = 'status live' }
    source.onerror = function () { $('status').textContent = 'reconnecting…'; $('status').className = 'status down' }

    function post(path, body) {
      return fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) })
    }

    $('order').onclick = function () {
      var channels = ['web', 'mobile', 'partner']
      post('/api/orders', {
        amount: Math.round((5 + Math.random() * 120) * 100) / 100,
        channel: channels[Math.floor(Math.random() * channels.length)]
      })
    }
    $('signup').onclick = function () { post('/api/signups') }
    $('burst').onclick = function () {
      for (var i = 0; i < 200; i++) fetch('/api/stats')
    }
  </script>
</body>
</html>
`,

    'src/app.test.ts': `import { describe, it, expect, createTestClient } from '@axiljs/testing'
import { createApp, SERVICE } from './app.js'
import { loadConfig } from './config.js'
import { createTelemetry } from './telemetry/index.js'

const config    = loadConfig({ NODE_ENV: 'test' })
const telemetry = createTelemetry(config)
const client    = createTestClient(createApp(config, telemetry))

describe('GET /api and the dashboard page', () => {
  it('describes the service', async () => {
    const res = await client.get('/api')
    expect(res.status).toBe(200)
    expect(res.body.data.service).toBe(SERVICE)
  })

  it('serves public/index.html at /', async () => {
    const res = await client.get('/')
    expect(res.status).toBe(200)
    expect(String(res.headers['content-type'])).toContain('text/html')
    expect(res.text).toContain('EventSource')
  })
})

describe('business events', () => {
  it('records an order', async () => {
    const res = await client.post('/api/orders').send({ amount: 19.99, channel: 'mobile' })
    expect(res.status).toBe(201)
    expect(res.body.data.totals.orders).toBe(1)
    expect(res.body.data.totals.revenue).toBe(19.99)
  })

  it('defaults the channel to web and keeps revenue exact', async () => {
    await client.post('/api/orders').send({ amount: 0.1 })
    const res = await client.post('/api/orders').send({ amount: 0.2 })
    expect(res.body.data.channel).toBe('web')
    expect(res.body.data.totals.revenue).toBe(20.29)
  })

  it('rejects invalid orders (422)', async () => {
    const res = await client.post('/api/orders').send({ amount: -5, channel: 'fax' })
    expect(res.status).toBe(422)
    const paths = res.body.error.details.map((d: { path: string }) => d.path)
    expect(paths).toContain('amount')
    expect(paths).toContain('channel')

    const decimals = await client.post('/api/orders').send({ amount: 1.234 })
    expect(decimals.status).toBe(422)
  })

  it('records a sign-up', async () => {
    const res = await client.post('/api/signups')
    expect(res.status).toBe(201)
    expect(res.body.data.totals.signups).toBe(1)
  })
})

describe('GET /api/stats', () => {
  it('returns a snapshot', async () => {
    const res = await client.get('/api/stats')
    expect(res.status).toBe(200)
    const snap = res.body.data
    expect(typeof snap.http.rps).toBe('number')
    expect(snap.process.heapUsedMb).toBeGreaterThan(0)
    expect(snap.business.orders).toBe(3)
  })
})

describe('GET /metrics', () => {
  it('serves Prometheus text with HTTP, process and business metrics', async () => {
    const res = await client.get('/metrics')
    expect(res.status).toBe(200)
    expect(String(res.headers['content-type'])).toContain('text/plain')

    const text = res.text
    expect(text).toContain('# TYPE shop_orders_total counter')
    expect(text).toContain('shop_orders_total{channel="mobile"} 1')
    expect(text).toContain('shop_orders_total{channel="web"} 2')
    expect(text).toContain('shop_revenue_cents_total{channel="web"} 30')
    expect(text).toContain('shop_signups_total 1')
    expect(text).toContain('# TYPE http_requests_total counter')
    expect(text).toContain('http_requests_total{method="POST",path="/api/orders",status="201"} 3')
    expect(text).toMatch(/^process_resident_memory_bytes \\d+$/m)
    expect(text).toMatch(/^dashboard_streams 0$/m)
  })

  it('labels unknown paths as "other"', async () => {
    await client.get('/no/such/page')
    const res = await client.get('/metrics')
    expect(res.text).toContain('path="other",status="404"')
    expect(res.text).not.toContain('/no/such/page')
  })
})

describe('health', () => {
  it('reports liveness', async () => {
    const res = await client.get('/health/live')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('alive')
  })

  it('reports readiness with every check', async () => {
    const res = await client.get('/health/ready')
    expect(res.status).toBe(200)
    expect(res.body.ready).toBe(true)
    expect(Object.keys(res.body.checks).sort()).toEqual(['collector', 'event-loop', 'memory'])
  })

  it('is not ready when a check fails (503)', async () => {
    const tight = loadConfig({ NODE_ENV: 'test', HEAP_LIMIT_MB: '1' })
    const res = await createTestClient(createApp(tight)).get('/health/ready')
    expect(res.status).toBe(503)
    expect(res.body.checks.memory.status).toBe('unhealthy')
  })

  it('reports the overall status', async () => {
    const res = await client.get('/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('healthy')
  })
})

describe('errors', () => {
  it('returns a JSON 404 for unknown routes', async () => {
    const res = await client.get('/api/nope')
    expect(res.status).toBe(404)
    expect(res.body.error.code).toBe('NOT_FOUND')
  })
})
`,

    'src/app.ts': `/**
 * Application factory.
 * Builds the app without listening, so tests can drive it directly.
 */

import { fileURLToPath } from 'node:url'
import { Application, axilError, cors, createSSE, serveStatic, sseHeartbeat } from '@axiljs/core'
import { metricsHandler, observabilityMiddleware } from '@axiljs/observability'
import { v, validate } from '@axiljs/validation'
import type { Config } from './config.js'
import { errorHandler } from './middleware/error-handler.js'
import { CHANNELS } from './telemetry/business.js'
import type { Channel } from './telemetry/business.js'
import { createTelemetry } from './telemetry/index.js'
import type { Telemetry } from './telemetry/index.js'

export const SERVICE = '${ctx.name}'
export const VERSION = '1.0.0'

// public/ sits next to src/ and dist/, so this works from both
export const PUBLIC_DIR = fileURLToPath(new URL('../public', import.meta.url))

// Known paths become metric labels as-is; anything else is "other", so
// random 404s cannot blow up the number of Prometheus series
const ROUTES = new Set([
  '/', '/index.html', '/api', '/api/stats', '/api/orders', '/api/signups',
  '/events', '/metrics', '/health', '/health/live', '/health/ready'
])

// ─── Schemas ──────────────────────────────────────────────────────────────────

const OrderBody = v.object({
  // Dollars with at most two decimals. v.number() also accepts numeric
  // strings ("12.50"), so transform(Number) makes the output a number.
  amount: v.number().positive().max(100000)
    .custom(n => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'amount has at most two decimals')
    .transform(Number),
  channel: v.enum([...CHANNELS]).default('web')
}).strip()

// ─── App ──────────────────────────────────────────────────────────────────────

export function createApp(config: Config, telemetry: Telemetry = createTelemetry(config)): Application {
  const { registry, requests, business, collector, health, streams } = telemetry

  const app = new Application({
    server:  { port: config.PORT, host: config.HOST, methodNotAllowed: true },
    env:     config.NODE_ENV,
    logging: config.NODE_ENV !== 'test'
  })

  app.use(cors({ origin: parseOrigins(config.CORS_ORIGIN) }))

  // Prometheus: http_requests_total, http_request_duration_ms, http_active_requests
  app.use(observabilityMiddleware({
    metrics:   registry,
    pathLabel: req => (ROUTES.has(req.path) ? req.path : 'other')
  }))

  // Live view: requests/s and latency per window (long-lived streams excluded)
  app.use(requests.middleware(['/events']))

  // GET / -> public/index.html, the dashboard (other paths fall through)
  app.use(serveStatic({ root: PUBLIC_DIR, maxAge: config.NODE_ENV === 'production' ? 3600 : 0 }))

  app.get('/api', (_req, res) => {
    res.success({
      service: SERVICE,
      version: VERSION,
      endpoints: [
        'GET  /events          (text/event-stream)',
        'GET  /api/stats',
        'POST /api/orders',
        'POST /api/signups',
        'GET  /metrics         (Prometheus)',
        'GET  /health, /health/live, /health/ready'
      ]
    }, 'Service info')
  })

  // ── Live stream ────────────────────────────────────────────────────────────

  app.get('/events', (_req, res) => {
    if (streams.size >= config.MAX_STREAMS) {
      throw new axilError('Too many open dashboards', 503, 'TOO_MANY_STREAMS')
    }

    const sse = createSSE(res)
    streams.add(sse)

    // The latest snapshot right away, then one per interval
    const latest = collector.latest()
    sse.send(latest, 'stats', String(latest.seq))
    const unsubscribe   = collector.subscribe(s => sse.send(s, 'stats', String(s.seq)))
    // Comment lines keep proxies from closing a quiet stream
    const stopHeartbeat = sseHeartbeat(sse, 15000)

    res.raw.on('close', () => {
      unsubscribe()
      stopHeartbeat()
      streams.delete(sse)
    })
  })

  app.get('/api/stats', (_req, res) => {
    res.success(collector.latest(), 'Latest snapshot')
  })

  // ── Business events (demo) ─────────────────────────────────────────────────

  app.post('/api/orders', validate({ body: OrderBody }), (req, res) => {
    const { amount, channel } = req.body as { amount: number; channel: Channel }
    business.recordOrder(amount, channel)
    res.created({ amount, channel, totals: business.snapshot() }, 'Order recorded')
  })

  app.post('/api/signups', (_req, res) => {
    business.recordSignup()
    res.created({ totals: business.snapshot() }, 'Sign-up recorded')
  })

  // ── Prometheus and health ──────────────────────────────────────────────────

  const prometheus = metricsHandler(registry)
  app.get('/metrics', (req, res) => {
    collector.refreshGauges()
    return prometheus(req, res)
  })

  app.get('/health',       health.handler())
  app.get('/health/live',  health.livenessHandler())
  app.get('/health/ready', health.readinessHandler())

  app.use(errorHandler(config.NODE_ENV))

  return app
}

function parseOrigins(value: string): string | string[] {
  if (value.trim() === '*') return '*'
  return value.split(',').map(o => o.trim()).filter(Boolean)
}
`,

    'src/config.ts': `/**
 * Typed configuration, read from environment variables.
 * loadEnv() in src/main.ts fills process.env from .env first.
 */

import { defineConfig } from '@axiljs/config'

export function loadConfig(source: Record<string, string | undefined> = process.env) {
  return defineConfig({
    PORT:               { type: 'number', default: 3008, min: 0, max: 65535 },
    HOST:               { type: 'string', default: '127.0.0.1' },
    NODE_ENV:           { type: 'string', default: 'development', enum: ['development', 'production', 'test'] },
    // "*" or a comma-separated list of allowed origins
    CORS_ORIGIN:        { type: 'string', default: '*' },

    // How often a stats snapshot is taken and pushed to dashboards
    SAMPLE_INTERVAL_MS: { type: 'number', default: 1000, min: 50, max: 60000 },
    // Open /events streams allowed at once (503 beyond)
    MAX_STREAMS:        { type: 'number', default: 100, min: 1 },

    // Readiness (/health/ready) fails above these
    LAG_THRESHOLD_MS:   { type: 'number', default: 200, min: 1 },
    HEAP_LIMIT_MB:      { type: 'number', default: 1024, min: 1 }
  }, source)
}

export type Config = ReturnType<typeof loadConfig>
`,

    'src/events.test.ts': `/**
 * The SSE stream over a real connection: the app listens on a random port
 * and the tests read events with node:http.
 */

import { request } from 'node:http'
import type { IncomingMessage } from 'node:http'
import { describe, it, expect, beforeAll, afterAll } from '@axiljs/testing'
import type { Application } from '@axiljs/core'
import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { createTelemetry } from './telemetry/index.js'
import type { Telemetry } from './telemetry/index.js'

interface SseEvent {
  event?: string
  id?:    string
  data:   string
}

/** Open /events and collect parsed events; close() ends the request. */
function openStream(port: number): Promise<{ res: IncomingMessage; next: () => Promise<SseEvent>; close: () => void }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path: '/events', headers: { accept: 'text/event-stream' } }, res => {
      res.setEncoding('utf8')
      let buffer = ''
      const queue: SseEvent[] = []
      const waiting: Array<(e: SseEvent) => void> = []

      res.on('data', (chunk: string) => {
        buffer += chunk
        // Events end with a blank line; comment-only blocks (": ...") are skipped
        let end: number
        while ((end = buffer.indexOf('\\n\\n')) >= 0) {
          const block = buffer.slice(0, end)
          buffer = buffer.slice(end + 2)
          const event: SseEvent = { data: '' }
          const data: string[] = []
          for (const line of block.split('\\n')) {
            const [field, ...rest] = line.split(': ')
            const value = rest.join(': ')
            if (field === 'data') data.push(value)
            else if (field === 'event') event.event = value
            else if (field === 'id') event.id = value
          }
          if (data.length === 0) continue
          event.data = data.join('\\n')
          const waiter = waiting.shift()
          if (waiter) waiter(event)
          else queue.push(event)
        }
      })

      resolve({
        res,
        next: () => {
          const queued = queue.shift()
          if (queued) return Promise.resolve(queued)
          return new Promise((ok, fail) => {
            const timer = setTimeout(() => fail(new Error('No SSE event within 2000ms')), 2000)
            waiting.push(e => { clearTimeout(timer); ok(e) })
          })
        },
        close: () => req.destroy()
      })
    })
    req.on('error', reject)
    req.end()
  })
}

// Hooks must sit inside a describe(): @axiljs/testing ignores top-level ones
describe('GET /events (Server-Sent Events)', () => {
  let app: Application
  let telemetry: Telemetry
  let port: number

  beforeAll(async () => {
    const config = loadConfig({ NODE_ENV: 'test', SAMPLE_INTERVAL_MS: '50' })
    telemetry = createTelemetry(config)
    app = createApp(config, telemetry)
    port = (await app.listen(0, '127.0.0.1')).port
  })

  afterAll(async () => {
    telemetry.stop()
    await app.close()
  })

  it('sends a well-formed stats event right away', async () => {
    const stream = await openStream(port)
    expect(stream.res.statusCode).toBe(200)
    expect(String(stream.res.headers['content-type'])).toContain('text/event-stream')

    const event = await stream.next()
    expect(event.event).toBe('stats')
    const snapshot = JSON.parse(event.data)
    expect(event.id).toBe(String(snapshot.seq))
    expect(typeof snapshot.http.rps).toBe('number')
    expect(typeof snapshot.process.eventLoopLagMs).toBe('number')
    expect(snapshot.business).toEqual({ orders: 0, revenue: 0, signups: 0 })
    expect(snapshot.streams).toBe(1)

    stream.close()
  })

  it('pushes a fresh snapshot every interval', async () => {
    telemetry.start()
    const stream = await openStream(port)
    const first  = JSON.parse((await stream.next()).data)

    telemetry.business.recordSignup()
    // A tick may already be in flight; read until the sign-up shows up
    let later = first
    while (later.business.signups < 1) later = JSON.parse((await stream.next()).data)
    expect(later.seq).toBeGreaterThan(first.seq)
    expect(later.business.signups).toBe(1)

    stream.close()
    telemetry.stop()
  })

  it('stop() ends open streams', async () => {
    const stream = await openStream(port)
    await stream.next()
    const ended = new Promise<void>(resolve => stream.res.on('end', () => resolve()))
    telemetry.stop()
    await ended
    expect(telemetry.streams.size).toBe(0)
  })
})
`,

    'src/main.ts': `/**
 * ${ctx.name}
 * Entry point: load .env, start sampling, listen, shut down cleanly.
 */

import { loadEnv } from '@axiljs/config'
import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { createTelemetry } from './telemetry/index.js'

loadEnv()

const config    = loadConfig()
const telemetry = createTelemetry(config)
const app       = createApp(config, telemetry)

telemetry.start()
const { port } = await app.listen()

console.log(\`  Dashboard: http://localhost:\${port}/  Metrics: http://localhost:\${port}/metrics\`)

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    // End the open SSE streams first: server.close() waits for them
    telemetry.stop()
    await app.close()
    process.exit(0)
  })
}
`,

    'src/middleware/error-handler.ts': `/**
 * Error handler: turns thrown errors into one JSON shape.
 *
 *   { "error": { "code": "VALIDATION_ERROR", "message": "...", "details": [...] } }
 *
 * axilError subclasses (NotFoundError, UnauthorizedError, ValidationError, ...)
 * keep their status and code; anything else is a 500 whose message is hidden
 * in production.
 */

import { axilError } from '@axiljs/core'
import type { ErrorMiddlewareFn } from '@axiljs/core'

export function errorHandler(env: string): ErrorMiddlewareFn {
  // Four parameters: that is how Application.use() recognises an error handler
  return (err, req, res, _next) => {
    const known  = err instanceof axilError
    const status = known ? err.statusCode : 500

    if (status >= 500) console.error(\`[\${req.method} \${req.path}]\`, err)

    res.status(status).json({
      error: {
        code:    known ? err.code : 'INTERNAL_ERROR',
        message: status >= 500 && env === 'production' ? 'Internal server error' : err.message,
        ...(known && err.details !== undefined ? { details: err.details } : {})
      }
    })
  }
}
`,

    'src/telemetry/business.ts': `/**
 * Business metrics: the numbers people actually watch on a dashboard.
 * Each one is a Prometheus counter (scraped from /metrics) plus a running
 * total for the live stream.
 */

import type { Counter, MetricsRegistry } from '@axiljs/observability'

export const CHANNELS = ['web', 'mobile', 'partner'] as const
export type Channel = typeof CHANNELS[number]

export interface BusinessTotals {
  orders:  number
  revenue: number
  signups: number
}

export class BusinessMetrics {
  private readonly orders:  Counter
  private readonly revenue: Counter
  private readonly signups: Counter
  private readonly totals: BusinessTotals = { orders: 0, revenue: 0, signups: 0 }
  private revenueCents = 0

  constructor(registry: MetricsRegistry) {
    this.orders  = registry.counter('shop_orders_total',        'Orders placed',          ['channel'])
    this.revenue = registry.counter('shop_revenue_cents_total', 'Order revenue in cents', ['channel'])
    this.signups = registry.counter('shop_signups_total',       'New sign-ups')
  }

  /** amount in dollars; counted in whole cents so totals never drift (0.1 + 0.2). */
  recordOrder(amount: number, channel: Channel): void {
    const cents = Math.round(amount * 100)
    this.orders.inc({ channel })
    this.revenue.inc({ channel }, cents)
    this.totals.orders++
    this.revenueCents += cents
    this.totals.revenue = this.revenueCents / 100
  }

  recordSignup(): void {
    this.signups.inc()
    this.totals.signups++
  }

  snapshot(): BusinessTotals {
    return { ...this.totals }
  }
}
`,

    'src/telemetry/collector.ts': `/**
 * Takes a snapshot of app and process stats every interval and hands it to
 * subscribers (the /events streams). Also keeps the process gauges in the
 * Prometheus registry current.
 */

import { monitorEventLoopDelay } from 'node:perf_hooks'
import type { IntervalHistogram } from 'node:perf_hooks'
import type { Gauge, MetricsRegistry } from '@axiljs/observability'
import type { BusinessMetrics, BusinessTotals } from './business.js'
import type { RequestStats } from './request-stats.js'

export interface Snapshot {
  /** Increases by one per snapshot; used as the SSE event id. */
  seq:       number
  at:        string
  uptimeSec: number
  http: {
    /** Requests per second over the last window. */
    rps:       number
    avgMs:     number
    p95Ms:     number
    /** Share of 5xx responses in the window, 0-1. */
    errorRate: number
    total:     number
  }
  process: {
    rssMb:         number
    heapUsedMb:    number
    heapTotalMb:   number
    cpuPercent:    number
    /** Mean / p99 event-loop delay over the window. */
    eventLoopLagMs:    number
    eventLoopLagP99Ms: number
  }
  business: BusinessTotals
  /** Dashboards connected to /events. */
  streams: number
}

export interface CollectorOptions {
  intervalMs: number
  registry:   MetricsRegistry
  requests:   RequestStats
  business:   BusinessMetrics
  /** Current number of /events streams. */
  streams:    () => number
}

type Listener = (snapshot: Snapshot) => void

const MB = 1024 * 1024
const round = (n: number, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits

export class StatsCollector {
  private readonly listeners = new Set<Listener>()
  // Event-loop delay histogram, sampled every 10 ms while running
  private readonly loop: IntervalHistogram = monitorEventLoopDelay({ resolution: 10 })
  private readonly gauges: Record<'rss' | 'heap' | 'lag' | 'streams', Gauge>
  private timer?: ReturnType<typeof setInterval>
  private last?: Snapshot
  private seq = 0
  private windowStart = performance.now()
  private cpuStart = process.cpuUsage()

  constructor(private readonly options: CollectorOptions) {
    const { registry } = options
    this.gauges = {
      rss:     registry.gauge('process_resident_memory_bytes', 'Resident memory size in bytes'),
      heap:    registry.gauge('nodejs_heap_used_bytes',        'V8 heap in use, in bytes'),
      lag:     registry.gauge('nodejs_eventloop_lag_p99_ms',   'Event-loop delay p99 over the last window, ms'),
      streams: registry.gauge('dashboard_streams',             'Open /events streams')
    }
  }

  get running(): boolean {
    return this.timer !== undefined
  }

  /** The latest snapshot, taking one if none exists yet. */
  latest(): Snapshot {
    return this.last ?? this.sample()
  }

  /** Age of the latest snapshot in ms (Infinity before the first). */
  age(): number {
    return this.last ? Date.now() - Date.parse(this.last.at) : Infinity
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  start(): void {
    if (this.timer) return
    this.loop.enable()
    this.timer = setInterval(() => {
      const snapshot = this.sample()
      for (const listener of this.listeners) {
        try {
          listener(snapshot)
        } catch (err) {
          console.error('[stats] listener failed:', err)
        }
      }
    }, this.options.intervalMs)
    // Don't keep the process alive just for stats
    this.timer.unref()
  }

  stop(): void {
    clearInterval(this.timer)
    this.timer = undefined
    this.loop.disable()
  }

  /** Close the current window and build a snapshot from it. */
  sample(): Snapshot {
    const now     = performance.now()
    const elapsed = Math.max(1, now - this.windowStart)
    const window  = this.options.requests.take()
    const cpu     = process.cpuUsage(this.cpuStart)
    const memory  = process.memoryUsage()
    const lagMean = this.loop.count > 0 ? this.loop.mean / 1e6 : 0
    const lagP99  = this.loop.count > 0 ? this.loop.percentile(99) / 1e6 : 0

    this.loop.reset()
    this.windowStart = now
    this.cpuStart    = process.cpuUsage()

    const snapshot: Snapshot = {
      seq:       ++this.seq,
      at:        new Date().toISOString(),
      uptimeSec: Math.round(process.uptime()),
      http: {
        rps:       round(window.count / (elapsed / 1000)),
        avgMs:     round(window.avgMs),
        p95Ms:     round(window.p95Ms),
        errorRate: window.count ? round(window.errors / window.count, 4) : 0,
        total:     this.options.requests.total
      },
      process: {
        rssMb:             round(memory.rss / MB),
        heapUsedMb:        round(memory.heapUsed / MB),
        heapTotalMb:       round(memory.heapTotal / MB),
        // cpuUsage is in microseconds; elapsed in milliseconds
        cpuPercent:        round(((cpu.user + cpu.system) / 1000 / elapsed) * 100, 1),
        eventLoopLagMs:    round(lagMean),
        eventLoopLagP99Ms: round(lagP99)
      },
      business: this.options.business.snapshot(),
      streams:  this.options.streams()
    }

    this.gauges.lag.set(snapshot.process.eventLoopLagP99Ms)
    this.refreshGauges()
    this.last = snapshot
    return snapshot
  }

  /** Point-in-time gauges; also called right before every /metrics scrape. */
  refreshGauges(): void {
    const memory = process.memoryUsage()
    this.gauges.rss.set(memory.rss)
    this.gauges.heap.set(memory.heapUsed)
    this.gauges.streams.set(this.options.streams())
  }
}
`,

    'src/telemetry/index.ts': `/**
 * Everything the dashboard measures, built once and shared by the routes:
 * the Prometheus registry, per-window request stats, business counters,
 * the snapshot collector, health checks and the open SSE streams.
 */

import type { SSEConnection } from '@axiljs/core'
import { HealthChecker, MetricsRegistry } from '@axiljs/observability'
import type { Config } from '../config.js'
import { BusinessMetrics } from './business.js'
import { StatsCollector } from './collector.js'
import { RequestStats } from './request-stats.js'

export interface Telemetry {
  registry:  MetricsRegistry
  requests:  RequestStats
  business:  BusinessMetrics
  collector: StatsCollector
  health:    HealthChecker
  /** Open /events streams. */
  streams:   Set<SSEConnection>
  /** Start sampling (every SAMPLE_INTERVAL_MS). */
  start(): void
  /** Stop sampling and end every open stream (so the server can close). */
  stop(): void
}

export function createTelemetry(config: Config): Telemetry {
  const registry = new MetricsRegistry()
  const requests = new RequestStats()
  const business = new BusinessMetrics(registry)
  const streams  = new Set<SSEConnection>()

  const collector = new StatsCollector({
    intervalMs: config.SAMPLE_INTERVAL_MS,
    registry,
    requests,
    business,
    streams: () => streams.size
  })

  // Readiness checks: throw to report unhealthy (503 on /health/ready)
  const health = new HealthChecker({ defaultTimeoutMs: 1000 })

  health.addCheck('event-loop', async () => {
    const p99 = collector.latest().process.eventLoopLagP99Ms
    if (p99 > config.LAG_THRESHOLD_MS) {
      throw new Error(\`Event-loop delay p99 \${p99} ms is above \${config.LAG_THRESHOLD_MS} ms\`)
    }
    return { message: \`p99 \${p99} ms\`, details: { p99Ms: p99, thresholdMs: config.LAG_THRESHOLD_MS } }
  })

  health.addCheck('memory', async () => {
    const heapMb = Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
    if (heapMb > config.HEAP_LIMIT_MB) {
      throw new Error(\`Heap \${heapMb} MB is above \${config.HEAP_LIMIT_MB} MB\`)
    }
    return { message: \`heap \${heapMb} MB\`, details: { heapMb, limitMb: config.HEAP_LIMIT_MB } }
  })

  health.addCheck('collector', async () => {
    // A running collector that stopped producing snapshots means a stuck timer
    if (collector.running && collector.age() > config.SAMPLE_INTERVAL_MS * 5) {
      throw new Error('Stats snapshots are stale')
    }
    return { details: { running: collector.running } }
  })

  return {
    registry,
    requests,
    business,
    collector,
    health,
    streams,
    start: () => collector.start(),
    stop: () => {
      collector.stop()
      for (const stream of streams) stream.close()
      streams.clear()
    }
  }
}
`,

    'src/telemetry/request-stats.ts': `/**
 * Per-window HTTP stats for the live view: requests, errors and latency
 * since the last snapshot. (The Prometheus side, http_requests_total and
 * http_request_duration_ms, comes from observabilityMiddleware.)
 */

import { performance } from 'node:perf_hooks'
import type { MiddlewareFn } from '@axiljs/core'

export interface RequestWindow {
  /** Requests finished in the window. */
  count:  number
  /** Of those, responses with status >= 500. */
  errors: number
  avgMs:  number
  p95Ms:  number
  maxMs:  number
}

// Latency samples kept per window; enough for a stable p95, bounded memory
const MAX_SAMPLES = 5000

export class RequestStats {
  private count     = 0
  private errors    = 0
  private durations: number[] = []
  private totalCount = 0

  /** Requests finished since the app started. */
  get total(): number {
    return this.totalCount
  }

  /** Middleware that records every finished request (except \`skip\`ped paths). */
  middleware(skip: string[] = []): MiddlewareFn {
    const skipped = new Set(skip)
    return (req, res, next) => {
      if (!skipped.has(req.path)) {
        const started = performance.now()
        res.raw.once('finish', () => this.record(performance.now() - started, res.raw.statusCode))
      }
      next()
    }
  }

  record(durationMs: number, status: number): void {
    this.count++
    this.totalCount++
    if (status >= 500) this.errors++
    if (this.durations.length < MAX_SAMPLES) this.durations.push(durationMs)
  }

  /** Summarise the current window and start a new one. */
  take(): RequestWindow {
    const sorted = this.durations.sort((a, b) => a - b)
    const sum    = sorted.reduce((s, d) => s + d, 0)
    const window: RequestWindow = {
      count:  this.count,
      errors: this.errors,
      avgMs:  sorted.length ? sum / sorted.length : 0,
      p95Ms:  sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] : 0,
      maxMs:  sorted.length ? sorted[sorted.length - 1] : 0
    }
    this.count     = 0
    this.errors    = 0
    this.durations = []
    return window
  }
}
`,

    'src/telemetry/telemetry.test.ts': `import { describe, it, expect } from '@axiljs/testing'
import { MetricsRegistry } from '@axiljs/observability'
import { BusinessMetrics } from './business.js'
import { StatsCollector } from './collector.js'
import { RequestStats } from './request-stats.js'

describe('RequestStats', () => {
  it('summarises a window and resets it', () => {
    const stats = new RequestStats()
    for (let ms = 1; ms <= 20; ms++) stats.record(ms, ms === 20 ? 500 : 200)

    const window = stats.take()
    expect(window.count).toBe(20)
    expect(window.errors).toBe(1)
    expect(window.avgMs).toBe(10.5)
    expect(window.p95Ms).toBe(19)
    expect(window.maxMs).toBe(20)

    expect(stats.take()).toEqual({ count: 0, errors: 0, avgMs: 0, p95Ms: 0, maxMs: 0 })
    expect(stats.total).toBe(20)
  })
})

describe('StatsCollector', () => {
  const build = () => {
    const registry = new MetricsRegistry()
    const requests = new RequestStats()
    const business = new BusinessMetrics(registry)
    const collector = new StatsCollector({ intervalMs: 20, registry, requests, business, streams: () => 2 })
    return { registry, requests, business, collector }
  }

  it('builds snapshots with increasing seq', () => {
    const { requests, business, collector } = build()
    requests.record(5, 200)
    business.recordOrder(12.5, 'web')

    const a = collector.sample()
    const b = collector.sample()
    expect(b.seq).toBe(a.seq + 1)
    expect(a.http.total).toBe(1)
    expect(b.http.rps).toBe(0)
    expect(a.business).toEqual({ orders: 1, revenue: 12.5, signups: 0 })
    expect(a.streams).toBe(2)
    expect(a.process.rssMb).toBeGreaterThan(0)
  })

  it('notifies subscribers every interval until stopped', async () => {
    const { collector } = build()
    const seen: number[] = []
    const unsubscribe = collector.subscribe(s => seen.push(s.seq))

    collector.start()
    expect(collector.running).toBe(true)
    await new Promise(resolve => setTimeout(resolve, 110))
    collector.stop()
    unsubscribe()

    expect(collector.running).toBe(false)
    expect(seen.length).toBeGreaterThanOrEqual(2)
    const count = seen.length
    await new Promise(resolve => setTimeout(resolve, 50))
    expect(seen.length).toBe(count)
  })

  it('keeps process gauges in the registry', () => {
    const { registry, collector } = build()
    collector.refreshGauges()
    const text = registry.toPrometheus()
    expect(text).toMatch(/^nodejs_heap_used_bytes \\d+$/m)
    expect(text).toMatch(/^dashboard_streams 2$/m)
  })
})
`
  }),

  nextSteps: () => [
    ['npm test', 'Routes, /metrics, health and a real SSE connection'],
    ['Open the dashboard after npm run dev', 'and press the buttons to move the numbers']
  ]
}
