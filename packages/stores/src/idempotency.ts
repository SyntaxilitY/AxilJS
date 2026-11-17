/**
 * SQL-backed store for tIdempotent results (@axiljs/runtime `IdempotencyStore`).
 * Values are JSON-encoded, so results must be JSON-serialisable.
 */

import {
  SqlExecutor,
  StoreOptions,
  checkIdentifier,
  keyType,
  lazySchema,
  runDdl,
  runSql,
  startCleanup,
  storageKey,
  textType
} from './executor';

export interface SqlIdempotencyStoreOptions extends StoreOptions {}

export class SqlIdempotencyStore {
  readonly table: string;
  private readonly now: () => number;
  private readonly stopCleanup: () => void;
  readonly ensureSchema: () => Promise<void>;

  constructor(private readonly executor: SqlExecutor, options: SqlIdempotencyStoreOptions = {}) {
    this.table = checkIdentifier(options.table ?? 'axil_idempotency');
    this.now = options.now ?? Date.now;
    this.ensureSchema = lazySchema(() => this.createSchema());
    this.stopCleanup = startCleanup(options.cleanupIntervalMs, () => this.cleanup());
  }

  /** The stored `{ result }` for `key`, or undefined when missing or expired. */
  async get(key: string): Promise<{ result: unknown } | undefined> {
    await this.ensureSchema();
    const { rows } = await runSql<{ payload: string }>(
      this.executor,
      `SELECT payload FROM ${this.table} WHERE id = ? AND expires_at > ?`,
      [storageKey(key), this.now()]
    );
    if (!rows.length) return undefined;
    const parsed = JSON.parse(String(rows[0].payload)) as { result?: unknown };
    return { result: parsed.result };
  }

  /** Store (or replace) `value` for `ttlMs`. */
  async set(key: string, value: { result: unknown }, ttlMs: number): Promise<void> {
    await this.ensureSchema();
    const json = JSON.stringify({ result: value?.result });
    const params = [storageKey(key), json, this.now() + ttlMs];
    const t = this.table;
    await runSql(
      this.executor,
      this.executor.dialect === 'mysql'
        ? `INSERT INTO ${t} (id, payload, expires_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE payload = VALUES(payload), expires_at = VALUES(expires_at)`
        : `INSERT INTO ${t} (id, payload, expires_at) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET payload = excluded.payload, expires_at = excluded.expires_at`,
      params
    );
  }

  async delete(key: string): Promise<void> {
    await this.ensureSchema();
    await runSql(this.executor, `DELETE FROM ${this.table} WHERE id = ?`, [storageKey(key)]);
  }

  /** Delete every expired record. */
  async cleanup(): Promise<number | undefined> {
    await this.ensureSchema();
    const { affectedRows } = await runSql(this.executor, `DELETE FROM ${this.table} WHERE expires_at <= ?`, [this.now()]);
    return affectedRows;
  }

  /** Stop the cleanup timer. Idempotent. */
  close(): void {
    this.stopCleanup();
  }

  private createSchema(): Promise<void> {
    const d = this.executor.dialect;
    const t = this.table;
    if (d === 'mysql') {
      return runDdl(this.executor, [
        `CREATE TABLE IF NOT EXISTS ${t} (id ${keyType(d)} NOT NULL PRIMARY KEY, payload ${textType(d)} NOT NULL, ` +
          `expires_at BIGINT NOT NULL, INDEX idx_expires_at (expires_at))`
      ]);
    }
    return runDdl(this.executor, [
      `CREATE TABLE IF NOT EXISTS ${t} (id ${keyType(d)} NOT NULL PRIMARY KEY, payload ${textType(d)} NOT NULL, expires_at BIGINT NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS ${t}_expires_at_idx ON ${t} (expires_at)`
    ]);
  }
}
