/**
 * MySQL driver - uses the 'mysql2' package (Promise API).
 * Compatible with MySQL 5.7+, MySQL 8, and MariaDB.
 *
 * Install: npm install mysql2
 */

import { BaseDriver, TransactionContext } from './base-driver';
import { ConnectionConfig, QueryResult } from '../types';

/**
 * mysql2 pool options for a ConnectionConfig. `config.url`
 * (mysql://user:pass@host:3306/db) takes priority over the individual fields,
 * which still override pool size / ssl.
 */
export function buildMySQLPoolOptions(config: ConnectionConfig): Record<string, unknown> {
  const common = {
    connectionLimit: config.pool?.max || 10,
    ...(config.ssl !== undefined ? { ssl: config.ssl } : {})
  };

  if (config.url) {
    return { uri: config.url, ...common };
  }

  return {
    host: config.host || 'localhost',
    port: config.port || 3306,
    database: config.database,
    user: config.username,
    password: config.password,
    ...common
  };
}

export class MySQLDriver extends BaseDriver {
  // mysql2 pool instance
  private pool: any = null;

  constructor(config: ConnectionConfig) {
    super(config);
  }

  async connect(): Promise<void> {
    try {
      const mysql = require('mysql2/promise');

      this.pool = mysql.createPool(buildMySQLPoolOptions(this.config));

      // Test connection
      let conn: any;
      try {
        conn = await this.pool.getConnection();
      } catch (error) {
        // Don't leak the pool when the first connection fails
        await this.pool.end().catch(() => {});
        this.pool = null;
        throw error;
      }
      conn.release();

      this.connected = true;

      const target = this.config.url
        ? this.config.url.replace(/:[^:@/]+@/, ':***@') // Hide password in log
        : `${this.config.host}:${this.config.port}/${this.config.database}`;
      console.log(`\x1b[32m[AxilJS ORM]\x1b[0m MySQL connected: ${target}`);
    } catch (error: any) {
      if (error.code === 'MODULE_NOT_FOUND') {
        throw new Error(
          'mysql2 is required for MySQL support.\n' +
            'Run: npm install mysql2'
        );
      }
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.connected = false;
    }
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = []
  ): Promise<QueryResult<T>> {
    if (!this.pool) {
      throw new Error('MySQL not connected. Call connect() first.');
    }

    this.log(sql, params);

    try {
      // mysql2 rejects undefined bind values — send NULL instead
      const [rows, fields] = await this.pool.execute(sql, params.map(v => v === undefined ? null : v));

      // mysql2 returns different shapes for SELECT vs writes
      if (Array.isArray(rows)) {
        return { rows: rows as T[], affectedRows: 0 };
      }

      return {
        rows: [],
        affectedRows: (rows as any).affectedRows || 0,
        insertId: (rows as any).insertId
      };
    } catch (error: any) {
      throw new Error(
        `MySQL query error: ${error.message}\nSQL: ${sql}`
      );
    }
  }

  async transaction<T>(
    work: (trx: TransactionContext) => Promise<T>
  ): Promise<T> {
    if (!this.pool) throw new Error('MySQL not connected.');

    const conn = await this.pool.getConnection();

    try {
      await conn.beginTransaction();

      const trxContext: TransactionContext = {
        query: async <R>(sql: string, params: unknown[] = []) => {
          this.log(sql, params);
          const [rows] = await conn.execute(sql, params.map(v => v === undefined ? null : v));
          if (Array.isArray(rows)) {
            return { rows: rows as R[], affectedRows: 0 };
          }
          return {
            rows: [],
            affectedRows: (rows as any).affectedRows || 0,
            insertId: (rows as any).insertId
          };
        }
      };

      const result = await work(trxContext);

      await conn.commit();
      return result;
    } catch (error) {
      try {
        await conn.rollback();
      } catch {
        // Preserve the original error
      }
      throw error;
    } finally {
      conn.release();
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