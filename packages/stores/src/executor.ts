/**
 * SQL executor abstraction.
 *
 * The stores talk to the database through a minimal `SqlExecutor`, so they
 * work with @axiljs/orm (via `fromConnection`) or any client you wrap
 * yourself, without this package depending on either.
 */

import { createHash } from 'node:crypto';

export type SqlDialect = 'postgres' | 'mysql' | 'sqlite';

export interface SqlQueryResult<T> {
  rows: T[];
  affectedRows?: number;
}

export interface SqlExecutor {
  dialect: SqlDialect;

  /**
   * Run one statement. `sql` arrives with the dialect's native placeholders
   * (`$1..$n` for postgres, `?` for mysql and sqlite).
   */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<SqlQueryResult<T>>;

  /**
   * Optional: run `work` on a single connection inside a transaction.
   * Required by the MySQL rate-limit path for an exact count and by
   * `PgAdvisoryLockProvider`. `fromConnection` provides it.
   */
  transaction?<T>(work: (trx: SqlExecutor) => Promise<T>): Promise<T>;
}

const DIALECTS: readonly SqlDialect[] = ['postgres', 'mysql', 'sqlite'];

/**
 * Wrap an @axiljs/orm `ConnectionManager` (anything with `getDriver()` whose
 * driver keeps its `ConnectionConfig` in `config`).
 */
export function fromConnection(conn: { getDriver(): any }): SqlExecutor {
  const driver = conn.getDriver();
  const dialect = driver?.config?.driver;
  if (!DIALECTS.includes(dialect)) {
    throw new Error(`@axiljs/stores: unsupported driver '${String(dialect)}' (expected postgres, mysql or sqlite)`);
  }
  const wrap = (target: { query(sql: string, params?: unknown[]): Promise<any> }): SqlExecutor => ({
    dialect,
    async query<T>(sql: string, params: unknown[] = []) {
      const result = await target.query(sql, params);
      return { rows: (result?.rows ?? []) as T[], affectedRows: result?.affectedRows };
    }
  });
  const executor = wrap(driver);
  if (typeof driver.transaction === 'function') {
    executor.transaction = <T>(work: (trx: SqlExecutor) => Promise<T>): Promise<T> =>
      driver.transaction((trx: { query(sql: string, params?: unknown[]): Promise<any> }) => work(wrap(trx)));
  }
  return executor;
}

// ─── Internal helpers shared by the stores ────────────────────────────────────

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/;

/** Throw unless `name` is a plain SQL identifier (it is interpolated into SQL). */
export function checkIdentifier(name: string, what = 'table name'): string {
  if (typeof name !== 'string' || !IDENTIFIER.test(name)) {
    throw new Error(`@axiljs/stores: invalid ${what} '${String(name)}' (must match ${IDENTIFIER})`);
  }
  return name;
}

/**
 * Run `fn` without reporting its statements to @axiljs/runtime's intent
 * checks (tReadOnly / tPure). Store writes are infrastructure, not the
 * business method's own side effects.
 */
export function unreported<T>(fn: () => Promise<T>): Promise<T> {
  const run = (globalThis as any)[Symbol.for('axiljs.intent.unreported')];
  return typeof run === 'function' ? run(fn) : fn();
}

/** Rewrite `?` placeholders to `$1..$n` for postgres; other dialects pass through. */
export function toDialect(dialect: SqlDialect, sql: string): string {
  if (dialect !== 'postgres') return sql;
  let n = 0;
  let out = '';
  let quoted = false;
  for (const ch of sql) {
    if (ch === '\'') quoted = !quoted;
    out += ch === '?' && !quoted ? `$${++n}` : ch;
  }
  return out;
}

/** Execute one store statement: placeholder conversion + unreported. */
export function runSql<T = Record<string, unknown>>(
  executor: SqlExecutor,
  sql: string,
  params: unknown[] = []
): Promise<SqlQueryResult<T>> {
  return unreported(() => executor.query<T>(toDialect(executor.dialect, sql), params));
}

/**
 * Run `work` in a transaction when the executor supports it, else directly.
 * SQLite runs directly: its single shared connection would let concurrent
 * async transactions interleave (and absorb unrelated app statements), and
 * every statement the stores rely on for correctness is a single atomic one.
 */
export function runTx<T>(executor: SqlExecutor, work: (q: SqlExecutor) => Promise<T>): Promise<T> {
  const tx = executor.dialect !== 'sqlite' ? executor.transaction : undefined;
  return unreported(() => tx ? tx.call(executor, work) as Promise<T> : work(executor));
}

const MAX_KEY = 200;

/**
 * Keys are stored in VARCHAR(255) columns. Longer keys keep a readable
 * prefix plus a SHA-256 digest, so they stay unique and indexable.
 */
export function storageKey(key: string): string {
  const k = String(key);
  if (k.length <= MAX_KEY) return k;
  return `${k.slice(0, 120)}#${createHash('sha256').update(k).digest('hex')}`;
}

/** Column type for keys: binary collation on MySQL so keys are case-sensitive. */
export function keyType(dialect: SqlDialect): string {
  return dialect === 'mysql'
    ? 'VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin'
    : 'VARCHAR(255)';
}

/** Column type for JSON payloads. */
export function textType(dialect: SqlDialect): string {
  return dialect === 'mysql' ? 'LONGTEXT' : 'TEXT';
}

/** Read a BIGINT column (pg returns strings). */
export function num(value: unknown): number {
  return typeof value === 'number' ? value : Number(value);
}

/**
 * Memoised, retrying schema creation. Concurrent CREATE TABLE IF NOT EXISTS
 * from several processes can still collide on postgres catalogs; one retry
 * after the other process finished is enough.
 */
export function lazySchema(create: () => Promise<void>): () => Promise<void> {
  let pending: Promise<void> | undefined;
  return () => {
    if (!pending) {
      pending = (async () => {
        try {
          await create();
        } catch {
          await new Promise(r => setTimeout(r, 50 + Math.random() * 100));
          await create();
        }
      })();
      pending.catch(() => { pending = undefined; });
    }
    return pending;
  };
}

/** Run a DDL list in order. */
export async function runDdl(executor: SqlExecutor, statements: string[]): Promise<void> {
  for (const sql of statements) await runSql(executor, sql);
}

/** Options every store accepts. */
export interface StoreOptions {
  /** Table name; must match /^[A-Za-z_][A-Za-z0-9_]{0,62}$/. */
  table?: string;
  /** Clock in epoch ms (default `Date.now`). All servers should agree on time. */
  now?: () => number;
  /** Delete expired rows every N ms (0 or undefined = never). The timer is unref'd. */
  cleanupIntervalMs?: number;
}

/** Start an unref'd cleanup timer; returns the stop function. */
export function startCleanup(intervalMs: number | undefined, sweep: () => Promise<unknown>): () => void {
  if (!intervalMs || intervalMs <= 0) return () => {};
  const timer = setInterval(() => { sweep().catch(() => {}); }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
