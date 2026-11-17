# @axiljs/security

Security middleware — Helmet, rate limiting, CSRF, and sanitization.

Part of the [AxilJS](https://github.com/SyntaxilitY/AxilJS) ecosystem.

## Install

```bash
npm install @axiljs/security
```

## Usage

```typescript
import { helmet, rateLimit, csrf, sanitize } from '@axiljs/security'

app.use(helmet())
app.use(rateLimit({ max: 100, windowMs: 60000 }))
app.use(csrf())
app.use(sanitize())
```

## Rate-limit stores

Each `rateLimit()` keeps its own in-memory counters by default. Pass `store`
to share counts between limiters or across processes:

```typescript
import { rateLimit, MemoryStore, RateLimitStore } from '@axiljs/security'

// Two limiters sharing one budget
const store = new MemoryStore()
app.post('/login', rateLimit({ max: 5, windowMs: 900000, store }), login)

// Any backend: implement increment() and reset() (sync or async)
const redisStore: RateLimitStore = {
  async increment(key, windowMs) {
    const count = await redis.incr(key)
    if (count === 1) await redis.pexpire(key, windowMs)
    return { count, resetAt: Date.now() + (await redis.pttl(key)) }
  },
  async reset(key) { await redis.del(key) }
}
app.use(rateLimit({ store: redisStore }))
```

Store errors are passed to `next(err)`. `store.reset(key)` clears a client
(the default key is `req.ip`).

## Rate limiting across cluster workers

In cluster mode (for example `@axiljs/scale`, one `node:cluster` worker per
core) each worker is a separate process, so the default `MemoryStore` lets
every worker accept the full `max`. `ClusterStore` sends each hit to the
primary process over IPC, which keeps a single set of counters.

```typescript
import cluster from 'node:cluster'
import { rateLimit, ClusterStore, installClusterRateLimitPrimary } from '@axiljs/security'

if (cluster.isPrimary) {
  // Once in the primary; serves current and future workers. Returns a disposer.
  installClusterRateLimitPrimary()
  // ... fork workers
} else {
  app.use(rateLimit({ max: 100, store: new ClusterStore({ namespace: 'api' }) }))
  app.post('/login', rateLimit({
    max: 5,
    windowMs: 900000,
    store: new ClusterStore({ namespace: 'login' })
  }), login)
}
```

- `namespace` (default `'default'`) keeps the counters of different limiters
  apart on the primary. Use a distinct namespace per limiter.
- `timeoutMs` (default `1000`): how long a worker waits for the primary.
- `fallbackCooldownMs` (default `5000`): after a timeout or send failure the
  worker counts locally for this long before trying the primary again.
- Fail-open: if the primary is unreachable, hits are counted in a
  worker-local `MemoryStore`, so requests are never blocked by the primary.
  While degraded, the limit applies per worker rather than cluster-wide.
- Outside a cluster worker, `ClusterStore` behaves exactly like `MemoryStore`
  (synchronous), so the same code runs unchanged without clustering.
- Counters live in the primary's memory: they are shared by the workers of
  one machine, not across machines. Use a shared backend (Redis, database)
  for multi-host deployments.

## Custom keys

`keyGenerator` and `skip` receive the full request (`ip`, `headers`, `params`,
`path`, `method`, `locals`, ...), so a route-level limiter can key on params:

```typescript
// One budget per webhook source, regardless of caller IP
app.post('/hooks/:source', rateLimit({
  max: 30,
  keyGenerator: req => `webhook:${req.params.source}`,
  skip: req => req.headers['x-internal'] === '1'
}), handleWebhook)
```

## Testing

```bash
npm test
```

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
