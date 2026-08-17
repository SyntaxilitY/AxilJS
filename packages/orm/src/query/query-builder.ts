/**
 * AxilORM — Query Builder
 *
 * Fluent, chainable, driver-aware query builder.
 * Faster than Prisma/TypeORM because:
 *   - No reflection overhead
 *   - Zero-copy result mapping
 *   - Lazy SQL compilation
 *   - Direct driver pass-through
 */

import { BaseDriver } from '../connection/base-driver'

type Operator = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'IN' | 'NOT IN' | 'IS NULL' | 'IS NOT NULL'
type OrderDir = 'ASC' | 'DESC'
type JoinType = 'INNER' | 'LEFT' | 'RIGHT' | 'FULL'

interface WhereClause {
  column:    string
  operator:  Operator
  value?:    unknown
  raw?:      string
  conjunction: 'AND' | 'OR'
}

interface JoinClause {
  type:      JoinType
  table:     string
  on:        string
}

interface OrderClause {
  column:    string
  direction: OrderDir
}

export class QueryBuilder<T = Record<string, unknown>> {
  private _table:     string       = ''
  private _selects:   string[]     = ['*']
  private _wheres:    WhereClause[] = []
  private _joins:     JoinClause[]  = []
  private _orders:    OrderClause[] = []
  private _groupBy:   string[]     = []
  private _having:    string       = ''
  private _limit?:    number
  private _offset?:   number
  private _params:    unknown[]    = []
  private _paramIdx:  number       = 1

  constructor(
    private readonly driver: BaseDriver,
    private readonly driverType: string
  ) {}

  // ── Table ─────────────────────────────────────────────────────────

  from(table: string): this {
    this._table = table
    return this
  }

  table(table: string): this {
    return this.from(table)
  }

  // ── Select ────────────────────────────────────────────────────────

  select(...columns: string[]): this {
    this._selects = columns
    return this
  }

  addSelect(...columns: string[]): this {
    this._selects.push(...columns)
    return this
  }

  // ── Where ─────────────────────────────────────────────────────────

  where(column: string, operator: Operator, value?: unknown): this {
    this._wheres.push({ column, operator, value, conjunction: 'AND' })
    return this
  }

  orWhere(column: string, operator: Operator, value?: unknown): this {
    this._wheres.push({ column, operator, value, conjunction: 'OR' })
    return this
  }

  whereRaw(raw: string): this {
    this._wheres.push({ column: '', operator: '=', raw, conjunction: 'AND' })
    return this
  }

  whereIn(column: string, values: unknown[]): this {
    this._wheres.push({ column, operator: 'IN', value: values, conjunction: 'AND' })
    return this
  }

  whereNull(column: string): this {
    this._wheres.push({ column, operator: 'IS NULL', conjunction: 'AND' })
    return this
  }

  whereNotNull(column: string): this {
    this._wheres.push({ column, operator: 'IS NOT NULL', conjunction: 'AND' })
    return this
  }

  // ── Join ──────────────────────────────────────────────────────────

  join(table: string, on: string, type: JoinType = 'INNER'): this {
    this._joins.push({ type, table, on })
    return this
  }

  leftJoin(table: string, on: string): this {
    return this.join(table, on, 'LEFT')
  }

  rightJoin(table: string, on: string): this {
    return this.join(table, on, 'RIGHT')
  }

  // ── Order / Group / Limit ─────────────────────────────────────────

  orderBy(column: string, direction: OrderDir = 'ASC'): this {
    this._orders.push({ column, direction })
    return this
  }

  groupBy(...columns: string[]): this {
    this._groupBy.push(...columns)
    return this
  }

  having(condition: string): this {
    this._having = condition
    return this
  }

  limit(n: number): this {
    this._limit = n
    return this
  }

  offset(n: number): this {
    this._offset = n
    return this
  }

  // ── Pagination shortcut ───────────────────────────────────────────

