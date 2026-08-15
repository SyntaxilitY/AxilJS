/**
 * MySQL driver - uses the 'mysql2' package (Promise API).
 * Compatible with MySQL 5.7+, MySQL 8, and MariaDB.
 *
 * Install: npm install mysql2
 */

import { BaseDriver, TransactionContext } from './base-driver';
import { ConnectionConfig, QueryResult } from '../types';

export class MySQLDriver extends BaseDriver {
  // mysql2 pool instance
  private pool: any = null;

  constructor(config: ConnectionConfig) {
    super(config);
  }

  async connect(): Promise<void> {
    try {
      const mysql = require('mysql2/promise');

      this.pool = mysql.createPool({
        host: this.config.host || 'localhost',
        port: this.config.port || 3306,
        database: this.config.database,
        user: this.config.username,
        password: this.config.password,
        connectionLimit: this.config.pool?.max || 10,
        ssl: this.config.ssl
      });

      // Test connection
      const conn = await this.pool.getConnection();
      conn.release();

      this.connected = true;

      console.log(
        `\x1b[32m[@axiljsJS ORM]\x1b[0m MySQL connected: ` +
          `${this.config.host}:${this.config.port}/${this.config.database}`
      );
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
      const [rows, fields] = await this.pool.execute(sql, params);

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
          const [rows] = await conn.execute(sql, params);
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
      await conn.rollback();
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