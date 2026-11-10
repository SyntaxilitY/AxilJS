/**
 * SQLite driver - uses better-sqlite3 (synchronous API wrapped async).
 * SQLite is ideal for development, testing, and small deployments.
 * No server setup required - just a file.
 *
 * Install: npm install better-sqlite3
 *          npm install -D @types/better-sqlite3
 */

import { BaseDriver, TransactionContext } from './base-driver';
import { ConnectionConfig, QueryResult } from '../types';

export class SQLiteDriver extends BaseDriver {
  // The better-sqlite3 database instance
  // Typed as any to avoid requiring @types/better-sqlite3
  private db: any = null;

  constructor(config: ConnectionConfig) {
    super(config);
  }

  async connect(): Promise<void> {
    try {
      // Dynamically import better-sqlite3 (peer dependency)
      const Database = require('better-sqlite3');

      const filename = this.config.filename || this.config.database || ':memory:';

      this.db = new Database(filename, {
        // verbose logging if configured
        verbose: this.config.logging
          ? (sql: string) => console.log(`\x1b[90m[SQLite]\x1b[0m ${sql}`)
          : undefined
      });

      // Enable WAL mode for better concurrent read performance
      this.db.pragma('journal_mode = WAL');

      // Enable foreign key enforcement
      this.db.pragma('foreign_keys = ON');

      this.connected = true;

      console.log(
        `\x1b[32m[AxilJS ORM]\x1b[0m SQLite connected: ${filename}`
      );
    } catch (error: any) {
      if (error.code === 'MODULE_NOT_FOUND') {
        throw new Error(
          'better-sqlite3 is required for SQLite support.\n' +
            'Run: npm install better-sqlite3'
        );
      }
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.connected = false;
    }
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = []
  ): Promise<QueryResult<T>> {
    if (!this.db) throw new Error('SQLite not connected. Call connect() first.');

    this.log(sql, params);

    // better-sqlite3 cannot bind booleans, Dates or undefined
    const bound = params.map(v =>
      typeof v === 'boolean' ? (v ? 1 : 0)
        : v instanceof Date ? v.toISOString()
        : v === undefined ? null
        : v
    );

    try {
      const stmt = this.db.prepare(sql);
      // stmt.reader is true for any statement that returns rows
      // (SELECT, WITH, PRAGMA, ... RETURNING)
      if (stmt.reader) {
        // Read query - returns rows
        const rows = stmt.all(...bound) as T[];
        return { rows, affectedRows: 0 };
      } else {
        // Write query - returns run info
        const result = stmt.run(...bound);
        return {
          rows: [],
          affectedRows: result.changes,
          insertId: result.lastInsertRowid as number
        };
      }
    } catch (error: any) {
      throw new Error(`SQLite query error: ${error.message}\nSQL: ${sql}`);
    }
  }

  async transaction<T>(
    work: (trx: TransactionContext) => Promise<T>
  ): Promise<T> {
    if (!this.db) throw new Error('SQLite not connected.');

    // better-sqlite3's db.transaction() rejects async functions
    // ("Transaction function cannot return a promise"), so manage
    // BEGIN / COMMIT / ROLLBACK manually. Nested calls use savepoints.
    const trxContext: TransactionContext = {
      query: async <R>(sql: string, params: unknown[] = []) => {
        return this.query<R>(sql, params);
      }
    };

    const nested    = this.db.inTransaction;
    const savepoint = `axil_sp_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

    this.db.exec(nested ? `SAVEPOINT ${savepoint}` : 'BEGIN');

    try {
      const result = await work(trxContext);
      this.db.exec(nested ? `RELEASE SAVEPOINT ${savepoint}` : 'COMMIT');
      return result;
    } catch (error) {
      try {
        if (nested) {
          this.db.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
          this.db.exec(`RELEASE SAVEPOINT ${savepoint}`);
        } else if (this.db.inTransaction) {
          this.db.exec('ROLLBACK');
        }
      } catch {
        // Preserve the original error
      }
      throw error;
    }
  }

  async ping(): Promise<boolean> {
    try {
      await this.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}