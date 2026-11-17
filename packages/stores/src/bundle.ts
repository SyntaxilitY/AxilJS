/**
 * createSqlStores() - every store on one executor, with one table prefix.
 *
 *   const stores = createSqlStores(fromConnection(db), { cleanupIntervalMs: 60_000 });
 *   await stores.ensureSchema();      // optional: create all tables at startup
 *   useStores(stores);                // @axiljs/runtime
 *   const ai = withBudget(provider, { limits, store: stores.budget });
 */

import { SqlExecutor, checkIdentifier } from './executor';
import { SqlRateLimitStore, SqlRateLimitStoreOptions } from './rate-limit';
import { SqlIdempotencyStore, SqlIdempotencyStoreOptions } from './idempotency';
import { SqlCacheStore, SqlCacheStoreOptions } from './cache';
import { SqlLockProvider, SqlLockProviderOptions, PgAdvisoryLockProvider, PgAdvisoryLockProviderOptions } from './lock';
import { SqlBudgetStore, SqlBudgetStoreOptions } from './budget';

export type SqlLockKind = 'lease' | 'advisory';

export interface SqlStoresOptions {
  /** Prepended to every default table name (default `axil_`). */
  tablePrefix?: string;
  /**
   * `lease` (default): SqlLockProvider on any dialect. `advisory`:
   * PgAdvisoryLockProvider; requires a postgres executor with `transaction()`.
   */
  lock?: SqlLockKind;
  /** Clock shared by every store unless a per-store `now` is given. */
  now?: () => number;
  /** Cleanup interval shared by every store unless overridden per store. */
  cleanupIntervalMs?: number;

  // Per-store options; they override the shared ones above (including `table`)
  rateLimit?: SqlRateLimitStoreOptions;
  idempotency?: SqlIdempotencyStoreOptions;
  cache?: SqlCacheStoreOptions;
  leaseLock?: SqlLockProviderOptions;
  advisoryLock?: PgAdvisoryLockProviderOptions;
  budget?: SqlBudgetStoreOptions;
}

export interface SqlStores {
  rateLimit: SqlRateLimitStore;
  idempotency: SqlIdempotencyStore;
  cache: SqlCacheStore;
  lock: SqlLockProvider | PgAdvisoryLockProvider;
  budget: SqlBudgetStore;
  /** The table names in use (the lock entry is absent for advisory locks). */
  tables: string[];
  /** Create every table now (idempotent). Stores still create them lazily otherwise. */
  ensureSchema(): Promise<void>;
  /** Stop every cleanup timer. Does not close the database connection. */
  close(): void;
}

const PREFIX = /^[A-Za-z0-9_]*$/;

export function createSqlStores(executor: SqlExecutor, options: SqlStoresOptions = {}): SqlStores {
  const prefix = options.tablePrefix ?? 'axil_';
  if (typeof prefix !== 'string' || !PREFIX.test(prefix)) {
    throw new Error(`@axiljs/stores: invalid tablePrefix '${String(prefix)}' (letters, digits and _ only)`);
  }
  const kind = options.lock ?? 'lease';
  if (kind !== 'lease' && kind !== 'advisory') {
    throw new Error(`@axiljs/stores: unknown lock '${String(kind)}' (expected 'lease' or 'advisory')`);
  }
  if (kind === 'advisory' && (executor.dialect !== 'postgres' || typeof executor.transaction !== 'function')) {
    throw new Error(
      `@axiljs/stores: lock 'advisory' requires a postgres executor with transaction() ` +
        `(got ${executor.dialect}${typeof executor.transaction === 'function' ? '' : ' without transaction()'}); use lock 'lease'`
    );
  }

  const shared = { now: options.now, cleanupIntervalMs: options.cleanupIntervalMs };
  const opts = <T extends { table?: string }>(name: string, own: T | undefined): T => {
    const merged: Record<string, unknown> = { table: `${prefix}${name}` };
    for (const [k, v] of Object.entries({ ...shared, ...(own ?? {}) })) if (v !== undefined) merged[k] = v;
    checkIdentifier(merged.table as string);
    return merged as T;
  };

  const rateLimit = new SqlRateLimitStore(executor, opts('rate_limits', options.rateLimit));
  const idempotency = new SqlIdempotencyStore(executor, opts('idempotency', options.idempotency));
  const cache = new SqlCacheStore(executor, opts('cache', options.cache));
  const budget = new SqlBudgetStore(executor, opts('ai_budget', options.budget));
  const lock = kind === 'advisory'
    ? new PgAdvisoryLockProvider(executor, options.advisoryLock)
    : new SqlLockProvider(executor, opts('locks', options.leaseLock));

  const tables = [rateLimit.table, idempotency.table, cache.table, cache.tagTable, budget.table];
  if (lock instanceof SqlLockProvider) tables.push(lock.table);

  return {
    rateLimit,
    idempotency,
    cache,
    lock,
    budget,
    tables,
    async ensureSchema() {
      // Sequential: concurrent DDL on one connection or catalog gains nothing
      await rateLimit.ensureSchema();
      await idempotency.ensureSchema();
      await cache.ensureSchema();
      if (lock instanceof SqlLockProvider) await lock.ensureSchema();
      await budget.ensureSchema();
    },
    close() {
      rateLimit.close();
      idempotency.close();
      cache.close();
      if (lock instanceof SqlLockProvider) lock.close();
      budget.close();
    }
  };
}
