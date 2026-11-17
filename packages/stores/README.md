# @axiljs/stores

SQL-backed shared stores for AxilJS: rate-limit counters, idempotency
records, cache entries, distributed locks and AI budget counters, kept in the database you
already run (PostgreSQL, MySQL or SQLite). Several servers pointed at the same
database share one view of this state, so multi-instance deployments work
without Redis.

Part of the [AxilJS](https://github.com/SyntaxilitY/AxilJS) ecosystem.

- Zero dependencies, including other `@axiljs` packages. The stores match the
  `@axiljs/runtime` and `@axiljs/security` interfaces structurally.
- Tables are created on first use (`CREATE TABLE IF NOT EXISTS`); no migration step.
- Every statement the stores run is excluded from `@axiljs/runtime`'s intent
  checks, so a cache write or lock row inside a `tReadOnly` / `tPure` method
  is not reported as that method's side effect.

## Install

```bash
npm install @axiljs/stores
```

You also need a database connection, usually from `@axiljs/orm` with its
driver (`pg`, `mysql2` or `better-sqlite3`).

## Setup

```typescript
import { createConnection } from '@axiljs/orm'
import { fromConnection } from '@axiljs/stores'

const db   = await createConnection({ driver: 'postgres', url: process.env.DATABASE_URL })
const exec = fromConnection(db)   // dialect is read from the connection config
```

`fromConnection` accepts anything with `getDriver()` whose driver exposes
`config.driver` and `query()`; it also forwards `transaction()`. To use another
client, implement `SqlExecutor` yourself:

```typescript
import type { SqlExecutor } from '@axiljs/stores'

const exec: SqlExecutor = {
  dialect: 'postgres',
  // sql arrives with native placeholders ($1..$n for postgres, ? for mysql/sqlite)
  async query(sql, params) {
    const r = await pool.query(sql, params)
    return { rows: r.rows, affectedRows: r.rowCount }
  },
  // optional; needed for exact MySQL rate-limit counts and PgAdvisoryLockProvider
  async transaction(work) { /* BEGIN on one connection, work(trxExecutor), COMMIT */ }
}
```

## Wiring

### All stores at once

`createSqlStores` builds every store on one executor with a shared table
prefix and returns `{ rateLimit, idempotency, cache, lock, budget, tables,
ensureSchema(), close() }`. Pass it to `useStores` from `@axiljs/runtime`,
which accepts `{ rateLimit?, idempotency?, cache?, lock? }` and ignores the
other properties:

```typescript
import { useStores } from '@axiljs/runtime'
import { fromConnection, createSqlStores } from '@axiljs/stores'

const stores = createSqlStores(fromConnection(db), { cleanupIntervalMs: 60_000 })
await stores.ensureSchema()   // optional: create every table at startup
useStores(stores)             // tRateLimit, tThrottle, tIdempotent, tCache*, tLock

// on shutdown
stores.close()                // stops cleanup timers; the connection stays open
```

| Option | Default | Meaning |
|---|---|---|
| `tablePrefix` | `axil_` | Prepended to every table: `<prefix>rate_limits`, `<prefix>idempotency`, `<prefix>cache` (+ `_tags`), `<prefix>locks`, `<prefix>ai_budget`. Letters, digits and `_`; may be empty |
| `lock` | `'lease'` | `'lease'` uses `SqlLockProvider` (any dialect). `'advisory'` uses `PgAdvisoryLockProvider` and throws unless the executor is postgres with `transaction()` |
| `now`, `cleanupIntervalMs` | `Date.now`, off | Shared by every store |
| `rateLimit`, `idempotency`, `cache`, `leaseLock`, `budget` | | Per-store options; they override the shared ones, including `table` |
| `advisoryLock` | | `PgAdvisoryLockProviderOptions` (e.g. `namespace`) when `lock: 'advisory'` |

`ensureSchema()` is idempotent and creates the tables in sequence, which suits
a migration step or startup hook; without it each store still creates its
table on first use. `tables` lists the table names in use (no lock table with
advisory locks).

### @axiljs/runtime decorators

```typescript
import { setRateLimitStore, setIdempotencyStore, setCacheStore, setLockProvider } from '@axiljs/runtime'
import { SqlRateLimitStore, SqlIdempotencyStore, SqlCacheStore, SqlLockProvider } from '@axiljs/stores'

setRateLimitStore(new SqlRateLimitStore(exec))       // tRateLimit, tThrottle
setIdempotencyStore(new SqlIdempotencyStore(exec))   // tIdempotent
setCacheStore(new SqlCacheStore(exec))               // tCache, tCachePut, tCacheEvict, tCacheInvalidate
setLockProvider(new SqlLockProvider(exec))           // tLock
```

### @axiljs/security middleware

```typescript
import { rateLimit } from '@axiljs/security'
import { SqlRateLimitStore } from '@axiljs/stores'

app.use(rateLimit({
  windowMs: 60_000,
  max: 100,
  store: new SqlRateLimitStore(exec, { table: 'api_rate_limits', cleanupIntervalMs: 60_000 })
}))
```

Use a separate table (or key prefix) per limiter when limiters have different
windows, as the same key in one table shares one window.

### @axiljs/ai budgets

`SqlBudgetStore` implements `@axiljs/ai`'s `BudgetStore`, so `withBudget`
limits hold across every server that shares the table instead of per process:

```typescript
import { OpenAIProvider, withBudget } from '@axiljs/ai'
import { SqlBudgetStore } from '@axiljs/stores'

const ai = withBudget(new OpenAIProvider({ apiKey }), {
  limits: [
    { window: 'minute', requests: 60 },
    { window: 'month',  costUsd: 50 }
  ],
  pricing: { 'gpt-4o-mini': { inputPerMTok: 0.15, outputPerMTok: 0.6 } },
  store: new SqlBudgetStore(exec, { cleanupIntervalMs: 3_600_000 })
})
```

With `createSqlStores`, use `store: stores.budget`. `withBudget` reserves an
estimate before each call and later adds the difference to the actual usage
(or the negated estimate on failure); the store applies each of these as one
atomic increment, so concurrent requests on different servers cannot jointly
overrun a limit. `SqlBudgetStore` also accepts `retainMs` to keep rows for
reporting that long after their window ends before `cleanup()` removes them.

### PostgreSQL advisory locks

```typescript
import { PgAdvisoryLockProvider } from '@axiljs/stores'

setLockProvider(new PgAdvisoryLockProvider(exec, { namespace: 'billing' }))
```

## API

| Export | Shape |
|---|---|
| `fromConnection(conn)` | `SqlExecutor` from an `@axiljs/orm` connection |
| `SqlRateLimitStore` | `increment(key, windowMs) → { count, resetAt }`, `reset(key)`, `cleanup()`, `close()` |
| `SqlIdempotencyStore` | `get(key) → { result } \| undefined`, `set(key, { result }, ttlMs)`, `delete(key)`, `cleanup()`, `close()` |
| `SqlCacheStore` | `get(key) → { value } \| undefined`, `set(key, value, ttlMs, tags)`, `delete(key)`, `deleteByTag(tag)`, `clear()`, `cleanup()`, `close()` |
| `SqlLockProvider` | `acquire(key, { ttlMs, waitMs }) → release()`, `cleanup()`, `close()` |
| `PgAdvisoryLockProvider` | `acquire(key, { ttlMs, waitMs }) → release()`, `lockId(key)` |
| `toDialect(dialect, sql)` | Rewrites `?` placeholders to `$1..$n` for postgres |

Every store also exposes `ensureSchema()` (idempotent; called automatically
on first use) and accepts these options:

| Option | Default | Meaning |
|---|---|---|
| `table` | `axil_rate_limits`, `axil_idempotency`, `axil_cache`, `axil_locks`, `axil_ai_budget` | Table name. Must match `/^[A-Za-z_][A-Za-z0-9_]{0,62}$/` |
| `tagTable` | `<table>_tags` | Cache only: tag table name |
| `retainMs` | `0` | Budget only: keep rows this long after their window ends |
| `cleanupIntervalMs` | off | Delete expired rows on an unref'd timer; `close()` stops it |
| `now` | `Date.now` | Clock in epoch ms |

`close()` only stops the cleanup timer; it never closes your connection.

## Table schemas

Times are `BIGINT` epoch milliseconds computed in JavaScript, so every dialect
compares the same numbers. Key columns are `VARCHAR(255)` (on MySQL with
`utf8mb4_bin`, so keys are case-sensitive everywhere). Keys longer than 200
characters are stored as a 120-character prefix plus `#` and their SHA-256.

```sql
-- SqlRateLimitStore
CREATE TABLE axil_rate_limits (id VARCHAR(255) PRIMARY KEY, hits INTEGER NOT NULL, reset_at BIGINT NOT NULL);
CREATE INDEX axil_rate_limits_reset_at_idx ON axil_rate_limits (reset_at);

-- SqlIdempotencyStore (payload is LONGTEXT on MySQL)
CREATE TABLE axil_idempotency (id VARCHAR(255) PRIMARY KEY, payload TEXT NOT NULL, expires_at BIGINT NOT NULL);
CREATE INDEX axil_idempotency_expires_at_idx ON axil_idempotency (expires_at);

-- SqlCacheStore
CREATE TABLE axil_cache (id VARCHAR(255) PRIMARY KEY, payload TEXT NOT NULL, expires_at BIGINT NOT NULL);
CREATE INDEX axil_cache_expires_at_idx ON axil_cache (expires_at);
CREATE TABLE axil_cache_tags (tag VARCHAR(255) NOT NULL, id VARCHAR(255) NOT NULL, PRIMARY KEY (tag, id));
CREATE INDEX axil_cache_tags_id_idx ON axil_cache_tags (id);

-- SqlLockProvider
CREATE TABLE axil_locks (id VARCHAR(255) PRIMARY KEY, owner VARCHAR(64) NOT NULL, expires_at BIGINT NOT NULL);

-- SqlBudgetStore (cost_usd is DECIMAL(30, 12) on MySQL and SQLite)
CREATE TABLE axil_ai_budget (
  scope VARCHAR(255) NOT NULL, window_name VARCHAR(32) NOT NULL, window_start BIGINT NOT NULL,
  tokens BIGINT NOT NULL, cost_usd NUMERIC(30, 12) NOT NULL, requests BIGINT NOT NULL, window_end BIGINT NOT NULL,
  PRIMARY KEY (scope, window_name, window_start)
);
CREATE INDEX axil_ai_budget_window_end_idx ON axil_ai_budget (window_end);
```

On MySQL the secondary indexes are declared inline in `CREATE TABLE`.

## How each store works

- **Rate limit.** Fixed window. PostgreSQL and SQLite use one atomic
  `INSERT ... ON CONFLICT (id) DO UPDATE ... RETURNING hits, reset_at`: an
  expired window restarts at 1, otherwise the count is incremented. Concurrent
  hits get distinct counts (50 parallel increments return exactly 1..50).
- **Idempotency.** Upsert of `{ result }` as JSON; expired rows are ignored on read.
- **Cache.** Upsert of `{ v: value }` as JSON plus one row per tag. `set`
  replaces an entry's tags; `deleteByTag` removes the tagged entries and all
  of their tag rows.
- **SqlLockProvider.** A lease row per key with a random owner id. Acquire
  inserts the row; if it exists, it takes it over only when the lease has
  lapsed (`UPDATE ... WHERE id = ? AND expires_at <= now`). Otherwise it
  retries with jittered exponential backoff (10 ms doubling to 250 ms) until
  `waitMs`, then rejects. Release deletes the row only if the owner still
  matches, so a holder whose lease lapsed cannot release the new holder's lock.
- **Budget.** One row per (scope, window name, window start). PostgreSQL and
  SQLite add with one `INSERT ... ON CONFLICT (scope, window_name,
  window_start) DO UPDATE SET tokens = tokens + excluded.tokens, ...
  RETURNING tokens, cost_usd, requests`; MySQL uses `ON DUPLICATE KEY UPDATE`
  plus `SELECT` in one transaction, like the rate-limit store. Amounts may be
  negative. Costs are stored as an exact decimal with 12 fractional digits
  (pico-dollars), so a reservation and its release cancel exactly; tokens and
  requests are BIGINT and are rounded to integers. All totals come back as JS
  numbers, and `get` returns zeros for a window with no row.
- **PgAdvisoryLockProvider.** Each attempt opens a transaction on one pooled
  connection and calls `pg_try_advisory_xact_lock(id)`, where `id` is the
  first 8 bytes of SHA-256(namespace + key). On success the transaction stays
  open until release (or `ttlMs`), and COMMIT frees the lock. If the process
  dies, PostgreSQL frees the lock when the connection drops.

## Consistency and caveats

- **Clocks.** Windows, expiries and leases use each server's `Date.now()`.
  Keep server clocks in sync (NTP); skew between servers shifts window
  boundaries and lease expiry by the skew.
- **Lease locks are leases.** If the holder runs longer than `ttlMs`, another
  server can take the lock over. Choose `ttlMs` above the worst-case run time.
  There is no renewal.
- **JSON values.** Cached and idempotent results go through `JSON.stringify`:
  `Date` becomes a string, `Map`/`Set`/class instances lose their type, and
  `undefined` inside objects is dropped.
- **PostgreSQL.** All operations are single atomic statements or short
  transactions; safe under any number of servers. `CREATE TABLE IF NOT EXISTS`
  can race when several servers start at once; schema creation retries once.
- **PgAdvisoryLockProvider** keeps one pooled connection busy per held lock
  (size the pool for it; a method that holds a lock and needs its own query
  connection needs at least two), and the lock is lost if
  `idle_in_transaction_session_timeout` kills the session. Lock ids are 64-bit
  hashes; distinct keys colliding is possible in principle but negligible.
- **MySQL.** MySQL has no `RETURNING`, so the rate-limit store runs
  `INSERT ... ON DUPLICATE KEY UPDATE` and then `SELECT` inside one
  transaction: the upsert holds the row lock until commit, so the read sees
  exactly this hit. This requires an executor with `transaction()`
  (`fromConnection` provides one). With a custom executor that lacks it, the
  two statements run separately and a concurrent hit can make two callers see
  the same count. Upserts use `VALUES(col)`, which MySQL 8.0.20+ deprecates
  but still accepts and MariaDB supports. Lock acquisition uses
  `INSERT IGNORE` and checks `affectedRows`.
- **Budget precision.** Costs below 0.5e-12 USD per add round to zero.
  SQLite has no exact decimal type and keeps `cost_usd` as a REAL; totals are
  rounded to 12 decimal places on read, which is exact for practical sums.
  A settle or release that arrives after `cleanup()` removed its window's row
  creates a short-lived row with negative totals for that (already ended)
  window; the next `cleanup()` removes it.
- **SQLite.** Suitable for one host (several processes sharing one database
  file). The stores do not open transactions on SQLite: its connection is
  shared by the whole app, and every correctness-critical step is a single
  statement. Cache `set` (entry + tags) is therefore not atomic as a whole on
  SQLite; concurrent `set`s of the same key can leave a union of their tags.
- **Expired rows** are skipped on read but stay in the table until
  `cleanup()` runs (manually or via `cleanupIntervalMs`), or, for locks and
  rate limits, until the key is used again.
