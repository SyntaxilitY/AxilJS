<p align="center">
  <img src="https://raw.githubusercontent.com/SyntaxilitY/AxilJS-Backend-Ecosystem/main/assets/logo-mark-128.png" alt="AxilJS logo" width="64" height="64">
</p>

# @axiljs/studio

Browser-based developer dashboard for AxilJS applications.

Launches automatically when you run `axil run` — no extra command needed.

Part of the [AxilJS](https://github.com/SyntaxilitY/AxilJS) ecosystem.

## Features

- **API Explorer** — Browse all routes with method badges, path params, middleware tags, and handler names
- **Database Browser** — Inspect tables, columns, row counts, and paginated data (SQLite, PostgreSQL, MySQL)
- **WebSocket & SSE Monitor** — View detected WebSocket paths and SSE streams
- **QR Code** — Scan to open your app on any device on the same network
- **Export Collections** — Download Postman, Insomnia, and OpenAPI 3.0 specs instantly
- **Intent** — Live view of whether the running app keeps the contracts its `@axiljs/runtime` decorators declare
- **Auto-refresh** — Data refreshes every 30 seconds automatically

## How it works

Studio starts automatically alongside `axil run` on `appPort + 1`.

If your app runs on port `3000`, Studio opens at `http://localhost:3001`.

```bash
axil run
# App     → http://localhost:3000
# Studio  → http://localhost:3001  (opens in browser automatically)
```

## Install

Studio is included with `@axiljs/cli` as an optional dependency.
Install it separately only if you need it programmatically:

```bash
npm install @axiljs/studio
```

## Programmatic Usage

```typescript
import { StudioServer } from '@axiljs/studio'

const studio = new StudioServer({
  port:     3001,
  host:     '127.0.0.1',
  appPort:  3000,
  appName:  'my-api',
  dbDriver: 'sqlite',
  dbFile:   './dev.db',
  enableQR: true
})

await studio.start()

// Attach a live database driver for table browsing
studio.setDriver(db.getDriver(), 'sqlite')

// Stop when done
await studio.stop()
```

Optional settings:

| Option          | Default          | Purpose |
| --------------- | ---------------- | ------- |
| `allowedHosts`  | `[]`             | Extra `Host` header names to answer (e.g. a LAN name). `localhost`, `127.0.0.1`, `[::1]` and `host` are always allowed |
| `maxBodyBytes`  | `1048576`        | Max POST body size; larger requests get `413` |
| `openBrowser`   | `true`           | Open Studio in the default browser on start |
| `cwd`           | `process.cwd()`  | Project directory scanned for routes and used to resolve `dbFile` |
| `intentPath`    | `/__axil/studio/intent` | Path on the app that serves the runtime report (must match `intentEndpoint({ path })`) |

`studio.getPort()` returns the bound port (useful with `port: 0`).

## Intent view

The Intent view shows, live, whether the app keeps the contracts declared by its decorators. It reads the report that `@axiljs/runtime` publishes and refreshes every 2 seconds while the view is open:

- intent mode (`enforce`, `warn` or `off`) and summary counters
- contract violations, newest first, with decorator, target, detail, request id and tenant id
- SLOs per `tSlo` target: percentile, observed vs. target latency, error rate vs. budget, status
- circuit breaker states and the list of enforced decorators (interceptor order, outermost first)

Under `axil run` the app runs in a child process, so it has to expose the report to Studio. Add the development-only endpoint next to the runtime:

```typescript
import '@axiljs/runtime'
import { wire } from '@axiljs/runtime'
import { intentEndpoint } from '@axiljs/studio'

wire(OrderService)          // executes the t* decorators on its methods
app.use(intentEndpoint())   // serves GET /__axil/studio/intent to Studio
```

`intentEndpoint()` answers only `GET`/`HEAD` on its path from loopback addresses and is a no-op when `NODE_ENV` is `production` (override with `{ enabled }`). It also works as a plain `node:http` handler, returning `true` when it answered. The module has no imports, so an app that keeps Studio as a dev dependency can load it alone from `@axiljs/studio/dist/intent` behind a development check.

When Studio runs in the same process as the runtime (programmatic use), it reads the report directly and no endpoint is needed. The data is available as JSON at `GET /api/studio/intent`, which returns the report with `available: true`, or `{ available: false, reason }` when the runtime is not loaded or the app cannot be reached.

## Security

Studio is a local development tool:

- Requests whose `Host` header is not a local/configured host are rejected with `403` (DNS-rebinding protection); CORS is only granted to the same local origins.
- The SQL console is read-only: only `SELECT`/`WITH`/`SHOW`/`DESCRIBE`/`EXPLAIN`/`PRAGMA`, run in a read-only transaction (Postgres, MySQL) or on a read-only handle (SQLite). MySQL `INTO OUTFILE` / `INTO DUMPFILE` is blocked.
- Table names in the browser are quoted as identifiers; the app name is HTML-escaped.
- Studio keeps one database pool, reuses it across requests and closes it on `stop()` (a failed connection attempt ends its pool).

## Database Support

Studio auto-detects your database from `.env`:

| Variable            | Driver     |
| ------------------- | ---------- |
| `DATABASE_URL` starting with `postgres://` | PostgreSQL |
| `DATABASE_URL` starting with `mysql://`    | MySQL      |
| `DATABASE_FILENAME`                          | SQLite     |

## Exported Collections

| Format   | File                            |
| -------- | ------------------------------- |
| Postman  | `axiljs-postman-collection.json` |
| Insomnia | `axiljs-insomnia-collection.json` |
| OpenAPI  | `openapi.json`                  |

Full docs: [github.com/SyntaxilitY/AxilJS](https://github.com/SyntaxilitY/AxilJS)