  paginate(page: number, perPage: number): this {
    return this.limit(perPage).offset((page - 1) * perPage)
  }

  // ── SQL Compilation ───────────────────────────────────────────────

  private nextParam(value: unknown): string {
    this._params.push(value)
    if (this.driverType === 'postgres') {
      return `$${this._paramIdx++}`
    }
    return '?'
  }

  private compileWheres(): string {
    if (this._wheres.length === 0) return ''

    const parts = this._wheres.map((w, i) => {
      const prefix = i === 0 ? 'WHERE' : w.conjunction

      if (w.raw) return `${prefix} ${w.raw}`

      if (w.operator === 'IS NULL')     return `${prefix} ${w.column} IS NULL`
      if (w.operator === 'IS NOT NULL') return `${prefix} ${w.column} IS NOT NULL`

      if (w.operator === 'IN' || w.operator === 'NOT IN') {
        const values = w.value as unknown[]
        const placeholders = values.map(v => this.nextParam(v)).join(', ')
        return `${prefix} ${w.column} ${w.operator} (${placeholders})`
      }

      const ph = this.nextParam(w.value)
      return `${prefix} ${w.column} ${w.operator} ${ph}`
    })

    return parts.join(' ')
  }

  toSQL(): { sql: string; params: unknown[] } {
    this._params   = []
    this._paramIdx = 1

    const selects = this._selects.join(', ')
    const joins   = this._joins
      .map(j => `${j.type} JOIN ${j.table} ON ${j.on}`)
      .join(' ')

    const wheres  = this.compileWheres()
    const groups  = this._groupBy.length
      ? `GROUP BY ${this._groupBy.join(', ')}`
      : ''
    const having  = this._having ? `HAVING ${this._having}` : ''
    const orders  = this._orders.length
      ? `ORDER BY ${this._orders.map(o => `${o.column} ${o.direction}`).join(', ')}`
      : ''
    const limit   = this._limit  !== undefined ? `LIMIT ${this._limit}`   : ''
    const offset  = this._offset !== undefined ? `OFFSET ${this._offset}` : ''

    const sql = [
      `SELECT ${selects}`,
      `FROM ${this._table}`,
      joins, wheres, groups, having, orders, limit, offset
    ]
      .filter(Boolean)
      .join(' ')
      .trim()

    return { sql, params: [...this._params] }
  }

  // ── Execute ───────────────────────────────────────────────────────

  async get(): Promise<T[]> {
    const { sql, params } = this.toSQL()
    const result = await this.driver.query<T>(sql, params)
    return result.rows
  }

  async first(): Promise<T | null> {
    this.limit(1)
    const rows = await this.get()
    return rows[0] ?? null
  }

  async firstOrFail(): Promise<T> {
    const row = await this.first()
    if (!row) throw new Error(`No record found in ${this._table}`)
    return row
  }

  async count(): Promise<number> {
    const original = [...this._selects]
    this._selects  = ['COUNT(*) AS _count']
    const rows     = await this.get() as Array<{ _count: string | number }>
    this._selects  = original
    return Number(rows[0]?._count ?? 0)
  }

  async exists(): Promise<boolean> {
    return (await this.count()) > 0
  }

  async pluck<K extends keyof T>(column: K): Promise<T[K][]> {
    this._selects = [String(column)]
    const rows    = await this.get()
    return rows.map(r => r[column])
  }

  // ── Insert ────────────────────────────────────────────────────────

