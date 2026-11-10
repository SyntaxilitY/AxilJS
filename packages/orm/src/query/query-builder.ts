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
import { assertSafeIdentifier, assertSortDirection, assertWhereOperator } from './identifier'
import { eagerLoad } from '../relations/eager-loader'

type Operator = '=' | '!=' | '<>' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'NOT LIKE' | 'ILIKE' | 'IN' | 'NOT IN' | 'IS NULL' | 'IS NOT NULL'
type OrderDir = 'ASC' | 'DESC'
type JoinType = 'INNER' | 'LEFT' | 'RIGHT' | 'FULL'
type TrashedMode = 'exclude' | 'include' | 'only'

interface WhereClause {
  column:    string
  operator:  Operator | 'BETWEEN' | 'NOT BETWEEN'
  value?:    unknown
  raw?:      string
  group?:    WhereClause[]
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
  // Soft deletes (enabled by BaseModel for @DeletedAt entities)
  private _softDeleteColumn?: string
  private _trashed:   TrashedMode  = 'exclude'
  // Eager loading (needs the model class the rows belong to)
  private _model?:    Function
  private _with:      string[]     = []

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

  /**
   * `where('age', '>', 18)` — or a group:
   * `where(q => q.where('a', '=', 1).orWhere('b', '=', 2))` → `WHERE (a = ? OR b = ?)`
   */
  where(callback: (qb: QueryBuilder<T>) => unknown): this
  where(column: string, operator: Operator, value?: unknown): this
  where(
    column:    string | ((qb: QueryBuilder<T>) => unknown),
    operator?: Operator,
    value?:    unknown
  ): this {
    return this._addWhere('AND', column, operator, value)
  }

  orWhere(callback: (qb: QueryBuilder<T>) => unknown): this
  orWhere(column: string, operator: Operator, value?: unknown): this
  orWhere(
    column:    string | ((qb: QueryBuilder<T>) => unknown),
    operator?: Operator,
    value?:    unknown
  ): this {
    return this._addWhere('OR', column, operator, value)
  }

  whereRaw(raw: string): this {
    this._wheres.push({ column: '', operator: '=', raw, conjunction: 'AND' })
    return this
  }

  whereIn(column: string, values: unknown[]): this {
    return this._push('AND', column, 'IN', values)
  }

  whereNotIn(column: string, values: unknown[]): this {
    return this._push('AND', column, 'NOT IN', values)
  }

  whereNull(column: string): this {
    return this._push('AND', column, 'IS NULL')
  }

  whereNotNull(column: string): this {
    return this._push('AND', column, 'IS NOT NULL')
  }

  whereBetween(column: string, min: unknown, max: unknown): this {
    return this._push('AND', column, 'BETWEEN', [min, max])
  }

  whereNotBetween(column: string, min: unknown, max: unknown): this {
    return this._push('AND', column, 'NOT BETWEEN', [min, max])
  }

  whereLike(column: string, pattern: string): this {
    return this._push('AND', column, 'LIKE', pattern)
  }

  private _addWhere(
    conjunction: 'AND' | 'OR',
    column:      string | ((qb: QueryBuilder<T>) => unknown),
    operator?:   Operator,
    value?:      unknown
  ): this {
    if (typeof column === 'function') {
      const nested = new QueryBuilder<T>(this.driver, this.driverType)
      column(nested)
      this._wheres.push({ column: '', operator: '=', group: nested._wheres, conjunction })
      return this
    }
    return this._push(conjunction, column, assertWhereOperator(operator) as WhereClause['operator'], value)
  }

  private _push(
    conjunction: 'AND' | 'OR',
    column:      string,
    operator:    WhereClause['operator'],
    value?:      unknown
  ): this {
    assertSafeIdentifier(column, 'column')
    this._wheres.push({ column, operator, value, conjunction })
    return this
  }

  // ── Soft deletes ──────────────────────────────────────────────────

  /** Scope this query to a soft-delete column (set automatically for @DeletedAt models). */
  useSoftDeletes(column = 'deleted_at'): this {
    this._softDeleteColumn = assertSafeIdentifier(column, 'soft-delete column')
    return this
  }

  /** Include soft-deleted rows. */
  withTrashed(): this {
    this._trashed = 'include'
    return this
  }

  /** Only soft-deleted rows. */
  onlyTrashed(): this {
    this._trashed = 'only'
    return this
  }

  // ── Eager loading ─────────────────────────────────────────────────

  /** Bind the entity class whose relations `with()` loads (done by BaseModel.query()). */
  forModel(model: Function): this {
    this._model = model
    return this
  }

