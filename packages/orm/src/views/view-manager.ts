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

import { BaseDriver }         from '../connection/base-driver'
import { TransactionContext } from '../connection/base-driver'
import { QueryBuilder }       from '../query/query-builder'

export class ViewManager {
  static async create(
    name:    string,
    selectSQL: string,
    db:      TransactionContext,
    replace = true
  ): Promise<void> {
    const keyword = replace ? 'CREATE OR REPLACE VIEW' : 'CREATE VIEW IF NOT EXISTS'
    await db.query(`${keyword} ${name} AS ${selectSQL}`)
  }

  static async drop(name: string, db: TransactionContext): Promise<void> {
    await db.query(`DROP VIEW IF EXISTS ${name}`)
  }

  static query<T = Record<string, unknown>>(
    name:       string,
    driver:     BaseDriver,
    driverType: string
  ): QueryBuilder<T> {
    return new QueryBuilder<T>(driver, driverType).from(name)
  }
}