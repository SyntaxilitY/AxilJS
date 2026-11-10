/**
 * AxilORM — View Manager
 *
 * Create and query database views.
 *
 * Usage:
 *   await ViewManager.create('active_users', `
 *     SELECT * FROM users WHERE is_active = true
 *   `, db, true, 'sqlite')
 *
 *   const users = await ViewManager.query('active_users', driver, driverType)
 *
 * Dialects (pass `driverType`, or a driver created by createConnection so it
 * can be detected):
 *   postgres / mysql  replace → CREATE OR REPLACE VIEW
 *                     !replace → CREATE VIEW, skipped when the view already exists
 *   sqlite            replace → DROP VIEW IF EXISTS + CREATE VIEW
 *                     !replace → CREATE VIEW IF NOT EXISTS
 *   unknown           CREATE OR REPLACE VIEW / CREATE VIEW IF NOT EXISTS (previous behaviour)
 */

import { BaseDriver }         from '../connection/base-driver'
import { TransactionContext } from '../connection/base-driver'
import { QueryBuilder }       from '../query/query-builder'

export class ViewManager {
  static async create(
    name:    string,
    selectSQL: string,
    db:      TransactionContext,
    replace = true,
    driverType?: string
  ): Promise<void> {
    const dialect = driverType ?? ViewManager.detectDialect(db)

    if (dialect === 'sqlite') {
      // SQLite has no CREATE OR REPLACE VIEW
      if (replace) {
        await db.query(`DROP VIEW IF EXISTS ${name}`)
        await db.query(`CREATE VIEW ${name} AS ${selectSQL}`)
      } else {
        await db.query(`CREATE VIEW IF NOT EXISTS ${name} AS ${selectSQL}`)
      }
      return
    }

    if (dialect === 'postgres' || dialect === 'mysql') {
      if (replace) {
        await db.query(`CREATE OR REPLACE VIEW ${name} AS ${selectSQL}`)
        return
      }
      // Neither dialect supports CREATE VIEW IF NOT EXISTS
      if (await ViewManager.exists(name, db, dialect)) return
      await db.query(`CREATE VIEW ${name} AS ${selectSQL}`)
      return
    }

    const keyword = replace ? 'CREATE OR REPLACE VIEW' : 'CREATE VIEW IF NOT EXISTS'
    await db.query(`${keyword} ${name} AS ${selectSQL}`)
  }

  static async drop(name: string, db: TransactionContext): Promise<void> {
    await db.query(`DROP VIEW IF EXISTS ${name}`)
  }

  /** True when a view called `name` exists (postgres: current schema, mysql: current database). */
  static async exists(
    name:       string,
    db:         TransactionContext,
    driverType?: string
  ): Promise<boolean> {
    const dialect = driverType ?? ViewManager.detectDialect(db)
    const result = dialect === 'postgres'
      ? await db.query(
          `SELECT 1 FROM information_schema.views WHERE table_name = $1 AND table_schema = current_schema()`,
          [name]
        )
      : dialect === 'mysql'
        ? await db.query(
            `SELECT 1 FROM information_schema.views WHERE table_name = ? AND table_schema = DATABASE()`,
            [name]
          )
        : await db.query(`SELECT 1 FROM sqlite_master WHERE type = 'view' AND name = ?`, [name])
    return result.rows.length > 0
  }

  static query<T = Record<string, unknown>>(
    name:       string,
    driver:     BaseDriver,
    driverType: string
  ): QueryBuilder<T> {
    return new QueryBuilder<T>(driver, driverType).from(name)
  }

  // Drivers keep their ConnectionConfig — read the dialect from it when present
  private static detectDialect(db: TransactionContext): string | undefined {
    const driver = (db as unknown as { config?: { driver?: unknown } }).config?.driver
    return typeof driver === 'string' ? driver : undefined
  }
}
