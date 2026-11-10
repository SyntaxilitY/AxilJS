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

## Testing

```bash
npm test
```

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
