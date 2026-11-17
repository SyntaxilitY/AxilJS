/**
 * @axiljs/stores - Public API
 *
 * SQL-backed shared stores (rate limits, idempotency records, cache, locks,
 * AI budgets) so AxilJS state works across several servers without Redis.
 */

export { fromConnection, toDialect } from './executor';
export type { SqlDialect, SqlExecutor, SqlQueryResult, StoreOptions } from './executor';

export { SqlRateLimitStore } from './rate-limit';
export type { SqlRateLimitStoreOptions } from './rate-limit';

export { SqlIdempotencyStore } from './idempotency';
export type { SqlIdempotencyStoreOptions } from './idempotency';

export { SqlCacheStore } from './cache';
export type { SqlCacheStoreOptions } from './cache';

export { SqlLockProvider, PgAdvisoryLockProvider } from './lock';
export type { SqlLockProviderOptions, PgAdvisoryLockProviderOptions, LockAcquireOptions, LockRelease } from './lock';

export { SqlBudgetStore } from './budget';
export type { SqlBudgetStoreOptions, SqlBudgetAmounts, SqlBudgetWindow } from './budget';

export { createSqlStores } from './bundle';
export type { SqlStores, SqlStoresOptions, SqlLockKind } from './bundle';
