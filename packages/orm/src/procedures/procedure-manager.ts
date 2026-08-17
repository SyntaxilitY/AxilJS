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

import { BaseDriver } from '../connection/base-driver'

export class ProcedureManager {
  /**
   * Call a stored procedure.
   * PostgreSQL: SELECT * FROM procedure_name($1, $2)
   * MySQL:      CALL procedure_name(?, ?)
   */
  static async call<T = unknown>(
    name:       string,
    params:     unknown[],
    driver:     BaseDriver,
    driverType: string
  ): Promise<T[]> {
    let sql: string

    if (driverType === 'postgres') {
      const placeholders = params.map((_, i) => `$${i + 1}`).join(', ')
      sql = `SELECT * FROM ${name}(${placeholders})`
    } else {
      const placeholders = params.map(() => '?').join(', ')
      sql = `CALL ${name}(${placeholders})`
    }

    const result = await driver.query<T>(sql, params)
    return result.rows
  }

  /**
   * Call a scalar function — returns a single value.
   */
  static async scalar<T = unknown>(
    name:       string,
    params:     unknown[],
    driver:     BaseDriver,
    driverType: string
  ): Promise<T | null> {
    const rows = await this.call<Record<string, T>>(name, params, driver, driverType)
    if (rows.length === 0) return null
    const first = rows[0]
    return Object.values(first)[0] ?? null
  }

  /**
   * Execute a raw stored procedure (no return).
   */
  static async execute(
    name:       string,
    params:     unknown[],
    driver:     BaseDriver,
    driverType: string
  ): Promise<void> {
    await this.call(name, params, driver, driverType)
  }
}