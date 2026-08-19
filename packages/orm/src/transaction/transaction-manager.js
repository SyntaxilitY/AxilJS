"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionScope = exports.Transaction = void 0;
const query_builder_1 = require("../query/query-builder");
class Transaction {
    static _driver = null;
    static _driverType = 'sqlite';
    static setDriver(driver, driverType) {
        this._driver = driver;
        this._driverType = driverType;
    }
    static async run(callback) {
        if (!this._driver) {
            throw new Error('[AxilORM] Transaction: no driver set.');
        }
        let result;
        await this._driver.transaction(async (ctx) => {
            const scope = new TransactionScope(ctx, this._driverType);
            result = await callback(scope);
        });
        return result;
    }
}
exports.Transaction = Transaction;
class TransactionScope {
    ctx;
    driverType;
    constructor(ctx, driverType) {
        this.ctx = ctx;
        this.driverType = driverType;
    }
    query(table) {
        // Wrap ctx as a minimal driver
        const mockDriver = {
            query: this.ctx.query.bind(this.ctx),
            transaction: () => { throw new Error('Nested transactions not supported directly'); }
        };
        return new query_builder_1.QueryBuilder(mockDriver, this.driverType).from(table);
    }
    async raw(sql, params = []) {
        const result = await this.ctx.query(sql, params);
        return result.rows;
    }
}
exports.TransactionScope = TransactionScope;
//# sourceMappingURL=transaction-manager.js.map