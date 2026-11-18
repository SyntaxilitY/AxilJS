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

## OpenAPI

The application can describe itself as an OpenAPI 3.1 document, built from its
registered routes and the schemas of any `validate()` middleware on them.

```typescript
import { Application, Router, generateOpenAPI } from '@axiljs/core'
import { validate, v } from '@axiljs/validation'

const app = new Application()
const users = new Router()
users.get('/', validate({ query: v.object({ page: v.number().integer().default(1) }) }), listUsers)
users.post('/', authenticateUser, validate({ body: createUserSchema }), createUser)
users.get('/:id', getUser)
app.mount('/api/users', users)

app.routes()                                                   // [{ method, path, middleware, handler }, ...]
app.openapi({ title: 'Users API', version: '1.0.0' })          // the document
generateOpenAPI(app, { title: 'Users API', version: '1.0.0' }) // same, as a function

// Serve it as JSON (generated on the first request, then cached)
app.serveOpenAPI({ title: 'Users API', version: '1.0.0', servers: [{ url: 'http://localhost:3000' }] })
app.serveOpenAPI('/docs/openapi.json', { title: 'Users API', version: '1.0.0' })
```

Generate a typed client from the served document with the CLI:

```bash
axil generate client --from http://localhost:3000/openapi.json --out src/api-client.ts
```

### `app.routes()`

Returns every route in matching order: the app's own routes, then each mounted
router's. `path` is the URL clients call: app routes include `config.prefix`;
mounted routes get the mount prefix plus the router's own prefix (the app prefix
is not applied to mounted routers). A router created with the mount prefix
already in it (`new Router('/users')` mounted at `/users`) is not doubled.
`middleware` lists global, router and route middleware in execution order, and
`method` is `'*'` for `all()` routes. `router.routes()` gives the same for a
single router.

### What the document contains

| Item | Rule |
|---|---|
| Version | `openapi: '3.1.0'`, `jsonSchemaDialect` JSON Schema 2020-12 |
| Paths | `:id` becomes `{id}`; routes of one shape share the first route's param names |
| Path parameters | required; schema from the `params` schema, else `string` |
| Query parameters | one per property of the `query` schema; `required` from its `required` list |
| Request body | `application/json`, stored as `components.schemas.<OperationId>Body` and referenced by `$ref`; required unless the body schema is optional |
| `operationId` | lower-case method + PascalCase segments, `:param` as `By<Param>` (`GET /users/:id` is `getUsersById`, `GET /` is `getRoot`); a numeric suffix keeps duplicates unique |
| Success response | `201` for POST, `200` otherwise (HEAD without content); body `components.schemas.Envelope` = `{ status, code, message, data }`, `data` unconstrained |
| Error responses | `components.responses.Error` (`{ error: { code, message } }`) for `422` (validated routes), `401` and `403` (auth routes), `404` (routes with path params), plus `4XX` and `5XX` |
| Security | `bearerAuth` (HTTP bearer, JWT) on routes with auth middleware; the scheme is only added when used |
| Skipped | `all()` routes, wildcard (`*`) routes, the `serveOpenAPI()` route and handlers wrapped in `excludeFromOpenAPI()` |

Schema discovery is duck-typed, so core does not depend on `@axiljs/validation`:
a middleware with `fn[Symbol.for('axiljs.validation.schemas')]` or `fn.schemas`
shaped `{ body?, params?, query? }` is used. Each schema's `toJSONSchema()` is
called; plain JSON Schema objects are taken as they are. When several
validation middleware run on one route, the later one wins per location.

Auth detection is a heuristic. A middleware counts as authentication when it
has `fn[Symbol.for('axiljs.auth')]` set (exported as `AUTH_MIDDLEWARE`) or its
function name contains `authenticate`, `requireAuth`, `requireRole`,
`requirePermission` or `requireOwnership`. Middleware returned by factories such
as `authenticate(jwt)` are anonymous functions, so either wrap them in a named
function, set the marker, or pass your own predicate:

```typescript
app.openapi({ title: 'API', version: '1.0.0', isAuthMiddleware: fn => fn === requireUser })
```

Limitations: response payloads (`data`) are not described, since handler output
cannot be introspected; handlers that answer with `res.json()` instead of the
envelope helpers are still documented with the envelope; `custom()` and
`transform()` rules are not represented; the served document is cached after the
first request, so routes added later are not included.

## Testing

```bash
npm test
```

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
