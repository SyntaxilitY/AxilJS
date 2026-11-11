/**
 * Template: webhook-receiver
 *
 * A secure inbound-webhook service: HMAC-SHA256 signatures over the raw body
 * (timingSafeEqual), a timestamp tolerance against replays, idempotency by
 * event id, a fast 202 and asynchronous processing on a queue with retries,
 * per-source rate limiting, and a delivery log.
 */

import type { ProjectTemplate, TemplateContext } from './types'

export const webhookReceiverTemplate: ProjectTemplate = {
  id:       'webhook-receiver',
  title:    'Webhook Receiver',
  summary:  'Signed webhooks: verify, dedupe, queue, retry',
  category: 'Background',
  highlights: [
    'HMAC-SHA256 over the raw body, timingSafeEqual',
    'Timestamp tolerance stops replayed deliveries',
    'Idempotent: each event id is processed once',
    'Answers 202 fast, processes on a retrying queue',
    'Per-source rate limits and a delivery log'
  ],
  packages: ['@axiljs/core', '@axiljs/config', '@axiljs/validation', '@axiljs/queue', '@axiljs/security', '@axiljs/testing'],
  port:     3007,

  dependencies: ctx => ({
    '@axiljs/config':     ctx.axilRange,
    '@axiljs/core':       ctx.axilRange,
    '@axiljs/queue':      ctx.axilRange,
    '@axiljs/security':   ctx.axilRange,
    '@axiljs/validation': ctx.axilRange
  }),

  scripts: {
    'send-test-webhook': 'tsc && node dist/scripts/send-test-webhook.js'
  },

  files: (ctx: TemplateContext) => ({
    'README.md': `# ${ctx.name}

A secure inbound-webhook service on [AxilJS](https://github.com/SyntaxilitY/AxilJS), created with
\`axil create ${ctx.name} --template webhook-receiver\`.

Providers (payments, Git hosting, CRMs, your own services) POST events to
\`/webhooks/:source\`. Each delivery is:

1. **Rate limited per source** (\`@axiljs/security\` \`rateLimit\`): one bucket per sender, 429 when exceeded
2. **Authenticated**: HMAC-SHA256 over the **raw request bytes**, compared with \`crypto.timingSafeEqual\`
3. **Checked for freshness**: the signed timestamp must be within \`WEBHOOK_TOLERANCE_SEC\`, so a
   captured request can't be replayed later
4. **Deduplicated**: an event id already seen from that source is acknowledged (200) but not processed again
5. **Acknowledged fast**: \`202 Accepted\` as soon as it is queued; providers time out (and retry)
   slow endpoints, so no work happens in the request
6. **Processed asynchronously** on an \`@axiljs/queue\` \`Queue\` with retries and backoff; the
   delivery log (\`GET /deliveries\`) shows \`queued → processing → processed\` or \`retrying → failed\`

## Run

\`\`\`bash
npm install
cp .env.example .env        # PowerShell: Copy-Item .env.example .env
npm run dev                 # watch mode, http://localhost:3007
\`\`\`

In a second terminal, send a signed sample event:

\`\`\`bash
npm run send-test-webhook                              # signed order.created -> 202
npm run send-test-webhook -- --type invoice.paid       # another event type
npm run send-test-webhook -- --duplicate               # same event twice -> 202, then 200 duplicate
npm run send-test-webhook -- --bad-signature           # -> 401 INVALID_SIGNATURE
npm run send-test-webhook -- --stale                   # timestamp outside tolerance -> 401
npm run send-test-webhook -- --source billing --url http://localhost:3007/webhooks/billing
curl http://localhost:3007/deliveries
\`\`\`

The script (\`src/scripts/send-test-webhook.ts\`) compiles the project (\`tsc\`), reads the secret
for \`--source\` (default \`demo\`) from \`.env\`, signs a pretty-printed JSON body and POSTs it.
The server must be running.

Production build:

\`\`\`bash
npm run build
npm start
\`\`\`

## Test

\`\`\`bash
npm test                    # axil test: compiles with tsc, runs src/**/*.test.ts
\`\`\`

Retries use a fixed 5 ms backoff in tests, so the suite runs in well under a second. One test
starts the app on a random 127.0.0.1 port to send exact bytes with \`fetch\`.

## Endpoints

| Method | Path                     | Description                                         | Success  | Errors             |
|--------|--------------------------|-----------------------------------------------------|----------|--------------------|
| GET    | \`/\`                      | Service name, version, sources and endpoints        | 200      |                    |
| GET    | \`/health\`                | Liveness plus queue counts                          | 200      |                    |
| POST   | \`/webhooks/:source\`      | Receive a signed event                              | 202, 200 | 401, 404, 422, 429 |
| GET    | \`/deliveries\`            | Recent deliveries, newest first (\`?status=&source=&limit=\`) | 200 | 422          |
| GET    | \`/deliveries/:id\`        | One delivery, including its payload                 | 200      | 404                |
| POST   | \`/deliveries/:id/retry\`  | Re-queue a failed delivery                          | 202      | 404, 409           |

\`POST /webhooks/:source\` answers:

| Status | When                                                                                   |
|--------|----------------------------------------------------------------------------------------|
| 202    | Verified and queued: \`{ deliveryId, eventId, status: "queued" }\`                       |
| 200    | Verified duplicate of an event id already received from this source: \`{ duplicate: true, ... }\` |
| 401    | \`MISSING_SIGNATURE\`, \`INVALID_SIGNATURE\` or \`TIMESTAMP_OUT_OF_TOLERANCE\`               |
| 404    | No secret configured for \`:source\`                                                     |
| 422    | Signed, but the body is not a JSON event with string \`id\` and \`type\`                   |
| 429    | Rate limit for this source exceeded (\`Retry-After\` header)                             |

Duplicates get a 2xx on purpose: the sender only needs to know the event arrived, and a 4xx
would make it retry forever.

> \`GET /deliveries\` exposes payloads. Keep it on an internal network or put authentication in
> front of it (e.g. \`@axiljs/auth\`) before deploying.

## Signing scheme

Senders put one header on each request:

\`\`\`
Webhook-Signature: t=1731300000,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd
\`\`\`

- \`t\`: Unix time in seconds when the request was signed
- \`v1\`: hex HMAC-SHA256, keyed with the source's secret, of \`<t>.<raw request body>\`

Several \`v1=\` entries are accepted (any match wins), which lets a sender sign with an old and a
new secret while you rotate. The timestamp is inside the signed string, so it can't be changed
without breaking the signature; anything older or newer than \`WEBHOOK_TOLERANCE_SEC\` is refused.

Signing in Node:

\`\`\`ts
import { createHmac } from 'node:crypto'
const t = Math.floor(Date.now() / 1000)
const v1 = createHmac('sha256', secret).update(\`\${t}.\${body}\`).digest('hex')
headers['Webhook-Signature'] = \`t=\${t},v1=\${v1}\`
\`\`\`

The event body is JSON with at least \`id\` (unique per event, used for deduplication) and \`type\`:

\`\`\`json
{ "id": "evt_123", "type": "order.created", "created": 1731300000, "data": { "orderId": "ord_1", "total": 4200 } }
\`\`\`

Adapting to a real provider usually means changing the header name/format in
\`src/webhooks/signature.ts\` and where the event id comes from in \`src/app.ts\`.

### Why the raw body needs a workaround

A signature must be checked against the exact bytes that were sent: re-serialising the parsed
JSON (\`JSON.stringify(req.body)\`) changes whitespace, key order and escapes, and the HMAC no
longer matches. AxilJS's built-in body parser runs before any app middleware and keeps only the
parsed object for \`application/json\`, so \`src/webhooks/raw-body.ts\` wraps
\`Request.prototype.readBody\` once at startup to also keep the string it read in
\`req.locals.rawBody\`. The body is decoded as UTF-8, which round-trips byte-for-byte for valid
UTF-8 JSON; anything else fails verification (401) rather than passing.

### Curl

Signing by hand needs a shell with \`openssl\`:

\`\`\`bash
SECRET=change-me-demo-webhook-secret
BODY='{"id":"evt_curl_1","type":"order.created","data":{"orderId":"ord_1"}}'
T=$(date +%s)
SIG=$(printf '%s' "$T.$BODY" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')
curl -i -X POST http://localhost:3007/webhooks/demo -H "Content-Type: application/json" \\
  -H "Webhook-Signature: t=$T,v1=$SIG" -d "$BODY"

curl -i -X POST http://localhost:3007/webhooks/demo -H "Content-Type: application/json" -d "$BODY"   # 401
curl "http://localhost:3007/deliveries?status=processed"
\`\`\`

### PowerShell

\`\`\`powershell
npm run send-test-webhook
Invoke-RestMethod http://localhost:3007/deliveries
curl.exe -s "http://localhost:3007/deliveries?status=failed"
\`\`\`

## Configuration

| Variable                | Default       | Description                                                       |
|-------------------------|---------------|-------------------------------------------------------------------|
| \`PORT\`                  | \`3007\`        | HTTP port                                                         |
| \`HOST\`                  | \`127.0.0.1\`   | Bind address (\`0.0.0.0\` in containers)                            |
| \`NODE_ENV\`              | \`development\` | \`development\`, \`production\` or \`test\`                             |
| \`WEBHOOK_SECRETS\`       | (required)    | \`source=secret\` pairs, comma-separated; the source is the URL segment |
| \`WEBHOOK_TOLERANCE_SEC\` | \`300\`         | Max clock difference for the signed timestamp                     |
| \`RATE_LIMIT_MAX\`        | \`120\`         | Deliveries per source per window                                  |
| \`RATE_LIMIT_WINDOW_MS\`  | \`60000\`       | Rate limit window                                                 |
| \`DELIVERY_LOG_SIZE\`     | \`1000\`        | Deliveries kept in memory; also the deduplication window          |
| \`QUEUE_CONCURRENCY\`     | \`4\`           | Events processed at the same time                                 |
| \`QUEUE_POLL_MS\`         | \`100\`         | How often idle workers look for queued events                     |
| \`JOB_MAX_ATTEMPTS\`      | \`5\`           | Processing attempts before a delivery is marked \`failed\`          |
| \`JOB_TIMEOUT_MS\`        | \`30000\`       | Per-attempt timeout (\`0\` = none)                                  |
| \`RETRY_BACKOFF\`         | \`exponential\` | \`exponential\` (delay × 2^(attempt-1), plus up to 1 s jitter) or \`fixed\` |
| \`RETRY_DELAY_MS\`        | \`1000\`        | Base retry delay                                                  |

Use long random secrets (\`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"\`)
and never commit \`.env\`.

## Project structure

\`\`\`
src/
  main.ts                       entry point: loadEnv, webhook system, app, listen, graceful shutdown
  app.ts                        createApp(config, system): routes, rate limits, validation
  config.ts                     typed config + parseSecrets()
  webhooks/raw-body.ts          keeps the raw request body in req.locals.rawBody
  webhooks/signature.ts         sign / verify (HMAC-SHA256, timingSafeEqual, timestamp tolerance)
  webhooks/verify.ts            middleware: 401 unless the signature is valid
  webhooks/deliveries.ts        delivery log + idempotency (one delivery per source and event id)
  webhooks/handlers.ts          what to do per event type (order.created, invoice.paid, ...)
  webhooks/system.ts            queue + workers that run the handlers, start/stop
  webhooks/sender.ts            sign and POST a webhook (used by the script and tests)
  scripts/send-test-webhook.ts  npm run send-test-webhook
  middleware/error-handler.ts   thrown errors -> { error: { code, message, details } }
  test-utils.ts                 test config, signed requests, poll helper
  app.test.ts                   signatures, replays, duplicates, queue processing, rate limits
  webhooks/signature.test.ts    signature unit tests
\`\`\`

## Limits of this starter

- Deliveries, the dedupe window and the queue are **in memory**: a restart forgets them, and
  several instances don't share them. For more than one instance, keep deliveries in a
  database with a unique \`(source, event_id)\` constraint and give the \`Queue\` a shared
  \`QueueStore\`.
- Rate limit counters are per process (\`MemoryStore\`); pass a shared \`store\` to \`rateLimit\`
  when running several instances.

## Next steps

- Handle your event types in \`src/webhooks/handlers.ts\`
- Add a source: append \`name=secret\` to \`WEBHOOK_SECRETS\` and point the provider at \`/webhooks/name\`
- Background jobs, cron and events in more depth: \`axil create jobs --template background-jobs\`
`,

    '.env.example': `# Server
PORT=3007
HOST=127.0.0.1
NODE_ENV=development

# Webhook sources: source=secret pairs, comma-separated (the source is the URL segment).
# Replace these placeholders with long random values.
WEBHOOK_SECRETS=demo=change-me-demo-webhook-secret,billing=change-me-billing-webhook-secret
# Max age (and clock skew) of the signed timestamp, in seconds
WEBHOOK_TOLERANCE_SEC=300

# Per-source rate limit
RATE_LIMIT_MAX=120
RATE_LIMIT_WINDOW_MS=60000

# Delivery log size (also the deduplication window)
DELIVERY_LOG_SIZE=1000

# Processing queue
QUEUE_CONCURRENCY=4
QUEUE_POLL_MS=100
JOB_MAX_ATTEMPTS=5
JOB_TIMEOUT_MS=30000
# exponential or fixed
RETRY_BACKOFF=exponential
RETRY_DELAY_MS=1000
`,

    'src/config.ts': `/**
 * Typed configuration, read from environment variables.
 * loadEnv() in src/main.ts fills process.env from .env first.
 */

import { defineConfig } from '@axiljs/config'

export function loadConfig(source: Record<string, string | undefined> = process.env) {
  return defineConfig({
    PORT:                  { type: 'number', default: 3007, min: 0, max: 65535 },
    HOST:                  { type: 'string', default: '127.0.0.1' },
    NODE_ENV:              { type: 'string', default: 'development', enum: ['development', 'production', 'test'] },

    // "source=secret,source2=secret2"
    WEBHOOK_SECRETS:       { type: 'string', required: true },
    WEBHOOK_TOLERANCE_SEC: { type: 'number', default: 300, min: 1 },

    RATE_LIMIT_MAX:        { type: 'number', default: 120, min: 1 },
    RATE_LIMIT_WINDOW_MS:  { type: 'number', default: 60000, min: 1000 },

    DELIVERY_LOG_SIZE:     { type: 'number', default: 1000, min: 10 },

    QUEUE_CONCURRENCY:     { type: 'number', default: 4, min: 1, max: 100 },
    QUEUE_POLL_MS:         { type: 'number', default: 100, min: 1, max: 60000 },
    JOB_MAX_ATTEMPTS:      { type: 'number', default: 5, min: 1, max: 20 },
    // Per-attempt timeout, 0 = none
    JOB_TIMEOUT_MS:        { type: 'number', default: 30000, min: 0 },
    RETRY_BACKOFF:         { type: 'string', default: 'exponential', enum: ['exponential', 'fixed'] },
    RETRY_DELAY_MS:        { type: 'number', default: 1000, min: 0 }
  }, source)
}

export type Config = ReturnType<typeof loadConfig>

/**
 * Parse WEBHOOK_SECRETS ("demo=secret,billing=secret") into source -> secret.
 * Throws on malformed entries so a typo fails at startup, not on the first delivery.
 */
export function parseSecrets(value: string): Map<string, string> {
  const secrets = new Map<string, string>()
  for (const entry of value.split(',').map(e => e.trim()).filter(Boolean)) {
    const eq = entry.indexOf('=')
    const source = eq === -1 ? '' : entry.slice(0, eq).trim()
    const secret = eq === -1 ? '' : entry.slice(eq + 1).trim()
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(source) || !secret) {
      throw new Error(\`WEBHOOK_SECRETS: expected "source=secret" (source: a-z, 0-9, - or _), got "\${entry.split('=')[0]}=..."\`)
    }
    secrets.set(source, secret)
  }
  if (secrets.size === 0) throw new Error('WEBHOOK_SECRETS: configure at least one source=secret pair')
  return secrets
}
`,

    'src/main.ts': `/**
 * ${ctx.name}
 * Entry point: load .env, start the workers, listen.
 */

import { loadEnv } from '@axiljs/config'
import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { createWebhookSystem } from './webhooks/system.js'

loadEnv()

const config = loadConfig()
const system = createWebhookSystem(config)
const app    = createApp(config, system)

system.start()
await app.listen()

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    // Stop accepting deliveries, then let running handlers finish
    await app.close()
    await system.stop()
    process.exit(0)
  })
}
`,

    'src/app.ts': `/**
 * Application factory.
 * Builds the app without listening, so tests can drive it directly.
 */

import { Application, NotFoundError, axilError } from '@axiljs/core'
import type { MiddlewareFn } from '@axiljs/core'
import { rateLimit } from '@axiljs/security'
import { v, validate } from '@axiljs/validation'
import { parseSecrets } from './config.js'
import type { Config } from './config.js'
import { errorHandler } from './middleware/error-handler.js'
import { DELIVERY_STATUSES } from './webhooks/deliveries.js'
import type { Delivery, DeliveryStatus } from './webhooks/deliveries.js'
import type { WebhookEvent } from './webhooks/handlers.js'
import { captureRawBody } from './webhooks/raw-body.js'
import type { WebhookSystem } from './webhooks/system.js'
import { verifyWebhook } from './webhooks/verify.js'

export const SERVICE = '${ctx.name}'
export const VERSION = '1.0.0'

// ─── Schemas ──────────────────────────────────────────────────────────────────

// Only id and type are required; everything else in the event is kept as-is
const EventBody = v.object({
  id:   v.string().min(1).max(255),
  type: v.string().min(1).max(255)
})

const DeliveryParams = v.object({ id: v.string().min(1).max(100) })

const DeliveriesQuery = v.object({
  status: v.enum(DELIVERY_STATUSES).optional(),
  source: v.string().max(64).optional(),
  limit:  v.string().pattern(/^\\d{1,3}$/).optional()
})

// ─── App ──────────────────────────────────────────────────────────────────────

export function createApp(config: Config, system: WebhookSystem): Application {
  // Signatures are computed over the exact bytes received
  captureRawBody()

  const secrets = parseSecrets(config.WEBHOOK_SECRETS)

  const app = new Application({
    server:  { port: config.PORT, host: config.HOST, methodNotAllowed: true },
    env:     config.NODE_ENV,
    logging: config.NODE_ENV !== 'test'
  })

  app.get('/', (_req, res) => {
    res.success({
      service: SERVICE,
      version: VERSION,
      sources: [...secrets.keys()],
      endpoints: [
        'GET  /',
        'GET  /health',
        'POST /webhooks/:source',
        'GET  /deliveries',
        'GET  /deliveries/:id',
        'POST /deliveries/:id/retry'
      ]
    }, 'Service info')
  })

  app.get('/health', (_req, res) => {
    res.json({
      status:    'ok',
      uptime:    Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      queue:     system.queue.getStats()
    })
  })

  // ─── Receive ────────────────────────────────────────────────────────────────

  app.post('/webhooks/:source',
    perSourceRateLimit(config, [...secrets.keys()]),
    verifyWebhook(secrets, config.WEBHOOK_TOLERANCE_SEC),
    validate({ body: EventBody }),
    async (req, res) => {
      const { delivery, duplicate } = await system.receive(req.params.source, req.body as WebhookEvent)
      const data = { deliveryId: delivery.id, eventId: delivery.eventId, status: delivery.status }

      if (duplicate) {
        // 2xx so the sender stops retrying; nothing is processed twice
        res.success({ ...data, duplicate: true }, 'Duplicate delivery ignored')
        return
      }

      res.status(202).json({
        status:  202,
        code:    'HTTP_202_ACCEPTED',
        message: 'Webhook accepted',
        data:    { ...data, duplicate: false }
      })
    }
  )

  // ─── Delivery log ───────────────────────────────────────────────────────────

  app.get('/deliveries', validate({ query: DeliveriesQuery }), (req, res) => {
    const { status, source, limit } = req.query as { status?: DeliveryStatus, source?: string, limit?: string }
    const list = system.deliveries.list({ status, source, limit: Math.min(Number(limit ?? 50), 200) })
    res.success(list.map(summary), 'Recent deliveries')
  })

  app.get('/deliveries/:id', validate({ params: DeliveryParams }), (req, res) => {
    const delivery = system.deliveries.get(req.params.id)
    if (!delivery) throw new NotFoundError(\`Delivery \${req.params.id} not found\`)
    res.success(delivery, 'Delivery')
  })

  app.post('/deliveries/:id/retry', validate({ params: DeliveryParams }), async (req, res) => {
    const delivery = system.deliveries.get(req.params.id)
    if (!delivery) throw new NotFoundError(\`Delivery \${req.params.id} not found\`)
    if (delivery.status !== 'failed') {
      throw new axilError(\`Only failed deliveries can be retried (status: \${delivery.status})\`, 409, 'CONFLICT')
    }
    const updated = await system.retry(delivery.id)
    res.status(202).json({
      status:  202,
      code:    'HTTP_202_ACCEPTED',
      message: 'Delivery re-queued',
      data:    { deliveryId: updated.id, status: updated.status }
    })
  })

  app.use(errorHandler(config.NODE_ENV))

  return app
}

/**
 * One rate limiter per source, so a noisy sender can't starve the others.
 * Unknown sources get a 404 before they touch any bucket.
 */
function perSourceRateLimit(config: Config, sources: string[]): MiddlewareFn {
  const limiters = new Map(sources.map(source => [source, rateLimit({
    windowMs:     config.RATE_LIMIT_WINDOW_MS,
    max:          config.RATE_LIMIT_MAX,
    keyGenerator: () => source,
    message:      \`Too many deliveries from \${source}, slow down\`
  })]))

  return (req, res, next) => {
    const limiter = limiters.get(req.params.source)
    if (!limiter) return next(new NotFoundError(\`Unknown webhook source: \${req.params.source}\`))
    return limiter(req, res, next)
  }
}

/** List view: everything except the payload. */
function summary({ payload: _payload, ...rest }: Delivery) {
  return rest
}
`,

    'src/webhooks/raw-body.ts': `/**
 * Keep the raw request body for signature verification.
 *
 * The built-in body parser runs before any app middleware and, for JSON,
 * keeps only the parsed object. HMACs must be checked against the exact bytes
 * that were sent, so this wraps Request.prototype.readBody (which the parser
 * calls) to also store the string it read in req.locals.rawBody.
 *
 * Installed once per process; calling it again is a no-op.
 */

import { Request } from '@axiljs/core'
import type { axilRequest } from '@axiljs/core'

const RAW_BODY = 'rawBody'
let installed = false

export function captureRawBody(): void {
  if (installed) return
  installed = true

  const readBody = Request.prototype.readBody
  Request.prototype.readBody = async function (this: Request, limit?: number): Promise<string> {
    const body = await readBody.call(this, limit)
    this.locals[RAW_BODY] = body
    return body
  }
}

/** The body exactly as received (UTF-8 decoded), or '' when there was none. */
export function rawBodyOf(req: axilRequest): string {
  const raw = req.locals[RAW_BODY]
  return typeof raw === 'string' ? raw : ''
}
`,

    'src/webhooks/signature.ts': `/**
 * Webhook signatures.
 *
 *   Webhook-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>
 *
 * The timestamp is part of the signed string, so it can't be altered, and
 * requests outside the tolerance are refused: a captured delivery can't be
 * replayed later. Several v1 values are allowed (secret rotation).
 */

import { createHmac, timingSafeEqual } from 'node:crypto'

/** Header name (Node lower-cases incoming header names). */
export const SIGNATURE_HEADER = 'webhook-signature'

export type VerifyFailure = 'missing' | 'malformed' | 'mismatch' | 'stale'

export type VerifyResult =
  | { ok: true, timestamp: number }
  | { ok: false, reason: VerifyFailure }

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

/** Hex HMAC-SHA256 of "<timestamp>.<body>". */
export function sign(secret: string, timestamp: number, rawBody: string): string {
  return hmac(secret, timestamp, rawBody).toString('hex')
}

/** Header value for a body, e.g. "t=1731300000,v1=5257a8...". */
export function signatureHeader(secret: string, rawBody: string, timestamp = nowSeconds()): string {
  return \`t=\${timestamp},v1=\${sign(secret, timestamp, rawBody)}\`
}

export function verifySignature(
  header: string | undefined,
  rawBody: string,
  secret: string,
  toleranceSec: number,
  nowMs = Date.now()
): VerifyResult {
  if (!header) return { ok: false, reason: 'missing' }

  let timestamp: number | undefined
  const candidates: string[] = []
  for (const part of header.split(',')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const key = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (key === 't') timestamp = /^\\d{1,12}$/.test(value) ? Number(value) : NaN
    else if (key === 'v1') candidates.push(value)
  }
  if (timestamp === undefined || Number.isNaN(timestamp) || candidates.length === 0) {
    return { ok: false, reason: 'malformed' }
  }

  // Signature first: a forged request learns nothing about the time window
  const expected = hmac(secret, timestamp, rawBody)
  const matches = candidates.some(candidate =>
    /^[0-9a-f]{64}$/i.test(candidate) &&
    // Constant-time comparison: no timing hints about how many bytes matched
    timingSafeEqual(Buffer.from(candidate, 'hex'), expected)
  )
  if (!matches) return { ok: false, reason: 'mismatch' }

  if (Math.abs(nowMs / 1000 - timestamp) > toleranceSec) return { ok: false, reason: 'stale' }

  return { ok: true, timestamp }
}

function hmac(secret: string, timestamp: number, rawBody: string): Buffer {
  return createHmac('sha256', secret).update(\`\${timestamp}.\`).update(rawBody, 'utf8').digest()
}
`,

    'src/webhooks/verify.ts': `/**
 * Middleware: reject deliveries without a valid, fresh signature (401).
 * Runs after the per-source rate limit and before body validation.
 */

import { NotFoundError, axilError } from '@axiljs/core'
import type { MiddlewareFn } from '@axiljs/core'
import { rawBodyOf } from './raw-body.js'
import { SIGNATURE_HEADER, verifySignature } from './signature.js'
import type { VerifyFailure } from './signature.js'

const FAILURES: Record<VerifyFailure, [code: string, message: string]> = {
  missing:   ['MISSING_SIGNATURE', \`Missing \${SIGNATURE_HEADER} header\`],
  malformed: ['INVALID_SIGNATURE', \`Malformed \${SIGNATURE_HEADER} header (expected t=<seconds>,v1=<hex>)\`],
  mismatch:  ['INVALID_SIGNATURE', 'Signature does not match'],
  stale:     ['TIMESTAMP_OUT_OF_TOLERANCE', 'Signature timestamp is outside the allowed window']
}

export function verifyWebhook(secrets: Map<string, string>, toleranceSec: number): MiddlewareFn {
  return (req, _res, next) => {
    const secret = secrets.get(req.params.source)
    if (!secret) return next(new NotFoundError(\`Unknown webhook source: \${req.params.source}\`))

    const header = req.headers[SIGNATURE_HEADER]
    const result = verifySignature(Array.isArray(header) ? header[0] : header, rawBodyOf(req), secret, toleranceSec)

    if (!result.ok) {
      const [code, message] = FAILURES[result.reason]
      return next(new axilError(message, 401, code))
    }
    next()
  }
}
`,

    'src/webhooks/deliveries.ts': `/**
 * Delivery log and idempotency.
 *
 * Every verified request becomes a delivery. The (source, event id) pair is
 * unique: receiving it again returns the existing delivery instead of a new
 * one, so an event is processed once even when the sender retries.
 *
 * In memory and bounded: the oldest deliveries are dropped past \`capacity\`,
 * which is also how far back duplicates are detected. Use a database table
 * with a unique (source, event_id) index for more.
 */

import { randomUUID } from 'node:crypto'
import type { WebhookEvent } from './handlers.js'

export const DELIVERY_STATUSES = ['queued', 'processing', 'retrying', 'processed', 'failed'] as DeliveryStatus[]

export type DeliveryStatus = 'queued' | 'processing' | 'retrying' | 'processed' | 'failed'

export interface Delivery {
  id:           string
  source:       string
  eventId:      string
  type:         string
  status:       DeliveryStatus
  attempts:     number
  receivedAt:   string
  processedAt?: string
  error?:       string
  result?:      unknown
  payload:      WebhookEvent
}

export interface ListOptions {
  status?: DeliveryStatus
  source?: string
  limit?:  number
}

export class DeliveryLog {
  // Insertion order = arrival order
  private byId  = new Map<string, Delivery>()
  private byKey = new Map<string, string>()

  constructor(private readonly capacity = 1000) {}

  /**
   * Record a delivery unless this source already sent this event id.
   * Synchronous, so two concurrent identical requests can't both win.
   */
  claim(source: string, event: WebhookEvent): { delivery: Delivery, duplicate: boolean } {
    const key = \`\${source}:\${event.id}\`
    const existingId = this.byKey.get(key)
    const existing = existingId ? this.byId.get(existingId) : undefined
    if (existing) return { delivery: existing, duplicate: true }

    const delivery: Delivery = {
      id:         \`dlv_\${randomUUID()}\`,
      source,
      eventId:    event.id,
      type:       event.type,
      status:     'queued',
      attempts:   0,
      receivedAt: new Date().toISOString(),
      payload:    event
    }
    this.byId.set(delivery.id, delivery)
    this.byKey.set(key, delivery.id)
    this.evict()
    return { delivery, duplicate: false }
  }

  get(id: string): Delivery | undefined {
    return this.byId.get(id)
  }

  update(id: string, patch: Partial<Omit<Delivery, 'id' | 'source' | 'eventId' | 'payload'>>): Delivery | undefined {
    const delivery = this.byId.get(id)
    if (delivery) Object.assign(delivery, patch)
    return delivery
  }

  /** Newest first. */
  list({ status, source, limit = 50 }: ListOptions = {}): Delivery[] {
    const out: Delivery[] = []
    for (const delivery of [...this.byId.values()].reverse()) {
      if (status && delivery.status !== status) continue
      if (source && delivery.source !== source) continue
      out.push(delivery)
      if (out.length >= limit) break
    }
    return out
  }

  private evict(): void {
    while (this.byId.size > this.capacity) {
      const oldest = this.byId.values().next().value as Delivery
      this.byId.delete(oldest.id)
      this.byKey.delete(\`\${oldest.source}:\${oldest.eventId}\`)
    }
  }
}
`,

    'src/webhooks/handlers.ts': `/**
 * What to do with each event type. Handlers run on the queue, after the
 * sender already got its 202: they may be slow, and a thrown error is
 * retried with backoff until JOB_MAX_ATTEMPTS, then the delivery is failed.
 *
 * Handlers must be idempotent too: an attempt that timed out may have done
 * part of its work before it is retried.
 */

export interface WebhookEvent {
  id:       string
  type:     string
  created?: number
  data?:    unknown
  [key: string]: unknown
}

export interface HandlerContext {
  source:     string
  deliveryId: string
  attempt:    number
  /** Aborted when the attempt times out. */
  signal?:    AbortSignal
}

export type EventHandler = (event: WebhookEvent, context: HandlerContext) => Promise<unknown>

/** Event type -> handler. '*' handles any type without its own entry. */
export type EventHandlers = Record<string, EventHandler>

export function defaultHandlers(log: (message: string) => void = console.log): EventHandlers {
  return {
    'order.created': async (event, { source }) => {
      const order = (event.data ?? {}) as { orderId?: string, total?: number }
      log(\`[\${source}] order \${order.orderId ?? '?'} created (total \${order.total ?? 0})\`)
      // e.g. reserve stock, send a confirmation, sync to the warehouse...
      return { action: 'order-recorded', orderId: order.orderId ?? null }
    },

    'invoice.paid': async (event, { source }) => {
      const invoice = (event.data ?? {}) as { invoiceId?: string }
      log(\`[\${source}] invoice \${invoice.invoiceId ?? '?'} paid\`)
      return { action: 'invoice-marked-paid', invoiceId: invoice.invoiceId ?? null }
    },

    // Acknowledge everything else so the sender doesn't retry it
    '*': async event => ({ action: 'ignored', type: event.type })
  }
}
`,

    'src/webhooks/system.ts': `/**
 * Processing: a queue whose workers run the event handlers, and the delivery
 * log that the HTTP layer and the workers share.
 */

import { Queue } from '@axiljs/queue'
import type { Job, JobContext } from '@axiljs/queue'
import type { Config } from '../config.js'
import { DeliveryLog } from './deliveries.js'
import type { Delivery } from './deliveries.js'
import { defaultHandlers } from './handlers.js'
import type { EventHandlers, WebhookEvent } from './handlers.js'

const PROCESS = 'process-webhook'

interface ProcessData {
  deliveryId: string
}

export interface WebhookSystemDeps {
  /** Defaults to defaultHandlers(); tests pass their own. */
  handlers?: EventHandlers
}

export interface WebhookSystem {
  queue:      Queue
  deliveries: DeliveryLog
  /** Record the delivery (idempotently) and queue it for processing. */
  receive(source: string, event: WebhookEvent): Promise<{ delivery: Delivery, duplicate: boolean }>
  /** Queue a failed delivery again. */
  retry(deliveryId: string): Promise<Delivery>
  start(): void
  stop(): Promise<void>
}

export function createWebhookSystem(config: Config, deps: WebhookSystemDeps = {}): WebhookSystem {
  const quiet      = config.NODE_ENV === 'test'
  const handlers   = deps.handlers ?? defaultHandlers(quiet ? () => {} : console.log)
  const deliveries = new DeliveryLog(config.DELIVERY_LOG_SIZE)

  const queue = new Queue('webhooks', {
    concurrency:    config.QUEUE_CONCURRENCY,
    pollIntervalMs: config.QUEUE_POLL_MS,
    backoff:        { type: config.RETRY_BACKOFF === 'fixed' ? 'fixed' : 'exponential', delay: config.RETRY_DELAY_MS }
  })

  queue.process<ProcessData>(PROCESS, async (job: Job<ProcessData>, context?: JobContext) => {
    const delivery = deliveries.get(job.data.deliveryId)
    // Evicted from the log while waiting: nothing left to process
    if (!delivery) return { skipped: true }

    deliveries.update(delivery.id, { status: 'processing', attempts: job.attempts })
    const handler = handlers[delivery.type] ?? handlers['*']
    if (!handler) return { action: 'ignored', type: delivery.type }

    return handler(delivery.payload, {
      source:     delivery.source,
      deliveryId: delivery.id,
      attempt:    job.attempts,
      signal:     context?.signal
    })
  })

  queue.on('completed', (job: Job<ProcessData>, result: unknown) => {
    deliveries.update(job.data.deliveryId, { status: 'processed', processedAt: new Date().toISOString(), result, error: undefined })
  })
  queue.on('retry', (job: Job<ProcessData>, err: Error) => {
    deliveries.update(job.data.deliveryId, { status: 'retrying', error: err.message })
  })
  queue.on('failed', (job: Job<ProcessData>, err: Error) => {
    deliveries.update(job.data.deliveryId, { status: 'failed', processedAt: new Date().toISOString(), error: err.message })
    if (!quiet) console.warn(\`[webhooks] delivery \${job.data.deliveryId} failed after \${job.attempts} attempt(s): \${err.message}\`)
  })

  const enqueue = (deliveryId: string) => queue.add<ProcessData>(PROCESS, { deliveryId }, {
    maxAttempts: config.JOB_MAX_ATTEMPTS,
    timeoutMs:   config.JOB_TIMEOUT_MS > 0 ? config.JOB_TIMEOUT_MS : undefined
  })

  return {
    queue,
    deliveries,
    async receive(source, event) {
      const claimed = deliveries.claim(source, event)
      if (!claimed.duplicate) await enqueue(claimed.delivery.id)
      return claimed
    },
    async retry(deliveryId) {
      const delivery = deliveries.update(deliveryId, { status: 'queued', error: undefined, processedAt: undefined })
      if (!delivery) throw new Error(\`Delivery \${deliveryId} not found\`)
      await enqueue(deliveryId)
      return delivery
    },
    start() {
      queue.start()
    },
    stop() {
      return queue.stop()
    }
  }
}
`,

    'src/webhooks/sender.ts': `/**
 * Sign and POST a webhook: what a provider does. Used by
 * \`npm run send-test-webhook\` and the tests.
 */

import { SIGNATURE_HEADER, signatureHeader } from './signature.js'

export interface SendOptions {
  url:        string
  /** Exact body to send (and sign). */
  body:       string
  secret:     string
  /** Unix seconds; defaults to now. */
  timestamp?: number
}

export async function sendWebhook({ url, body, secret, timestamp }: SendOptions): Promise<{ status: number, body: any }> {
  const res = await fetch(url, {
    method:  'POST',
    headers: {
      'content-type':   'application/json',
      [SIGNATURE_HEADER]: signatureHeader(secret, body, timestamp)
    },
    body
  })
  const text = await res.text()
  let parsed: unknown = text
  try { parsed = JSON.parse(text) } catch { /* not JSON */ }
  return { status: res.status, body: parsed }
}
`,

    'src/scripts/send-test-webhook.ts': `/**
 * npm run send-test-webhook [-- options]
 *
 * Signs a sample event with the source's secret from .env and POSTs it to the
 * running server. The body is pretty-printed JSON on purpose: the signature
 * covers the exact bytes, whitespace included.
 *
 *   --source <name>     secret to use and URL segment (default: demo)
 *   --type <type>       event type (default: order.created)
 *   --id <id>           event id (default: random)
 *   --url <url>         target (default: http://localhost:$PORT/webhooks/<source>)
 *   --duplicate         send the same event twice (second answer: 200 duplicate)
 *   --bad-signature     sign with a wrong secret (401)
 *   --stale             sign with a timestamp outside the tolerance (401)
 */

import { randomUUID } from 'node:crypto'
import { parseArgs } from 'node:util'
import { loadEnv } from '@axiljs/config'
import { loadConfig, parseSecrets } from '../config.js'
import { sendWebhook } from '../webhooks/sender.js'
import { nowSeconds } from '../webhooks/signature.js'

loadEnv()

const { values: args } = parseArgs({
  options: {
    source:          { type: 'string', default: 'demo' },
    type:            { type: 'string', default: 'order.created' },
    id:              { type: 'string' },
    url:             { type: 'string' },
    duplicate:       { type: 'boolean', default: false },
    'bad-signature': { type: 'boolean', default: false },
    stale:           { type: 'boolean', default: false }
  }
})

const config = loadConfig()
const source = args.source
const secret = parseSecrets(config.WEBHOOK_SECRETS).get(source)
if (!secret) {
  console.error(\`No secret for source "\${source}" in WEBHOOK_SECRETS\`)
  process.exit(1)
}

const url = args.url ?? \`http://localhost:\${config.PORT}/webhooks/\${source}\`
const now = nowSeconds()
const event = {
  id:      args.id ?? \`evt_\${randomUUID()}\`,
  type:    args.type,
  created: now,
  data:    args.type === 'invoice.paid'
    ? { invoiceId: \`inv_\${Math.floor(Math.random() * 1e6)}\`, amount: 4200, currency: 'EUR' }
    : { orderId: \`ord_\${Math.floor(Math.random() * 1e6)}\`, total: 4200, items: [{ sku: 'AXIL-TEE', qty: 1 }] }
}
const body = JSON.stringify(event, null, 2)

console.log(\`POST \${url}  event \${event.id} (\${event.type})\`)
try {
  for (let i = 0; i < (args.duplicate ? 2 : 1); i++) {
    const res = await sendWebhook({
      url,
      body,
      secret:    args['bad-signature'] ? 'not-the-right-secret' : secret,
      timestamp: args.stale ? now - config.WEBHOOK_TOLERANCE_SEC - 60 : now
    })
    console.log(res.status, JSON.stringify(res.body))
  }
} catch (err) {
  console.error(\`Request failed: \${(err as Error).message}. Is the server running (npm run dev)?\`)
  process.exit(1)
}
`,

    'src/middleware/error-handler.ts': `/**
 * Error handler: turns thrown errors into one JSON shape.
 *
 *   { "error": { "code": "INVALID_SIGNATURE", "message": "...", "details": [...] } }
 *
 * axilError subclasses (NotFoundError, ValidationError, ...) keep their status
 * and code; anything else is a 500 whose message is hidden in production.
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

    'src/test-utils.ts': `/**
 * Test helpers: fast config, signed requests and a poll-until-done helper.
 */

import { setTimeout as sleep } from 'node:timers/promises'
import { createTestClient } from '@axiljs/testing'
import type { TestClient, TestResponse } from '@axiljs/testing'
import type { Application } from '@axiljs/core'
import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { SIGNATURE_HEADER, signatureHeader } from './webhooks/signature.js'
import { createWebhookSystem } from './webhooks/system.js'
import type { WebhookSystem, WebhookSystemDeps } from './webhooks/system.js'

export const SECRETS = {
  demo:    'test-only-demo-secret',
  billing: 'test-only-billing-secret'
}

export const TEST_ENV: Record<string, string> = {
  NODE_ENV:         'test',
  WEBHOOK_SECRETS:  \`demo=\${SECRETS.demo},billing=\${SECRETS.billing}\`,
  QUEUE_POLL_MS:    '5',
  RETRY_BACKOFF:    'fixed',
  RETRY_DELAY_MS:   '5',
  JOB_MAX_ATTEMPTS: '3',
  JOB_TIMEOUT_MS:   '2000'
}

export interface Harness {
  app:    Application
  system: WebhookSystem
  client: TestClient
}

/** Build a started webhook system + app. Call system.stop() in afterAll. */
export function setup(env: Record<string, string> = {}, deps: WebhookSystemDeps = {}): Harness {
  const config = loadConfig({ ...TEST_ENV, ...env })
  const system = createWebhookSystem(config, deps)
  system.start()
  const app = createApp(config, system)
  return { app, system, client: createTestClient(app) }
}

let counter = 0

/** A sample event with a unique id. */
export function sampleEvent(type = 'order.created', data: unknown = { orderId: 'ord_1', total: 4200 }) {
  return { id: \`evt_test_\${++counter}_\${Date.now()}\`, type, created: Math.floor(Date.now() / 1000), data }
}

export interface PostOptions {
  secret?:    string
  timestamp?: number
  /** Override the signature header; null sends none. */
  header?:    string | null
}

/**
 * POST a signed event. The test client sends JSON.stringify(payload) for
 * application/json, so that is what gets signed.
 */
export async function postWebhook(client: TestClient, source: string, payload: unknown, options: PostOptions = {}): Promise<TestResponse> {
  const secret = options.secret ?? (SECRETS as Record<string, string>)[source] ?? 'unknown'
  const header = options.header === undefined
    ? signatureHeader(secret, JSON.stringify(payload), options.timestamp)
    : options.header
  const req = client.post(\`/webhooks/\${source}\`)
  if (header !== null) req.set(SIGNATURE_HEADER, header)
  return await req.send(payload)
}

const DONE = ['processed', 'failed']

/** Poll GET /deliveries/:id until it reaches one of the given statuses. */
export async function waitForDelivery(client: TestClient, id: string, until: string[] = DONE, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const res = await client.get(\`/deliveries/\${id}\`)
    if (res.status === 200 && until.includes(res.body.data.status)) return res.body.data
    if (Date.now() > deadline) {
      throw new Error(\`Delivery \${id} did not reach \${until.join('/')} within \${timeoutMs} ms (last: \${res.body.data?.status})\`)
    }
    await sleep(5)
  }
}
`,

    'src/app.test.ts': `import { describe, it, expect, afterAll } from '@axiljs/testing'
import { setTimeout as sleep } from 'node:timers/promises'
import { SERVICE } from './app.js'
import type { EventHandlers, WebhookEvent } from './webhooks/handlers.js'
import { sendWebhook } from './webhooks/sender.js'
import { sign as signHex } from './webhooks/signature.js'
import { SECRETS, postWebhook, sampleEvent, setup, waitForDelivery } from './test-utils.js'

// Records every event the queue workers process
function recordingHandlers() {
  const processed: Array<{ source: string, event: WebhookEvent }> = []
  const handlers: EventHandlers = {
    '*': async (event, { source }) => {
      processed.push({ source, event })
      return { ok: true }
    }
  }
  return { processed, handlers }
}

describe('service', () => {
  const { system, client } = setup()
  afterAll(() => system.stop())

  it('describes itself and its sources', async () => {
    const res = await client.get('/')
    expect(res.status).toBe(200)
    expect(res.body.data.service).toBe(SERVICE)
    expect(res.body.data.sources).toEqual(['demo', 'billing'])
  })

  it('reports health', async () => {
    const res = await client.get('/health')
    expect(res.status).toBe(200)
    expect(res.body.status).toBe('ok')
  })
})

describe('signature verification', () => {
  const { processed, handlers } = recordingHandlers()
  const { system, client } = setup({}, { handlers })
  afterAll(() => system.stop())

  it('accepts a valid signature with 202 and processes the event on the queue', async () => {
    const event = sampleEvent('order.created', { orderId: 'ord_42', total: 1999 })
    const res = await postWebhook(client, 'demo', event)
    expect(res.status).toBe(202)
    expect(res.body.code).toBe('HTTP_202_ACCEPTED')
    expect(res.body.data.eventId).toBe(event.id)
    expect(res.body.data.status).toBe('queued')
    expect(res.body.data.duplicate).toBe(false)

    const delivery = await waitForDelivery(client, res.body.data.deliveryId)
    expect(delivery.status).toBe('processed')
    expect(delivery.attempts).toBe(1)
    expect(delivery.result).toEqual({ ok: true })

    const seen = processed.find(p => p.event.id === event.id)!
    expect(seen.source).toBe('demo')
    expect(seen.event.data).toEqual({ orderId: 'ord_42', total: 1999 })
  })

  it('rejects a missing signature with 401 and queues nothing', async () => {
    const before = system.queue.getJobs().length
    const res = await postWebhook(client, 'demo', sampleEvent(), { header: null })
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('MISSING_SIGNATURE')
    expect(system.queue.getJobs().length).toBe(before)
  })

  it('rejects a signature made with the wrong secret', async () => {
    const res = await postWebhook(client, 'demo', sampleEvent(), { secret: SECRETS.billing })
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('INVALID_SIGNATURE')
  })

  it('rejects a body that was changed after signing', async () => {
    const event = sampleEvent()
    const header = postHeaderFor({ ...event, data: { orderId: 'ord_1', total: 1 } })
    const res = await postWebhook(client, 'demo', event, { header })
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('INVALID_SIGNATURE')
  })

  it('rejects a malformed header', async () => {
    const res = await postWebhook(client, 'demo', sampleEvent(), { header: 'sha256=deadbeef' })
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('INVALID_SIGNATURE')
  })

  it('rejects a stale timestamp (replay) and one from the future', async () => {
    const now = Math.floor(Date.now() / 1000)
    const old = await postWebhook(client, 'demo', sampleEvent(), { timestamp: now - 301 })
    expect(old.status).toBe(401)
    expect(old.body.error.code).toBe('TIMESTAMP_OUT_OF_TOLERANCE')

    const future = await postWebhook(client, 'demo', sampleEvent(), { timestamp: now + 301 })
    expect(future.status).toBe(401)
    expect(future.body.error.code).toBe('TIMESTAMP_OUT_OF_TOLERANCE')
  })

  it('returns 404 for a source without a secret', async () => {
    const res = await postWebhook(client, 'unknown', sampleEvent())
    expect(res.status).toBe(404)
  })

  it('returns 422 for a signed body that is not an event', async () => {
    const res = await postWebhook(client, 'demo', { hello: 'world' })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })
})

// Same signing as postWebhook, for a different body
function postHeaderFor(payload: unknown): string {
  const t = Math.floor(Date.now() / 1000)
  return \`t=\${t},v1=\${signHex(SECRETS.demo, t, JSON.stringify(payload))}\`
}

describe('idempotency', () => {
  const { processed, handlers } = recordingHandlers()
  const { system, client } = setup({}, { handlers })
  afterAll(() => system.stop())

  it('processes a duplicate event id once and answers 200 the second time', async () => {
    const event = sampleEvent()
    const first = await postWebhook(client, 'demo', event)
    const second = await postWebhook(client, 'demo', event)

    expect(first.status).toBe(202)
    expect(second.status).toBe(200)
    expect(second.body.data.duplicate).toBe(true)
    expect(second.body.data.deliveryId).toBe(first.body.data.deliveryId)

    await waitForDelivery(client, first.body.data.deliveryId)
    // A retry after processing is still a duplicate
    const third = await postWebhook(client, 'demo', event)
    expect(third.status).toBe(200)
    expect(third.body.data.status).toBe('processed')

    await sleep(30)
    expect(processed.filter(p => p.event.id === event.id).length).toBe(1)
  })

  it('treats the same event id from another source as a new delivery', async () => {
    const event = sampleEvent()
    const a = await postWebhook(client, 'demo', event)
    const b = await postWebhook(client, 'billing', event)
    expect(a.status).toBe(202)
    expect(b.status).toBe(202)
    expect(b.body.data.deliveryId).not.toBe(a.body.data.deliveryId)
  })
})

describe('queue processing', () => {
  let calls = 0
  const handlers: EventHandlers = {
    // Fails twice, then succeeds
    'flaky.event': async (_event, { attempt }) => {
      calls++
      if (attempt < 3) throw new Error(\`temporary failure \${attempt}\`)
      return { attempt }
    },
    'broken.event': async () => { throw new Error('downstream unavailable') }
  }
  const { system, client } = setup({}, { handlers })
  afterAll(() => system.stop())

  it('retries a failing handler with backoff until it succeeds', async () => {
    const res = await postWebhook(client, 'demo', sampleEvent('flaky.event'))
    const delivery = await waitForDelivery(client, res.body.data.deliveryId)
    expect(delivery.status).toBe('processed')
    expect(delivery.attempts).toBe(3)
    expect(delivery.result).toEqual({ attempt: 3 })
    expect(calls).toBe(3)
  })

  it('marks the delivery failed after JOB_MAX_ATTEMPTS, and can retry it', async () => {
    const res = await postWebhook(client, 'demo', sampleEvent('broken.event'))
    const delivery = await waitForDelivery(client, res.body.data.deliveryId)
    expect(delivery.status).toBe('failed')
    expect(delivery.attempts).toBe(3)
    expect(delivery.error).toBe('downstream unavailable')

    const retry = await client.post(\`/deliveries/\${delivery.id}/retry\`)
    expect(retry.status).toBe(202)
    expect((await waitForDelivery(client, delivery.id)).status).toBe('failed')
  })

  it('refuses to retry a delivery that did not fail (409)', async () => {
    const res = await postWebhook(client, 'demo', sampleEvent('flaky.event'))
    await waitForDelivery(client, res.body.data.deliveryId)
    const retry = await client.post(\`/deliveries/\${res.body.data.deliveryId}/retry\`)
    expect(retry.status).toBe(409)
  })

  it('lists deliveries newest first, filtered by status, without payloads', async () => {
    const res = await client.get('/deliveries?status=failed')
    expect(res.status).toBe(200)
    expect(res.body.data.length).toBe(1)
    expect(res.body.data[0].type).toBe('broken.event')
    expect(res.body.data[0].payload).toBeUndefined()

    const all = await client.get('/deliveries?limit=2')
    expect(all.body.data.length).toBe(2)
    expect(all.body.data[0].type).toBe('flaky.event')
  })

  it('returns 404 for an unknown delivery', async () => {
    expect((await client.get('/deliveries/dlv_nope')).status).toBe(404)
  })
})

describe('per-source rate limit', () => {
  const { system, client } = setup({ RATE_LIMIT_MAX: '2' })
  afterAll(() => system.stop())

  it('answers 429 once a source exceeds its budget, without affecting other sources', async () => {
    expect((await postWebhook(client, 'demo', sampleEvent())).status).toBe(202)
    expect((await postWebhook(client, 'demo', sampleEvent())).status).toBe(202)

    const limited = await postWebhook(client, 'demo', sampleEvent())
    expect(limited.status).toBe(429)
    expect(limited.body.error.code).toBe('RATE_LIMIT_EXCEEDED')
    expect(limited.headers['retry-after']).toBeDefined()

    expect((await postWebhook(client, 'billing', sampleEvent())).status).toBe(202)
  })
})

describe('raw body over real HTTP', () => {
  const { processed, handlers } = recordingHandlers()
  const { app, system } = setup({}, { handlers })
  let url = ''
  afterAll(async () => {
    await app.close()
    await system.stop()
  })

  it('verifies the exact bytes sent (pretty-printed, non-ASCII)', async () => {
    const { port } = await app.listen(0, '127.0.0.1')
    url = \`http://127.0.0.1:\${port}/webhooks/demo\`

    const event = sampleEvent('order.created', { orderId: 'ord_7', note: 'Größe M, café ☕' })
    const body = JSON.stringify(event, null, 2)
    const res = await sendWebhook({ url, body, secret: SECRETS.demo })
    expect(res.status).toBe(202)

    // Signing the re-serialised JSON instead of the raw bytes must fail
    const other = sampleEvent()
    const pretty = JSON.stringify(other, null, 2)
    const fetched = await fetch(url, {
      method:  'POST',
      headers: {
        'content-type':      'application/json',
        'webhook-signature': postHeaderLike(JSON.stringify(other))
      },
      body: pretty
    })
    expect(fetched.status).toBe(401)

    await sleep(50)
    expect(processed.find(p => p.event.id === event.id)?.event.data).toEqual({ orderId: 'ord_7', note: 'Größe M, café ☕' })
  })
})

function postHeaderLike(signedBody: string): string {
  const t = Math.floor(Date.now() / 1000)
  return \`t=\${t},v1=\${signHex(SECRETS.demo, t, signedBody)}\`
}
`,

    'src/webhooks/signature.test.ts': `import { describe, it, expect } from '@axiljs/testing'
import { sign, signatureHeader, verifySignature } from './signature.js'

const SECRET = 'unit-test-secret'
const BODY = '{"id":"evt_1","type":"ping"}'
const NOW_MS = 1_731_300_000_000
const T = NOW_MS / 1000

describe('verifySignature', () => {
  it('accepts a correct signature within the tolerance', () => {
    const result = verifySignature(signatureHeader(SECRET, BODY, T), BODY, SECRET, 300, NOW_MS)
    expect(result).toEqual({ ok: true, timestamp: T })
  })

  it('is the HMAC-SHA256 of "<t>.<body>"', () => {
    expect(sign(SECRET, T, BODY)).toMatch(/^[0-9a-f]{64}$/)
    expect(sign(SECRET, T, BODY)).not.toBe(sign(SECRET, T + 1, BODY))
    expect(sign(SECRET, T, BODY)).not.toBe(sign(SECRET, T, BODY + ' '))
  })

  it('accepts any of several v1 signatures (secret rotation)', () => {
    const header = \`t=\${T},v1=\${sign('old-secret', T, BODY)},v1=\${sign(SECRET, T, BODY)}\`
    expect(verifySignature(header, BODY, SECRET, 300, NOW_MS).ok).toBe(true)
  })

  it('reports missing, malformed, mismatched and stale signatures', () => {
    const reason = (header: string | undefined, nowMs = NOW_MS) => {
      const r = verifySignature(header, BODY, SECRET, 300, nowMs)
      return r.ok ? 'ok' : r.reason
    }
    expect(reason(undefined)).toBe('missing')
    expect(reason('')).toBe('missing')
    expect(reason(\`v1=\${sign(SECRET, T, BODY)}\`)).toBe('malformed')
    expect(reason(\`t=abc,v1=\${sign(SECRET, T, BODY)}\`)).toBe('malformed')
    expect(reason(\`t=\${T}\`)).toBe('malformed')
    expect(reason(\`t=\${T},v1=abc\`)).toBe('mismatch')
    expect(reason(\`t=\${T},v1=\${sign('wrong', T, BODY)}\`)).toBe('mismatch')
    expect(reason(signatureHeader(SECRET, BODY, T), NOW_MS + 301_000)).toBe('stale')
    expect(reason(signatureHeader(SECRET, BODY, T), NOW_MS - 301_000)).toBe('stale')
    expect(reason(signatureHeader(SECRET, BODY, T), NOW_MS + 299_000)).toBe('ok')
  })
})
`
  }),

  nextSteps: () => [
    ['npm run dev', 'Receiver on http://localhost:3007'],
    ['npm run send-test-webhook', 'In another terminal: sign and send a sample event'],
    ['npm test', 'Signatures, replays, duplicates, queue processing'],
    ['Edit src/webhooks/handlers.ts', 'Handle your event types']
  ]
}
