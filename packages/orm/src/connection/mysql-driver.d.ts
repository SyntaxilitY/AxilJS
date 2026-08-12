/**
 * MySQL driver - uses the 'mysql2' package (Promise API).
 * Compatible with MySQL 5.7+, MySQL 8, and MariaDB.
 *
 * Install: npm install mysql2
 */
import { BaseDriver, TransactionContext } from './base-driver';
import { ConnectionConfig, QueryResult } from '../types';
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