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
export declare class SQLiteDriver extends BaseDriver {
    private db;
    constructor(config: ConnectionConfig);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
    transaction<T>(work: (trx: TransactionContext) => Promise<T>): Promise<T>;
    ping(): Promise<boolean>;
}
//# sourceMappingURL=sqlite-driver.d.ts.map