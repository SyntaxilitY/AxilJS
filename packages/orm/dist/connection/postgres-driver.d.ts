/**
 * PostgreSQL driver - uses the 'pg' package.
 * Production-ready with connection pooling.
 *
 * Install: npm install pg
 *          npm install -D @types/pg
 */
import { BaseDriver, TransactionContext } from './base-driver';
import { ConnectionConfig, QueryResult } from '../types';
export declare class PostgresDriver extends BaseDriver {
    private pool;
    constructor(config: ConnectionConfig);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
    transaction<T>(work: (trx: TransactionContext) => Promise<T>): Promise<T>;
    ping(): Promise<boolean>;
}
//# sourceMappingURL=postgres-driver.d.ts.map