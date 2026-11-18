/**
 * Abstract base class for all database drivers.
 * Each driver (postgres, mysql, sqlite, mongodb) extends this.
 * The query builder and repository talk to this interface.
 */
import { ConnectionConfig, QueryResult } from '../types';
export declare abstract class BaseDriver {
    protected config: ConnectionConfig;
    protected connected: boolean;
    constructor(config: ConnectionConfig);
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
    abstract query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
    /**
     * Execute multiple queries in a transaction.
     * Rolls back automatically on any error.
     *
     * @param work  Async function that receives a transaction context
     */
    abstract transaction<T>(work: (trx: TransactionContext) => Promise<T>): Promise<T>;
    /**
     * Check if the connection is alive.
     */
    abstract ping(): Promise<boolean>;
    /**
     * Get the connected state.
     */
    isConnected(): boolean;
    /**
     * Log a query if logging is enabled. Every driver calls this before it
     * executes a statement, so it also reports the statement to
     * @axiljs/runtime's intent checks (tReadOnly / tPure) when that package is
     * loaded. In enforce mode the report throws and the statement never runs.
     */
    protected log(sql: string, params?: unknown[]): void;
}
/** Classify a statement as 'db.read' or 'db.write'. */
export declare function classifyStatement(sql: string): 'db.read' | 'db.write';
/**
 * Hand loaded rows or entities to @axiljs/runtime's sensitive data lineage
 * (tSensitive / tRedact values are tracked for the rest of the request)
 * without depending on it. No-op when the runtime is not loaded.
 */
export declare function observeLoaded(value: unknown, entity?: Function, columns?: Map<string, {
    columnName: string;
}>): void;
/**
 * Transaction context passed to the transaction work function.
 * Has the same query interface as the driver but is scoped to the transaction.
 */
export interface TransactionContext {
    query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>;
}
//# sourceMappingURL=base-driver.d.ts.map