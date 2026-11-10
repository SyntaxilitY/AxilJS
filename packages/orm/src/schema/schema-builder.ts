/**
 * AxilORM — Schema Builder
 *
 * Fluent API for building CREATE TABLE statements inside migrations.
 *
 * Usage:
 *   import { Schema } from '@axiljs/orm'
 *
 *   export async function up(db: TransactionContext) {
 *     await Schema.create('users', (table) => {
 *       table.id()
 *       table.string('name', 255)
 *       table.string('email', 255).unique()
 *       table.boolean('is_active').default(true)
 *       table.timestamps()
 *     }, db, 'postgres')
 *   }
 *
 *   export async function down(db: TransactionContext) {
 *     await Schema.drop('users', db)
 *   }
 */

import { TransactionContext } from '../connection/base-driver'

type DriverType = 'postgres' | 'mysql' | 'sqlite'

interface ColumnDef {
  name:      string
  type:      string
  notNull:   boolean
  unique:    boolean
  defaultVal?: string
  extra?:    string
}

export class TableBuilder {
  private columns:  ColumnDef[] = []
  private indexes:  string[]    = []

  constructor(
    private readonly tableName: string,
    private readonly driver:    DriverType
  ) {}

  // ── Primary Key shortcut ──────────────────────────────────────────

  id(): this {
    const type = this.driver === 'postgres'
      ? 'SERIAL PRIMARY KEY'
      : this.driver === 'mysql'
        ? 'INTEGER AUTO_INCREMENT PRIMARY KEY'
        : 'INTEGER PRIMARY KEY AUTOINCREMENT'

    this.columns.push({ name: 'id', type, notNull: false, unique: false })
    return this
  }

  uuid(name = 'id'): this {
    const type = this.driver === 'postgres'
      ? 'UUID DEFAULT gen_random_uuid() PRIMARY KEY'
      : 'VARCHAR(36) PRIMARY KEY'

    this.columns.push({ name, type, notNull: false, unique: false })
    return this
  }

  // ── Column types ──────────────────────────────────────────────────

  string(name: string, length = 255): ColumnBuilder {
    return this._col(name, `VARCHAR(${length})`)
  }

  text(name: string): ColumnBuilder {
    return this._col(name, 'TEXT')
  }

  integer(name: string): ColumnBuilder {
    return this._col(name, 'INTEGER')
  }

  bigint(name: string): ColumnBuilder {
    return this._col(name, 'BIGINT')
  }

  float(name: string): ColumnBuilder {
    return this._col(name, 'FLOAT')
  }

  decimal(name: string, precision = 10, scale = 2): ColumnBuilder {
    return this._col(name, `DECIMAL(${precision},${scale})`)
  }

  boolean(name: string): ColumnBuilder {
    const type = this.driver === 'sqlite' ? 'INTEGER' : 'BOOLEAN'
    return this._col(name, type)
  }

  date(name: string): ColumnBuilder {
    return this._col(name, 'DATE')
  }

  datetime(name: string): ColumnBuilder {
    const type = this.driver === 'mysql' ? 'DATETIME' : 'TIMESTAMP'
    return this._col(name, type)
  }

  timestamp(name: string): ColumnBuilder {
    return this._col(name, 'TIMESTAMP')
  }

  json(name: string): ColumnBuilder {
    const type = this.driver === 'sqlite' ? 'TEXT' : 'JSON'
    return this._col(name, type)
  }

  // ── Foreign Key ───────────────────────────────────────────────────

  foreignKey(name: string, refTable: string, refCol = 'id'): this {
    this.columns.push({
      name,
      type:    'INTEGER',
      notNull: false,
      unique:  false,
      extra:   `REFERENCES ${refTable}(${refCol}) ON DELETE CASCADE`
    })
    return this
  }

  // ── Timestamps shortcut ───────────────────────────────────────────

  timestamps(): this {
    this._col('created_at', 'TIMESTAMP').default('CURRENT_TIMESTAMP')
    this._col('updated_at', 'TIMESTAMP').nullable()
    return this
  }

