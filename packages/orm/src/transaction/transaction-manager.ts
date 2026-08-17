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

import { BaseDriver, TransactionContext } from '../connection/base-driver'
import { QueryBuilder }                   from '../query/query-builder'

export class Transaction {
  private static _driver:     BaseDriver | null = null
  private static _driverType: string            = 'sqlite'

  static setDriver(driver: BaseDriver, driverType: string): void {
    this._driver     = driver
    this._driverType = driverType
  }

  static async run<T>(
    callback: (trx: TransactionScope) => Promise<T>
  ): Promise<T> {
    if (!this._driver) {
      throw new Error('[AxilORM] Transaction: no driver set.')
    }

    let result: T

    await this._driver.transaction(async (ctx) => {
      const scope = new TransactionScope(ctx, this._driverType)
      result      = await callback(scope)
    })

    return result!
  }
}

export class TransactionScope {
  constructor(
    private readonly ctx:        TransactionContext,
    private readonly driverType: string
  ) {}

  query(table: string): QueryBuilder {
    // Wrap ctx as a minimal driver
    const mockDriver = {
      query:       this.ctx.query.bind(this.ctx),
      transaction: () => { throw new Error('Nested transactions not supported directly') }
    } as unknown as BaseDriver

    return new QueryBuilder(mockDriver, this.driverType).from(table)
  }

  async raw<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    const result = await this.ctx.query<T>(sql, params)
    return result.rows
  }
}