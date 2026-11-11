/**
 * Collects database schema and row counts.
 * Works with SQLite, PostgreSQL, and MySQL.
 */

import type { TableInfo, ColumnInfo, ForeignKeyInfo, IndexInfo, TableSchema, RowFilter, RowQuery } from '../types.js'

/** Bad input from the client (unknown column, operator…) → HTTP 400. */
export class StudioInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StudioInputError'
  }
}

export const FILTER_OPS = ['eq', 'neq', 'contains', 'starts', 'gt', 'gte', 'lt', 'lte', 'null', 'notnull'] as const

const COMPARE: Record<string, string> = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }

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

  /** Tables plus foreign keys and indexes (for the structure view and ER diagram). */
  async collectSchema(): Promise<TableSchema[]> {
    const tables = await this.collectTables()
    const out: TableSchema[] = []
    for (const t of tables) {
      let foreignKeys: ForeignKeyInfo[] = []
      let indexes: IndexInfo[] = []
      try {
        ;[foreignKeys, indexes] = await Promise.all([this.foreignKeys(t.name), this.indexes(t.name)])
      } catch {
        // Keep the table even when constraint introspection is not permitted
      }
      // Single-column unique indexes mark the column unique (SQLite reports none otherwise)
      const uniqueCols = new Set(indexes.filter(i => i.unique && i.columns.length === 1).map(i => i.columns[0]))
      const columns = t.columns.map(c => (uniqueCols.has(c.name) && !c.primary ? { ...c, unique: true } : c))
      out.push({ ...t, columns, foreignKeys, indexes })
    }
    return out
  }

  // ─── Rows ──────────────────────────────────────────────────────────────────

  private quote(name: string): string {
    return this.driverType === 'mysql'
      ? '`' + name.replace(/`/g, '``') + '`'
      : '"' + name.replace(/"/g, '""') + '"'
  }

  private placeholder(index: number): string {
    return this.driverType === 'postgres' ? `$${index}` : '?'
  }

  /** Column expression as lower-case text, for case-insensitive LIKE. */
  private asText(ident: string): string {
    const type = this.driverType === 'mysql' ? 'CHAR' : 'TEXT'
    return `LOWER(CAST(${ident} AS ${type}))`
  }

  private async columnsOf(table: string): Promise<string[] | null> {
    const tables = await this.collectTables()
    const found = tables.find(t => t.name === table)
    return found ? found.columns.map(c => c.name) : null
  }

  /**
   * One page of rows. Table and column names are checked against the schema
   * and quoted; every value is a bound parameter.
   */
  async getTableRows(
    tableName: string,
    limitOrQuery: number | RowQuery = 50,
    offset = 0
  ): Promise<{ rows: Record<string, unknown>[]; total: number }> {
    const q: RowQuery = typeof limitOrQuery === 'number' ? { limit: limitOrQuery, offset } : limitOrQuery
    const limit = q.limit ?? 50
    const safeLimit  = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 1000) : 50
    const safeOffset = Number.isFinite(q.offset) && (q.offset ?? 0) > 0 ? Math.floor(q.offset!) : 0

    const columns = await this.columnsOf(tableName).catch(() => null)
    if (!columns) return { rows: [], total: 0 }   // unknown table (or no access)

    const known = (col: unknown, where: string): string => {
      if (typeof col !== 'string' || !columns.includes(col)) {
        throw new StudioInputError(`Unknown column ${JSON.stringify(col)} in ${where}`)
      }
      return this.quote(col)
    }

    const params: unknown[] = []
    const bind = (value: unknown): string => {
      params.push(value)
      return this.placeholder(params.length)
    }
    // LIKE with '!' as the escape character (no backslash quoting differences)
    const like = (text: string): string => text.replace(/[!%_]/g, m => '!' + m)

    const where: string[] = []

    if (q.search && q.search.trim()) {
      const needle = `%${like(q.search.trim().toLowerCase())}%`
      const ors = columns.map(c => `${this.asText(this.quote(c))} LIKE ${bind(needle)} ESCAPE '!'`)
      if (ors.length) where.push(`(${ors.join(' OR ')})`)
    }

    for (const f of q.filters ?? []) {
      if (!f || typeof f !== 'object') throw new StudioInputError('Each filter must be an object')
      const ident = known(f.column, 'filter')
      const op = String(f.op)
      if (!(FILTER_OPS as readonly string[]).includes(op)) {
        throw new StudioInputError(`Unknown filter operator ${JSON.stringify(f.op)}; use one of ${FILTER_OPS.join(', ')}`)
      }
      if (op === 'null') where.push(`${ident} IS NULL`)
      else if (op === 'notnull') where.push(`${ident} IS NOT NULL`)
      else if (op === 'contains') where.push(`${this.asText(ident)} LIKE ${bind(`%${like(String(f.value ?? '').toLowerCase())}%`)} ESCAPE '!'`)
      else if (op === 'starts') where.push(`${this.asText(ident)} LIKE ${bind(`${like(String(f.value ?? '').toLowerCase())}%`)} ESCAPE '!'`)
      else where.push(`${ident} ${COMPARE[op]} ${bind(f.value ?? null)}`)
    }

    const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : ''
    let orderSql = ''
    if (q.sort !== undefined && q.sort !== '') {
      const dir = String(q.dir ?? 'asc').toLowerCase()
      if (dir !== 'asc' && dir !== 'desc') throw new StudioInputError('dir must be asc or desc')
      orderSql = ` ORDER BY ${known(q.sort, 'sort')} ${dir.toUpperCase()}`
    }

    const table = this.quote(tableName)
    try {
      const countResult = await this.driver.query(`SELECT COUNT(*) AS cnt FROM ${table}${whereSql}`, params)
      const total = Number(countResult.rows[0]?.cnt ?? countResult.rows[0]?.count ?? 0)
      const dataResult = await this.driver.query(
        `SELECT * FROM ${table}${whereSql}${orderSql} LIMIT ${safeLimit} OFFSET ${safeOffset}`,
        params
      )
      return { rows: dataResult.rows, total }
    } catch (err: any) {
      // A filter value the database can't compare (e.g. text vs integer on Postgres)
      if (where.length) throw new StudioInputError(err.message.split('\n')[0])
      return { rows: [], total: 0 }
    }
  }

  // ─── Foreign keys & indexes ────────────────────────────────────────────────

  private async foreignKeys(table: string): Promise<ForeignKeyInfo[]> {
    if (this.driverType === 'sqlite') {
      const r = await this.driver.query(`PRAGMA foreign_key_list(${this.quote(table)})`)
      return r.rows.map((fk: any) => ({ column: fk.from, refTable: fk.table, refColumn: fk.to ?? 'rowid' }))
    }
    if (this.driverType === 'postgres') {
      const r = await this.driver.query(`
        SELECT kcu.column_name AS column, ccu.table_name AS ref_table, ccu.column_name AS ref_column
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
        JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = $1 AND tc.table_schema = 'public'
      `, [table])
      return r.rows.map((fk: any) => ({ column: fk.column, refTable: fk.ref_table, refColumn: fk.ref_column }))
    }
    if (this.driverType === 'mysql') {
      const r = await this.driver.query(`
        SELECT COLUMN_NAME AS col, REFERENCED_TABLE_NAME AS ref_table, REFERENCED_COLUMN_NAME AS ref_column
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND REFERENCED_TABLE_NAME IS NOT NULL
      `, [table])
      return r.rows.map((fk: any) => ({ column: fk.col, refTable: fk.ref_table, refColumn: fk.ref_column }))
    }
    return []
  }

  private async indexes(table: string): Promise<IndexInfo[]> {
    if (this.driverType === 'sqlite') {
      const list = await this.driver.query(`PRAGMA index_list(${this.quote(table)})`)
      const out: IndexInfo[] = []
      for (const idx of list.rows) {
        const info = await this.driver.query(`PRAGMA index_info(${this.quote(String(idx.name))})`)
        out.push({ name: String(idx.name), unique: Number(idx.unique) === 1, columns: info.rows.map((c: any) => c.name) })
      }
      return out
    }
    const grouped = (rows: any[], name: string, unique: (r: any) => boolean, column: string): IndexInfo[] => {
      const map = new Map<string, IndexInfo>()
      for (const r of rows) {
        const key = String(r[name])
        if (!map.has(key)) map.set(key, { name: key, unique: unique(r), columns: [] })
        map.get(key)!.columns.push(String(r[column]))
      }
      return [...map.values()]
    }
    if (this.driverType === 'postgres') {
      const r = await this.driver.query(`
        SELECT i.relname AS name, ix.indisunique AS is_unique, a.attname AS column
        FROM pg_class t
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN pg_index ix ON t.oid = ix.indrelid
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
        WHERE t.relname = $1 AND n.nspname = 'public'
        ORDER BY i.relname
      `, [table])
      return grouped(r.rows, 'name', x => Boolean(x.is_unique), 'column')
    }
    if (this.driverType === 'mysql') {
      const r = await this.driver.query(`
        SELECT INDEX_NAME AS name, NON_UNIQUE AS non_unique, COLUMN_NAME AS col
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
        ORDER BY INDEX_NAME, SEQ_IN_INDEX
      `, [table])
      return grouped(r.rows, 'name', x => Number(x.non_unique) === 0, 'col')
    }
    return []
  }

  // ─── Per-driver table lists ────────────────────────────────────────────────

  private async collectSQLite(): Promise<TableInfo[]> {
    const result = await this.driver.query(
      `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE '_migrations' AND name NOT LIKE 'sqlite_%' ORDER BY name`
    )

    const tables: TableInfo[] = []

    for (const row of result.rows) {
      const name = String(row.name)
      const columns = await this.getSQLiteColumns(name)
      const countRes = await this.driver.query(
        `SELECT COUNT(*) AS cnt FROM ${this.quote(name)}`
      )
      const rowCount = Number(countRes.rows[0]?.cnt ?? 0)
      tables.push({ name, columns, rowCount })
    }

    return tables
  }

  private async getSQLiteColumns(table: string): Promise<ColumnInfo[]> {
    const result = await this.driver.query(`PRAGMA table_info(${this.quote(table)})`)
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
        `SELECT COUNT(*) AS cnt FROM ${this.quote(name)}`
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
        `SELECT COUNT(*) AS cnt FROM ${this.quote(name)}`
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