  softDeletes(): this {
    this._col('deleted_at', 'TIMESTAMP').nullable()
    return this
  }

  // ── Index ─────────────────────────────────────────────────────────

  index(columns: string[], name?: string): this {
    const idxName = name ?? `idx_${this.tableName}_${columns.join('_')}`
    this.indexes.push(`CREATE INDEX IF NOT EXISTS ${idxName} ON ${this.tableName} (${columns.join(', ')})`)
    return this
  }

  uniqueIndex(columns: string[], name?: string): this {
    const idxName = name ?? `uidx_${this.tableName}_${columns.join('_')}`
    this.indexes.push(`CREATE UNIQUE INDEX IF NOT EXISTS ${idxName} ON ${this.tableName} (${columns.join(', ')})`)
    return this
  }

  // ── Build ─────────────────────────────────────────────────────────

  toSQL(): string[] {
    const cols = this.columns.map(c => {
      const parts = [c.name, c.type]
      if (c.notNull) parts.push('NOT NULL')
      if (c.unique)  parts.push('UNIQUE')
      if (c.defaultVal !== undefined) parts.push(`DEFAULT ${c.defaultVal}`)
      if (c.extra)   parts.push(c.extra)
      return '  ' + parts.join(' ')
    })

    const createSQL = [
      `CREATE TABLE IF NOT EXISTS ${this.tableName} (`,
      cols.join(',\n'),
      `)`
    ].join('\n')

    return [createSQL, ...this.indexes]
  }

  // ── Internal ──────────────────────────────────────────────────────

  private _col(name: string, type: string): ColumnBuilder {
    const def: ColumnDef = { name, type, notNull: true, unique: false }
    this.columns.push(def)
    return new ColumnBuilder(def)
  }
}

class ColumnBuilder {
  constructor(private readonly def: ColumnDef) {}

  nullable(): this {
    this.def.notNull = false
    return this
  }

  unique(): this {
    this.def.unique = true
    return this
  }

  default(value: string | number | boolean): this {
    // SQL keywords / functions (e.g. timestamps()' CURRENT_TIMESTAMP) must not be
    // quoted, otherwise they become string literals ('CURRENT_TIMESTAMP')
    const SQL_KEYWORDS = /^(CURRENT_TIMESTAMP|CURRENT_DATE|CURRENT_TIME|LOCALTIMESTAMP|LOCALTIME|NULL|NOW\(\))$/i
    this.def.defaultVal = typeof value === 'string'
      ? (SQL_KEYWORDS.test(value.trim()) ? value.trim() : `'${value.replace(/'/g, "''")}'`)
      : String(value)
    return this
  }
}

// ── Schema static API ─────────────────────────────────────────────────────

export class Schema {
  static async create(
    table:    string,
    callback: (t: TableBuilder) => void,
    db:       TransactionContext,
    driver:   DriverType = 'postgres'
  ): Promise<void> {
    const builder = new TableBuilder(table, driver)
    callback(builder)

    for (const sql of builder.toSQL()) {
      await db.query(sql)
    }
  }

  static async drop(table: string, db: TransactionContext): Promise<void> {
    await db.query(`DROP TABLE IF EXISTS ${table}`)
  }

  static async dropIfExists(table: string, db: TransactionContext): Promise<void> {
    await db.query(`DROP TABLE IF EXISTS ${table}`)
  }

  static async rename(
    from: string,
    to: string,
    db: TransactionContext
  ): Promise<void> {
    await db.query(`ALTER TABLE ${from} RENAME TO ${to}`)
  }

  static async addColumn(
    table:    string,
    name:     string,
    type:     string,
    db:       TransactionContext
  ): Promise<void> {
    await db.query(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`)
  }

  static async dropColumn(
    table:  string,
    name:   string,
    db:     TransactionContext
  ): Promise<void> {
    await db.query(`ALTER TABLE ${table} DROP COLUMN ${name}`)
  }
}