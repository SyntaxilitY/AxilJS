# @axiljs/core

HTTP server, router, middleware, SSE, static files, and built-in SyntaxilitY response manager.

Part of the [AxilJS](https://github.com/SyntaxilitY/AxilJS) ecosystem.

## Install

```bash
npm install @axiljs/core
```

## Usage

```typescript
import { Application, cors } from '@axiljs/core'

const app = new Application()

app.get('/users', (req, res) => {
  res.success(users, 'Users fetched')
})

app.post('/users', (req, res) => {
  res.created(req.body, 'User created')
})

app.listen()
```

## Built-in Response Manager

Every `res` object includes SyntaxilitY API Response Manager — no imports needed:

```typescript
res.success(data, 'message')               // 200 OK
res.created(data, 'message')               // 201 Created
res.paginated(items, total, page, limit)   // 200 with pagination metadata
res.noContent()                            // 204 No Content
res.badRequest('message')                  // 400 Bad Request
res.unauthorized('message')                // 401 Unauthorized
res.forbidden('message')                   // 403 Forbidden
res.notFound('message')                    // 404 Not Found
res.conflict('message')                    // 409 Conflict
res.validationError('message')             // 422 Unprocessable Entity
res.tooManyRequests('message')             // 429 Too Many Requests
res.serverError('message')                 // 500 Internal Server Error
res.serviceUnavailable('message')          // 503 Service Unavailable
```

Response format:

```json
{
  "status": 200,
  "code": "HTTP_200_OK",
  "message": "Users fetched",
  "data": { }
}
```

Paginated response:

```json
{
  "status": 200,
  "code": "HTTP_200_OK",
  "message": "Users fetched",
  "data": {
    "metadata": [],
    "pagination": {
      "total": 42,
      "page": 1,
      "limit": 10,
      "totalPages": 5,
      "hasNextPage": true,
      "hasPrevPage": false
    }
  }
}
```

`res.paginated(items, total, page, 0)` reports `totalPages: 0` and `hasNextPage: false`.

## Routing extras

```typescript
app.head('/files/:id', headHandler)     // explicit HEAD route
app.options('/files', optionsHandler)
app.all('/proxy/*', proxyHandler)       // every method; a method-specific route wins
```

- **HEAD fallback** (default on): a HEAD request with no HEAD route runs the GET
  route; Node sends its headers without a body. Disable with
  `server: { headFallback: false }`.
- **405 Method Not Allowed** (opt-in): with `server: { methodNotAllowed: true }`
  a path that exists for other methods answers `405` with an `Allow` header
  (an `OPTIONS` request gets `204` + `Allow`). Off by default, i.e. `404`.
- **`next()` twice**: each middleware's `next` advances the chain once; extra
  calls are ignored (with a `console.warn` outside production), so the rest of
  the chain and the handler never run twice.

## Server options

```typescript
new Application({
  server: {
    port: 0,                 // 0 picks a free port; listen() resolves the bound port
    bodyLimit: '5mb',        // body parser limit (default 1 MB) - 413 when exceeded
    timeout: 30000,          // ms to receive a whole request (Node requestTimeout, 408)
    trustProxy: 1            // see below
  }
})
```

`trustProxy` decides `req.ip`. It is off by default: an `X-Forwarded-For`
header is client-controlled, so trusting it without a proxy lets anyone spoof
their address (and dodge per-IP rate limits). Behind a proxy, prefer the hop
count (`1` for a single load balancer) over `true`.


| Value | `req.ip` |
|---|---|
| `false` (default) | socket address; `X-Forwarded-For` ignored |
| `true` | left-most `X-Forwarded-For` entry, else the socket address (only safe when every request passes through a proxy that overwrites the header) |
| `n` (number) | address `n` hops in front of the server (`1` = the entry added by your one proxy) |
| `(addr, hop) => boolean` | walks from the socket outwards; the first untrusted address wins |

## Raw request body

The built-in body parser keeps the unparsed body text for any non-empty body
(JSON, urlencoded, text) as `req.rawBody` (on core's `Request`) and
`req.locals.rawBody`, e.g. to verify a webhook signature:

```typescript
app.post('/webhooks/stripe', (req, res) => {
  const raw = req.locals.rawBody as string;
  const expected = createHmac('sha256', secret).update(raw).digest('hex');
  // compare with the signature header, then use req.body (already parsed)
});
```

## Startup banner

`listen()` prints a banner with the installed `@axiljs/core` version. It is
skipped when `logging: false` or `env: 'test'`.

## Static files

`serveStatic()` sends a weak `ETag` (size + mtime) and `Last-Modified`, answers
`If-None-Match` / `If-Modified-Since` with `304`, and supports single
`Range: bytes=...` requests (`206` + `Content-Range`, `416` when unsatisfiable;
multi-range requests get the full file). `If-Range` is honoured with a date.

`createSSE(res)` keeps an `Access-Control-Allow-Origin` already set by `cors()`
and only defaults it to `*` when none is set.

## Testing

```bash
npm test
```

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
