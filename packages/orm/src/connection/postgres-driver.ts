/**
 * PostgreSQL driver - uses the 'pg' package.
 * Production-ready with connection pooling.
 *
 * Install: npm install pg
 *          npm install -D @types/pg
 */

import { BaseDriver, TransactionContext } from './base-driver';
import { ConnectionConfig, QueryResult } from '../types';

export class PostgresDriver extends BaseDriver {
  // pg.Pool instance - typed as any to avoid requiring @types/pg
  private pool: any = null;

  constructor(config: ConnectionConfig) {
    super(config);
  }

  async connect(): Promise<void> {
    try {
      const { Pool } = require('pg');

      // Build connection config for pg
      const pgConfig = this.config.url
        ? { connectionString: this.config.url, ssl: this.config.ssl }
        : {
            host: this.config.host || 'localhost',
            port: this.config.port || 5432,
            database: this.config.database,
            user: this.config.username,
            password: this.config.password,
            ssl: this.config.ssl,
            max: this.config.pool?.max || 10,
            min: this.config.pool?.min || 2,
            idleTimeoutMillis: this.config.pool?.idleTimeoutMs || 30000
          };

      this.pool = new Pool(pgConfig);

      // Test connection
      const client = await this.pool.connect();
      client.release();

      this.connected = true;

      const host = this.config.url
        ? this.config.url.replace(/:[^@]+@/, ':***@') // Hide password in log
        : `${this.config.host}:${this.config.port}/${this.config.database}`;

      console.log(`\x1b[32m[REstJS ORM]\x1b[0m PostgreSQL connected: ${host}`);
    } catch (error: any) {
      if (error.code === 'MODULE_NOT_FOUND') {
        throw new Error(
          'pg is required for PostgreSQL support.\n' +
            'Run: npm install pg'
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
      throw new Error('PostgreSQL not connected. Call connect() first.');
    }

    this.log(sql, params);

    try {
      const result = await this.pool.query(sql, params);

      return {
        rows: result.rows as T[],
        affectedRows: result.rowCount || 0,
        insertId: result.rows[0]?.id
      };
    } catch (error: any) {
      throw new Error(
        `PostgreSQL query error: ${error.message}\nSQL: ${sql}`
      );
    }
  }

  async transaction<T>(
    work: (trx: TransactionContext) => Promise<T>
  ): Promise<T> {
    if (!this.pool) throw new Error('PostgreSQL not connected.');

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const trxContext: TransactionContext = {
        query: async <R>(sql: string, params: unknown[] = []) => {
          this.log(sql, params);
          const result = await client.query(sql, params);
          return {
            rows: result.rows as R[],
            affectedRows: result.rowCount || 0,
            insertId: result.rows[0]?.id
          };
        }
      };

      const result = await work(trxContext);

      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
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