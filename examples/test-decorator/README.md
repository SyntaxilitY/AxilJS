# test-decorator

An end-to-end AxilJS example demonstrating `@axiljs/decorator` — semantic
decorators consumed by independent, replaceable runtime consumers instead
of a monolithic framework.

## What this proves

Every route in this app is a plain class method annotated with `@tHttp` and
other semantic decorators (`@tAuth`, `@tCache`, `@tAudit`, `@tRetry`, ...).
None of those decorators know about `@axiljs/core`, Express, or any HTTP
framework. Routing only happens because `src/runtime/http-bridge.ts` reads
the metadata and calls `app.get/post/put/...` accordingly.

Delete the bridge and the metadata still exists — any other consumer could
pick it up (a test harness, a GraphQL gateway, an OpenAPI generator, a CLI).

## Structure

| Folder | Purpose |
|---|---|
| `src/controllers/` | Plain classes annotated with semantic decorators |
| `src/dto/` | DTOs using validation decorators (`tString`, `tEmail`, ...) |
| `src/entities/` | Data models using `tEntity`/`tColumn`/`tRelation` |
| `src/runtime/` | Independent consumers: HTTP bridge, rate limiter, cache, audit, validation, events |
| `src/workflows/` | `tSaga`/`tStep`/`tCompensate` — declarative only in this example |
| `src/queues/` | `tQueue`/`tJob` — declarative only in this example |
| `src/scripts/` | Simulated `axil decorator list/info/search` CLI |

## Run

```bash
cp .env.example .env
npm install
npm run dev