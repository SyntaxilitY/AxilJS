/**
 * AxilORM — Stored Procedure & Function Manager
 *
 * Call stored procedures / functions directly.
 *
 * Usage:
 *   const result = await ProcedureManager.call(
 *     'calculate_discount',
 *     [userId, orderTotal],
 *     driver,
 *     'postgres'
 *   )
 */
import { BaseDriver } from '../connection/base-driver';
export declare class ProcedureManager {
    /**
     * Call a stored procedure.
     * PostgreSQL: SELECT * FROM procedure_name($1, $2)
     * MySQL:      CALL procedure_name(?, ?)
     */
    static call<T = unknown>(name: string, params: unknown[], driver: BaseDriver, driverType: string): Promise<T[]>;
    /**
     * Call a scalar function — returns a single value.
     */
    static scalar<T = unknown>(name: string, params: unknown[], driver: BaseDriver, driverType: string): Promise<T | null>;
    /**
     * Execute a raw stored procedure (no return).
     */
    static execute(name: string, params: unknown[], driver: BaseDriver, driverType: string): Promise<void>;
}
//# sourceMappingURL=procedure-manager.d.ts.map