/**
 * Abstract base class for all database drivers.
 * Each driver (postgres, mysql, sqlite, mongodb) extends this.
 * The query builder and repository talk to this interface.
 */

import { ConnectionConfig, QueryResult } from '../types';

export abstract class BaseDriver {
  protected config: ConnectionConfig;
  protected connected: boolean = false;

  constructor(config: ConnectionConfig) {
    this.config = config;
  }

  /**
   * Establish database connection / connection pool.
   */
  abstract connect(): Promise<void>;

  /**
   * Close all connections gracefully.
   */
  abstract disconnect(): Promise<void>;

  /**
   * Execute a raw SQL query with parameterized values.
   *
   * @param sql     SQL query with $1, $2 (postgres) or ? (mysql/sqlite) placeholders
   * @param params  Parameter values to bind
   */
  abstract query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<QueryResult<T>>;

  /**
   * Execute multiple queries in a transaction.
   * Rolls back automatically on any error.
   *
   * @param work  Async function that receives a transaction context
   */
  abstract transaction<T>(
    work: (trx: TransactionContext) => Promise<T>
  ): Promise<T>;

  /**
   * Check if the connection is alive.
   */
  abstract ping(): Promise<boolean>;

  /**
   * Get the connected state.
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Log a query if logging is enabled.
   */
  protected log(sql: string, params?: unknown[]): void {
    if (this.config.logging) {
      console.log(
        `\x1b[90m[@axilJS ORM]\x1b[0m ${sql}`,
        params?.length ? params : ''
      );
    }
  }
}

/**
 * Transaction context passed to the transaction work function.
 * Has the same query interface as the driver but is scoped to the transaction.
 */
export interface TransactionContext {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<QueryResult<T>>;
}