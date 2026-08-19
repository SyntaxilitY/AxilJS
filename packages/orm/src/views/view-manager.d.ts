/**
 * AxilORM — View Manager
 *
 * Create and query database views.
 *
 * Usage:
 *   await ViewManager.create('active_users', `
 *     SELECT * FROM users WHERE is_active = true
 *   `, db)
 *
 *   const users = await ViewManager.query('active_users', driver, driverType)
 */
import { BaseDriver } from '../connection/base-driver';
import { TransactionContext } from '../connection/base-driver';
import { QueryBuilder } from '../query/query-builder';
export declare class ViewManager {
    static create(name: string, selectSQL: string, db: TransactionContext, replace?: boolean): Promise<void>;
    static drop(name: string, db: TransactionContext): Promise<void>;
    static query<T = Record<string, unknown>>(name: string, driver: BaseDriver, driverType: string): QueryBuilder<T>;
}
//# sourceMappingURL=view-manager.d.ts.map