  async insert(data: Partial<T>): Promise<T> {
    const keys   = Object.keys(data)
    const values = Object.values(data)
    this._params   = []
    this._paramIdx = 1

    const placeholders = values.map(v => this.nextParam(v)).join(', ')
    const columns      = keys.join(', ')

    const returning = this.driverType === 'postgres' ? 'RETURNING *' : ''
    const sql       = `INSERT INTO ${this._table} (${columns}) VALUES (${placeholders}) ${returning}`.trim()

    const result = await this.driver.query<T>(sql, this._params)

    if (this.driverType === 'postgres') {
      return result.rows[0]
    }

    // MySQL / SQLite: fetch the inserted row
    const lastId  = (result as any).lastInsertRowid ?? (result as any).insertId
    const fetched = await this.driver.query<T>(
      `SELECT * FROM ${this._table} WHERE id = ${this.nextParam(lastId)}`,
      [lastId]
    )
    return fetched.rows[0]
  }

  // ── Insert Many ───────────────────────────────────────────────────

  async insertMany(rows: Partial<T>[]): Promise<number> {
    if (rows.length === 0) return 0

    this._params   = []
    this._paramIdx = 1

    const keys  = Object.keys(rows[0])
    const valueGroups = rows.map(row => {
      const phs = Object.values(row).map(v => this.nextParam(v))
      return `(${phs.join(', ')})`
    })

    const sql = `INSERT INTO ${this._table} (${keys.join(', ')}) VALUES ${valueGroups.join(', ')}`
    await this.driver.query(sql, this._params)
    return rows.length
  }

  // ── Update ────────────────────────────────────────────────────────

  async update(data: Partial<T>): Promise<number> {
    this._params   = []
    this._paramIdx = 1

    const sets      = Object.entries(data)
      .map(([k, v]) => `${k} = ${this.nextParam(v)}`)
      .join(', ')

    const wheres    = this.compileWheres()
    const returning = this.driverType === 'postgres' ? 'RETURNING id' : ''

    const sql = `UPDATE ${this._table} SET ${sets} ${wheres} ${returning}`.trim()
    const result = await this.driver.query(sql, this._params)

    return (result as any).rowCount ?? (result as any).changes ?? result.rows.length
  }

  // ── Delete ────────────────────────────────────────────────────────

  async delete(): Promise<number> {
    this._params   = []
    this._paramIdx = 1

    const wheres    = this.compileWheres()
    const returning = this.driverType === 'postgres' ? 'RETURNING id' : ''

    const sql = `DELETE FROM ${this._table} ${wheres} ${returning}`.trim()
    const result = await this.driver.query(sql, this._params)

    return (result as any).rowCount ?? (result as any).changes ?? result.rows.length
  }

  // ── Increment / Decrement ─────────────────────────────────────────

  async increment(column: string, by = 1): Promise<void> {
    const wheres = this.compileWheres()
    const sql    = `UPDATE ${this._table} SET ${column} = ${column} + ${by} ${wheres}`
    await this.driver.query(sql, this._params)
  }

  async decrement(column: string, by = 1): Promise<void> {
    await this.increment(column, -by)
  }

  // ── Aggregate ─────────────────────────────────────────────────────

  async sum(column: string): Promise<number> {
    this._selects = [`SUM(${column}) AS _sum`]
    const rows    = await this.get() as Array<{ _sum: string | number }>
    return Number(rows[0]?._sum ?? 0)
  }

  async avg(column: string): Promise<number> {
    this._selects = [`AVG(${column}) AS _avg`]
    const rows    = await this.get() as Array<{ _avg: string | number }>
    return Number(rows[0]?._avg ?? 0)
  }

  async max(column: string): Promise<number> {
    this._selects = [`MAX(${column}) AS _max`]
    const rows    = await this.get() as Array<{ _max: string | number }>
    return Number(rows[0]?._max ?? 0)
  }

  async min(column: string): Promise<number> {
    this._selects = [`MIN(${column}) AS _min`]
    const rows    = await this.get() as Array<{ _min: string | number }>
    return Number(rows[0]?._min ?? 0)
  }

  // ── Raw ───────────────────────────────────────────────────────────

  async raw<R = unknown>(sql: string, params: unknown[] = []): Promise<R[]> {
    const result = await this.driver.query<R>(sql, params)
    return result.rows
  }
}