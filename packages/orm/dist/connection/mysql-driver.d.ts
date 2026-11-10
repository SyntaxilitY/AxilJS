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
export declare function buildMySQLPoolOptions(config: ConnectionConfig): Record<string, unknown>;
export declare class MySQLDriver extends BaseDriver {
    private pool;
    constructor(config: ConnectionConfig);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
    transaction<T>(work: (trx: TransactionContext) => Promise<T>): Promise<T>;
    ping(): Promise<boolean>;
}
//# sourceMappingURL=mysql-driver.d.ts.map