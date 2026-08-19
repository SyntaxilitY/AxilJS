/**
 * Collects database schema and row counts.
 * Works with SQLite, PostgreSQL, and MySQL.
 */

import type { TableInfo, ColumnInfo } from '../types.js'

export class DbCollector {
  constructor(
    public readonly driver: any,
    private readonly driverType: string
  ) {}

  async collectTables(): Promise<TableInfo[]> {
    try {
      switch (this.driverType) {
        case 'sqlite':   return await this.collectSQLite()
        case 'postgres': return await this.collectPostgres()
        case 'mysql':    return await this.collectMySQL()
        default:         return []
      }
    } catch {
      return []
    }
  }

  async getTableRows(
    tableName: string,
    limit  = 50,
    offset = 0
  ): Promise<{ rows: Record<string, unknown>[]; total: number }> {
    try {
      const p = this.driverType === 'postgres'

      const countResult = await this.driver.query(
        `SELECT COUNT(*) AS cnt FROM "${tableName}"`
      )
      const total = Number(
        countResult.rows[0]?.cnt ?? countResult.rows[0]?.count ?? 0
      )

      const dataResult = await this.driver.query(
        `SELECT * FROM "${tableName}" LIMIT ${limit} OFFSET ${offset}`
      )

      return { rows: dataResult.rows, total }
    } catch {
      return { rows: [], total: 0 }
    }
  }

  private async collectSQLite(): Promise<TableInfo[]> {
    const result = await this.driver.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_migrations' ORDER BY name`
    )

    const tables: TableInfo[] = []

    for (const row of result.rows) {
      const name = String(row.name)
      const columns = await this.getSQLiteColumns(name)
      const countRes = await this.driver.query(
        `SELECT COUNT(*) AS cnt FROM "${name}"`
      )
      const rowCount = Number(countRes.rows[0]?.cnt ?? 0)
      tables.push({ name, columns, rowCount })
    }

    return tables
  }

  private async getSQLiteColumns(table: string): Promise<ColumnInfo[]> {
    const result = await this.driver.query(`PRAGMA table_info("${table}")`)
    return result.rows.map((col: any) => ({
      name:     col.name,
      type:     col.type,
      nullable: col.notnull === 0,
      primary:  col.pk > 0,
      unique:   false,
      default:  col.dflt_value
    }))
  }

  private async collectPostgres(): Promise<TableInfo[]> {
    const result = await this.driver.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name != '_migrations'
      ORDER BY table_name
    `)

    const tables: TableInfo[] = []

    for (const row of result.rows) {
      const name    = String(row.table_name)
      const columns = await this.getPostgresColumns(name)
      const countRes = await this.driver.query(
        `SELECT COUNT(*) AS cnt FROM "${name}"`
      )
      const rowCount = Number(countRes.rows[0]?.cnt ?? 0)
      tables.push({ name, columns, rowCount })
    }

    return tables
  }

  private async getPostgresColumns(table: string): Promise<ColumnInfo[]> {
    const result = await this.driver.query(`
      SELECT
        c.column_name                              AS name,
        c.data_type                                AS type,
        c.is_nullable = 'YES'                      AS nullable,
        c.column_default                           AS default_val,
        COALESCE(pk.is_pk, false)                  AS primary,
        COALESCE(uq.is_uq, false)                  AS unique
      FROM information_schema.columns c
      LEFT JOIN (
        SELECT ku.column_name, true AS is_pk
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage ku
          ON tc.constraint_name = ku.constraint_name
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_name = $1
      ) pk ON pk.column_name = c.column_name
      LEFT JOIN (
        SELECT ku.column_name, true AS is_uq
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage ku
          ON tc.constraint_name = ku.constraint_name
        WHERE tc.constraint_type = 'UNIQUE'
          AND tc.table_name = $1
      ) uq ON uq.column_name = c.column_name
      WHERE c.table_name = $1
        AND c.table_schema = 'public'
      ORDER BY c.ordinal_position
    `, [table])

    return result.rows.map((col: any) => ({
      name:     col.name,
      type:     col.type,
      nullable: Boolean(col.nullable),
      primary:  Boolean(col.primary),
      unique:   Boolean(col.unique),
      default:  col.default_val
    }))
  }

  private async collectMySQL(): Promise<TableInfo[]> {
    const dbResult = await this.driver.query(`SELECT DATABASE() AS db`)
    const dbName   = dbResult.rows[0]?.db

    const result = await this.driver.query(`
      SELECT TABLE_NAME AS name
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME != '_migrations'
      ORDER BY TABLE_NAME
    `, [dbName])

    const tables: TableInfo[] = []

    for (const row of result.rows) {
      const name     = String(row.name)
      const columns  = await this.getMySQLColumns(name, dbName)
      const countRes = await this.driver.query(
        `SELECT COUNT(*) AS cnt FROM \`${name}\``
      )
      const rowCount = Number(countRes.rows[0]?.cnt ?? 0)
      tables.push({ name, columns, rowCount })
    }

    return tables
  }

  private async getMySQLColumns(table: string, db: string): Promise<ColumnInfo[]> {
    const result = await this.driver.query(`
      SELECT
        COLUMN_NAME   AS name,
        DATA_TYPE     AS type,
        IS_NULLABLE   AS nullable,
        COLUMN_DEFAULT AS default_val,
        COLUMN_KEY    AS col_key
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME   = ?
      ORDER BY ORDINAL_POSITION
    `, [db, table])

    return result.rows.map((col: any) => ({
      name:     col.name,
      type:     col.type,
      nullable: col.nullable === 'YES',
      primary:  col.col_key === 'PRI',
      unique:   col.col_key === 'UNI',
      default:  col.default_val
    }))
  }
}