/**
 * SQL-backed fixed-window rate-limit counter.
 *
 * Same shape as @axiljs/security's `RateLimitStore` and @axiljs/runtime's
 * `RateLimitCounterStore`, so one instance can back `rateLimit({ store })`
 * and `setRateLimitStore(store)` across every server sharing the database.
 */

import {
  SqlExecutor,
  StoreOptions,
  checkIdentifier,
  keyType,
  lazySchema,
  num,
  runDdl,
  runSql,
  runTx,
  startCleanup,
  storageKey
} from './executor';

export interface SqlRateLimitStoreOptions extends StoreOptions {}

export class SqlRateLimitStore {
  readonly table: string;
  private readonly now: () => number;
  private readonly stopCleanup: () => void;
  readonly ensureSchema: () => Promise<void>;

  constructor(private readonly executor: SqlExecutor, options: SqlRateLimitStoreOptions = {}) {
    this.table = checkIdentifier(options.table ?? 'axil_rate_limits');
    this.now = options.now ?? Date.now;
    this.ensureSchema = lazySchema(() => this.createSchema());
    this.stopCleanup = startCleanup(options.cleanupIntervalMs, () => this.cleanup());
  }

  /** Count one hit for `key` and return the window's count and reset time. */
  async increment(key: string, windowMs: number): Promise<{ count: number; resetAt: number }> {
    await this.ensureSchema();
    const id = storageKey(key);
    const now = this.now();
    const resetAt = now + windowMs;
    const t = this.table;

    if (this.executor.dialect === 'mysql') {
      // Assignments run left to right and later ones see earlier results:
      // `hits` must be assigned before `reset_at` so both CASEs test the old
      // reset_at. The INSERT holds the row lock until commit, so the SELECT
      // in the same transaction reads exactly this increment.
      return runTx(this.executor, async q => {
        await runSql(
          q,
          `INSERT INTO ${t} (id, hits, reset_at) VALUES (?, 1, ?) ON DUPLICATE KEY UPDATE ` +
            `hits = CASE WHEN reset_at <= ? THEN 1 ELSE hits + 1 END, ` +
            `reset_at = CASE WHEN reset_at <= ? THEN ? ELSE reset_at END`,
          [id, resetAt, now, now, resetAt]
        );
        const { rows } = await runSql<{ hits: unknown; reset_at: unknown }>(
          q,
          `SELECT hits, reset_at FROM ${t} WHERE id = ?`,
          [id]
        );
        return { count: num(rows[0]?.hits), resetAt: num(rows[0]?.reset_at) };
      });
    }

    const { rows } = await runSql<{ hits: unknown; reset_at: unknown }>(
      this.executor,
      `INSERT INTO ${t} (id, hits, reset_at) VALUES (?, 1, ?) ON CONFLICT (id) DO UPDATE SET ` +
        `hits = CASE WHEN ${t}.reset_at <= ? THEN 1 ELSE ${t}.hits + 1 END, ` +
        `reset_at = CASE WHEN ${t}.reset_at <= ? THEN ? ELSE ${t}.reset_at END ` +
        `RETURNING hits, reset_at`,
      [id, resetAt, now, now, resetAt]
    );
    return { count: num(rows[0]?.hits), resetAt: num(rows[0]?.reset_at) };
  }

  /** Forget the counter for `key`. */
  async reset(key: string): Promise<void> {
    await this.ensureSchema();
    await runSql(this.executor, `DELETE FROM ${this.table} WHERE id = ?`, [storageKey(key)]);
  }

  /** Delete every expired window; returns the number of rows removed when the driver reports it. */
  async cleanup(): Promise<number | undefined> {
    await this.ensureSchema();
    const { affectedRows } = await runSql(this.executor, `DELETE FROM ${this.table} WHERE reset_at <= ?`, [this.now()]);
    return affectedRows;
  }

  /** Stop the cleanup timer. Idempotent; does not close the database connection. */
  close(): void {
    this.stopCleanup();
  }

  private createSchema(): Promise<void> {
    const d = this.executor.dialect;
    const t = this.table;
    if (d === 'mysql') {
      return runDdl(this.executor, [
        `CREATE TABLE IF NOT EXISTS ${t} (id ${keyType(d)} NOT NULL PRIMARY KEY, hits INT NOT NULL, ` +
          `reset_at BIGINT NOT NULL, INDEX idx_reset_at (reset_at))`
      ]);
    }
    return runDdl(this.executor, [
      `CREATE TABLE IF NOT EXISTS ${t} (id ${keyType(d)} NOT NULL PRIMARY KEY, hits INTEGER NOT NULL, reset_at BIGINT NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS ${t}_reset_at_idx ON ${t} (reset_at)`
    ]);
  }
}
