/**
 * SQL-backed cache for tCache / tCachePut / tCacheEvict / tCacheInvalidate
 * (@axiljs/runtime `CacheStore`). Entries live in one table, tags in a
 * second one. Values are JSON-encoded.
 */

import {
  SqlExecutor,
  StoreOptions,
  checkIdentifier,
  keyType,
  lazySchema,
  runDdl,
  runSql,
  runTx,
  startCleanup,
  storageKey,
  textType
} from './executor';

const CHUNK = 500;

export interface SqlCacheStoreOptions extends StoreOptions {
  /** Tag table name (default `<table>_tags`). */
  tagTable?: string;
}

export class SqlCacheStore {
  readonly table: string;
  readonly tagTable: string;
  private readonly now: () => number;
  private readonly stopCleanup: () => void;
  readonly ensureSchema: () => Promise<void>;

  constructor(private readonly executor: SqlExecutor, options: SqlCacheStoreOptions = {}) {
    this.table = checkIdentifier(options.table ?? 'axil_cache');
    this.tagTable = checkIdentifier(options.tagTable ?? `${this.table}_tags`, 'tag table name');
    this.now = options.now ?? Date.now;
    this.ensureSchema = lazySchema(() => this.createSchema());
    this.stopCleanup = startCleanup(options.cleanupIntervalMs, () => this.cleanup());
  }

  async get(key: string): Promise<{ value: unknown } | undefined> {
    await this.ensureSchema();
    const { rows } = await runSql<{ payload: string }>(
      this.executor,
      `SELECT payload FROM ${this.table} WHERE id = ? AND expires_at > ?`,
      [storageKey(key), this.now()]
    );
    if (!rows.length) return undefined;
    const parsed = JSON.parse(String(rows[0].payload)) as { v?: unknown };
    return { value: parsed.v };
  }

  async set(key: string, value: unknown, ttlMs: number, tags: string[] = []): Promise<void> {
    await this.ensureSchema();
    const id = storageKey(key);
    const json = JSON.stringify({ v: value });
    const expires = this.now() + ttlMs;
    const unique = [...new Set(tags.map(storageKey))];
    const mysql = this.executor.dialect === 'mysql';
    const t = this.table;
    const tt = this.tagTable;

    await runTx(this.executor, async q => {
      await runSql(
        q,
        mysql
          ? `INSERT INTO ${t} (id, payload, expires_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE payload = VALUES(payload), expires_at = VALUES(expires_at)`
          : `INSERT INTO ${t} (id, payload, expires_at) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET payload = excluded.payload, expires_at = excluded.expires_at`,
        [id, json, expires]
      );
      await runSql(q, `DELETE FROM ${tt} WHERE id = ?`, [id]);
      if (unique.length) {
        const values = unique.map(() => '(?, ?)').join(', ');
        const params = unique.flatMap(tag => [tag, id]);
        await runSql(
          q,
          mysql
            ? `INSERT IGNORE INTO ${tt} (tag, id) VALUES ${values}`
            : `INSERT INTO ${tt} (tag, id) VALUES ${values} ON CONFLICT (tag, id) DO NOTHING`,
          params
        );
      }
    });
  }

  async delete(key: string): Promise<void> {
    await this.ensureSchema();
    const id = storageKey(key);
    await runTx(this.executor, async q => {
      await runSql(q, `DELETE FROM ${this.table} WHERE id = ?`, [id]);
      await runSql(q, `DELETE FROM ${this.tagTable} WHERE id = ?`, [id]);
    });
  }

  async deleteByTag(tag: string): Promise<void> {
    await this.ensureSchema();
    const t = storageKey(tag);
    await runTx(this.executor, async q => {
      const { rows } = await runSql<{ id: string }>(q, `SELECT id FROM ${this.tagTable} WHERE tag = ?`, [t]);
      const ids = rows.map(r => String(r.id));
      // Delete the entries and all of their tag rows (not only this tag's)
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        const list = chunk.map(() => '?').join(', ');
        await runSql(q, `DELETE FROM ${this.table} WHERE id IN (${list})`, chunk);
        await runSql(q, `DELETE FROM ${this.tagTable} WHERE id IN (${list})`, chunk);
      }
    });
  }

  async clear(): Promise<void> {
    await this.ensureSchema();
    await runTx(this.executor, async q => {
      await runSql(q, `DELETE FROM ${this.tagTable}`);
      await runSql(q, `DELETE FROM ${this.table}`);
    });
  }

  /** Delete expired entries and their tag rows. */
  async cleanup(): Promise<number | undefined> {
    await this.ensureSchema();
    const now = this.now();
    return runTx(this.executor, async q => {
      await runSql(q, `DELETE FROM ${this.tagTable} WHERE id IN (SELECT id FROM ${this.table} WHERE expires_at <= ?)`, [now]);
      const { affectedRows } = await runSql(q, `DELETE FROM ${this.table} WHERE expires_at <= ?`, [now]);
      return affectedRows;
    });
  }

  /** Stop the cleanup timer. Idempotent. */
  close(): void {
    this.stopCleanup();
  }

  private createSchema(): Promise<void> {
    const d = this.executor.dialect;
    const t = this.table;
    const tt = this.tagTable;
    if (d === 'mysql') {
      return runDdl(this.executor, [
        `CREATE TABLE IF NOT EXISTS ${t} (id ${keyType(d)} NOT NULL PRIMARY KEY, payload ${textType(d)} NOT NULL, ` +
          `expires_at BIGINT NOT NULL, INDEX idx_expires_at (expires_at))`,
        `CREATE TABLE IF NOT EXISTS ${tt} (tag ${keyType(d)} NOT NULL, id ${keyType(d)} NOT NULL, ` +
          `PRIMARY KEY (tag, id), INDEX idx_id (id))`
      ]);
    }
    return runDdl(this.executor, [
      `CREATE TABLE IF NOT EXISTS ${t} (id ${keyType(d)} NOT NULL PRIMARY KEY, payload ${textType(d)} NOT NULL, expires_at BIGINT NOT NULL)`,
      `CREATE INDEX IF NOT EXISTS ${t}_expires_at_idx ON ${t} (expires_at)`,
      `CREATE TABLE IF NOT EXISTS ${tt} (tag ${keyType(d)} NOT NULL, id ${keyType(d)} NOT NULL, PRIMARY KEY (tag, id))`,
      `CREATE INDEX IF NOT EXISTS ${tt}_id_idx ON ${tt} (id)`
    ]);
  }
}