  /**
   * Eager-load relations declared with @HasOne/@HasMany/@BelongsTo/@ManyToMany.
   * One batched `IN (...)` query per relation; dot paths load nested relations.
   *   User.query().with('posts', 'posts.comments').get()
   */
  with(...relations: string[]): this {
    this._with.push(...relations)
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
    // Sort keys often come from the query string — validate both parts
    this._orders.push({
      column:    assertSafeIdentifier(column, 'ORDER BY column'),
      direction: assertSortDirection(direction)
    })
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

  private compileWheres(mode: TrashedMode = this._trashed): string {
    let conditions = this.compileConditions(this._wheres)

    // Soft-delete scope — user conditions are parenthesised so an OR inside
    // them cannot escape the scope
    const scope = this.softDeleteScope(mode)
    if (scope) conditions = conditions ? `(${conditions}) AND ${scope}` : scope

    return conditions ? `WHERE ${conditions}` : ''
  }

  private softDeleteScope(mode: TrashedMode): string {
    if (!this._softDeleteColumn || mode === 'include') return ''
    // Qualify the column when joins could make it ambiguous
    const col = this._joins.length && !this._softDeleteColumn.includes('.')
      ? `${this._table}.${this._softDeleteColumn}`
      : this._softDeleteColumn
    return mode === 'only' ? `${col} IS NOT NULL` : `${col} IS NULL`
  }

  private compileConditions(list: WhereClause[]): string {
    const parts: string[] = []
    for (const w of list) {
      const sql = this.compileCondition(w)
      if (!sql) continue  // e.g. an empty group
      parts.push(parts.length === 0 ? sql : `${w.conjunction} ${sql}`)
    }
    return parts.join(' ')
  }

  private compileCondition(w: WhereClause): string {
    if (w.group) {
      const inner = this.compileConditions(w.group)
      return inner ? `(${inner})` : ''
    }

    if (w.raw) return w.raw

    if (w.operator === 'IS NULL')     return `${w.column} IS NULL`
    if (w.operator === 'IS NOT NULL') return `${w.column} IS NOT NULL`

    // `col = NULL` never matches in SQL — translate to IS [NOT] NULL
    if (w.value === null && w.operator === '=')  return `${w.column} IS NULL`
    if (w.value === null && (w.operator === '!=' || w.operator === '<>')) return `${w.column} IS NOT NULL`

    if (w.operator === 'IN' || w.operator === 'NOT IN') {
      const values = w.value as unknown[]
      // `IN ()` is a syntax error — empty IN matches nothing, empty NOT IN matches everything
      if (!values || values.length === 0) {
        return w.operator === 'IN' ? '1 = 0' : '1 = 1'
      }
      const placeholders = values.map(v => this.nextParam(v)).join(', ')
      return `${w.column} ${w.operator} (${placeholders})`
    }

    if (w.operator === 'BETWEEN' || w.operator === 'NOT BETWEEN') {
      const [min, max] = Array.isArray(w.value) ? w.value : []
      const p1 = this.nextParam(min)
      const p2 = this.nextParam(max)
      return `${w.column} ${w.operator} ${p1} AND ${p2}`
    }

    const ph = this.nextParam(w.value)
    return `${w.column} ${w.operator} ${ph}`
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
    // MySQL / SQLite reject OFFSET without LIMIT — use the dialect's "no limit" value
    const noLimit = this._limit === undefined && this._offset !== undefined && this.driverType !== 'postgres'
      ? (this.driverType === 'mysql' ? 'LIMIT 18446744073709551615' : 'LIMIT -1')
      : ''
    const limit   = this._limit  !== undefined ? `LIMIT ${this._limit}`   : noLimit
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
    const rows = await this._fetch()
    if (this._with.length > 0 && rows.length > 0) {
      if (!this._model) {
        throw new Error('[AxilORM] with() needs a model — use Model.query() or call forModel(Entity) first.')
      }
      await eagerLoad(this._model, rows as unknown as Record<string, unknown>[], this._with, {
        driver:     this.driver,
        driverType: this.driverType
      })
    }
    return rows
  }

  private async _fetch(): Promise<T[]> {
    const { sql, params } = this.toSQL()
    const result = await this.driver.query<T>(sql, params)
    return result.rows
  }

  // Run a single-value SELECT without permanently changing the builder.
  // ORDER BY is dropped: it is meaningless for an aggregate and Postgres
  // rejects ordering by a non-aggregated column.
  private async _scalar(expression: string, alias: string): Promise<unknown> {
    const selects = this._selects
    const orders  = this._orders
    this._selects = [`${expression} AS ${alias}`]
    this._orders  = []
    try {
      const rows = await this._fetch() as unknown as Array<Record<string, unknown>>
      return rows[0]?.[alias]
    } finally {
      this._selects = selects
      this._orders  = orders
    }
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
    return Number(await this._scalar('COUNT(*)', '_count') ?? 0)
  }

  async exists(): Promise<boolean> {
    return (await this.count()) > 0
  }

  async pluck<K extends keyof T>(column: K): Promise<T[K][]> {
    const selects = this._selects
    this._selects = [String(column)]
    try {
      const rows = await this._fetch()
      return rows.map(r => r[column])
    } finally {
      this._selects = selects
    }
  }

  // ── Insert ────────────────────────────────────────────────────────

  async insert(data: Partial<T>, primaryKey: string = 'id'): Promise<T> {
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
    // SQLite: insertId is the rowid, which is valid for any rowid table
    // even when the primary key is not called "id" or is a UUID.
    // MySQL: insertId is 0 for non auto-increment keys — use the supplied key.
    const supplied = (data as Record<string, unknown>)[primaryKey]
    const lastId   = this.driverType === 'sqlite'
      ? ((result as any).lastInsertRowid ?? (result as any).insertId)
      : (supplied !== undefined && supplied !== null ? supplied : ((result as any).lastInsertRowid ?? (result as any).insertId))
    const keyCol   = this.driverType === 'sqlite' ? 'rowid' : primaryKey
    const fetched = await this.driver.query<T>(
      `SELECT * FROM ${this._table} WHERE ${keyCol} = ${this.nextParam(lastId)}`,
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
    return this._update(data as Record<string, unknown>, this._trashed)
  }

  private async _update(data: Record<string, unknown>, mode: TrashedMode): Promise<number> {
    this._params   = []
    this._paramIdx = 1

    const sets      = Object.entries(data)
      .map(([k, v]) => `${k} = ${this.nextParam(v)}`)
      .join(', ')

    const wheres    = this.compileWheres(mode)
    // No RETURNING: it breaks tables without an "id" column, and affectedRows
    // already carries the row count for every driver
    const returning = ''

    const sql = `UPDATE ${this._table} SET ${sets} ${wheres} ${returning}`.trim()
    const result = await this.driver.query(sql, this._params)

    return result.affectedRows ?? result.rows.length
  }

  // ── Delete ────────────────────────────────────────────────────────

  /**
   * DELETE matching rows. On a soft-delete query (@DeletedAt model) this
   * sets the deleted-at column instead — use forceDelete() to remove rows.
   */
  async delete(): Promise<number> {
    if (this._softDeleteColumn) {
      return this._update({ [this._softDeleteColumn]: new Date() }, this._trashed === 'only' ? 'only' : 'exclude')
    }
    return this._delete(this._trashed)
  }

  /** Permanently delete matching rows, trashed or not (unless onlyTrashed()). */
  async forceDelete(): Promise<number> {
    return this._delete(this._trashed === 'only' ? 'only' : 'include')
  }

  /** Clear the deleted-at column on matching soft-deleted rows. */
  async restore(): Promise<number> {
    if (!this._softDeleteColumn) {
      throw new Error('[AxilORM] restore() needs a soft-delete column (@DeletedAt or useSoftDeletes()).')
    }
    return this._update({ [this._softDeleteColumn]: null }, 'only')
  }

  private async _delete(mode: TrashedMode): Promise<number> {
    this._params   = []
    this._paramIdx = 1

    const wheres    = this.compileWheres(mode)
    // No RETURNING: it breaks tables without an "id" column, and affectedRows
    // already carries the row count for every driver
    const returning = ''

    const sql = `DELETE FROM ${this._table} ${wheres} ${returning}`.trim()
    const result = await this.driver.query(sql, this._params)

    return result.affectedRows ?? result.rows.length
  }

  // ── Increment / Decrement ─────────────────────────────────────────

  async increment(column: string, by = 1): Promise<void> {
    this._params   = []
    this._paramIdx = 1
    const wheres = this.compileWheres()
    assertSafeIdentifier(column, 'column')
    const step   = Number(by)
    if (!Number.isFinite(step)) throw new Error(`[AxilORM] increment() step must be a number`)
    const sql    = `UPDATE ${this._table} SET ${column} = ${column} + ${step} ${wheres}`
    await this.driver.query(sql, this._params)
  }

  async decrement(column: string, by = 1): Promise<void> {
    await this.increment(column, -by)
  }

  // ── Aggregate ─────────────────────────────────────────────────────

  async sum(column: string): Promise<number> {
    return Number(await this._scalar(`SUM(${column})`, '_sum') ?? 0)
  }

  async avg(column: string): Promise<number> {
    return Number(await this._scalar(`AVG(${column})`, '_avg') ?? 0)
  }

  async max(column: string): Promise<number> {
    return Number(await this._scalar(`MAX(${column})`, '_max') ?? 0)
  }

  async min(column: string): Promise<number> {
    return Number(await this._scalar(`MIN(${column})`, '_min') ?? 0)
  }

  // ── Raw ───────────────────────────────────────────────────────────

  async raw<R = unknown>(sql: string, params: unknown[] = []): Promise<R[]> {
    const result = await this.driver.query<R>(sql, params)
    return result.rows
  }
}