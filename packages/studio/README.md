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
