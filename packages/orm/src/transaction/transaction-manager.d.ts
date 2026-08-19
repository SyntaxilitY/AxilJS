/**
 * AxilORM — Transaction Manager
 *
 * Wraps the driver's transaction with a fluent API.
 *
 * Usage:
 *   await Transaction.run(async (trx) => {
 *     await User.query().insert({ name: 'Tariq' })
 *     await Order.query().insert({ user_id: 1, total: 500 })
 *   })
 *
 *   // Nested transactions (savepoints)
 *   await Transaction.run(async (trx) => {
 *     await trx.run(async (inner) => {
 *       // savepoint
 *     })
 *   })
 */
import { BaseDriver, TransactionContext } from '../connection/base-driver';
import { QueryBuilder } from '../query/query-builder';
export declare class Transaction {
    private static _driver;
    private static _driverType;
    static setDriver(driver: BaseDriver, driverType: string): void;
    static run<T>(callback: (trx: TransactionScope) => Promise<T>): Promise<T>;
}
export declare class TransactionScope {
    private readonly ctx;
    private readonly driverType;
    constructor(ctx: TransactionContext, driverType: string);
    query(table: string): QueryBuilder;
    raw<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
}
//# sourceMappingURL=transaction-manager.d.ts.map