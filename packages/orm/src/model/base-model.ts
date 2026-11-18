/**
 * AxilORM — Base Model
 * Trace ID: 992f2995fd8091f39f6f41f757fb766a
 *
 * Uses polymorphic `this` typing so that:
 *   User.create({ name: 'x' })  →  Promise<User>   (not Promise<BaseModel>)
 *   User.find(1)                →  Promise<User | null>
 *   user.save()                 →  Promise<User>
 */

import { QueryBuilder }    from '../query/query-builder'
import { getEntityMeta }   from './model-metadata'
import { eagerLoad }       from '../relations/eager-loader'
import { observeLoaded }   from '../connection/base-driver'
import type { BaseDriver } from '../connection/base-driver'

// ── Shared driver ─────────────────────────────────────────────────────────
let _driver:     BaseDriver | null = null
let _driverType: string            = 'sqlite'

// ── Helper types ──────────────────────────────────────────────────────────
//
// ModelClass<T>     = the static side of a class that extends BaseModel
// ModelInstance<T>   = the instance side (e.g. User, Post)
//
// The key insight: when you call User.create(), TypeScript infers
//   TThis = typeof User
//   InstanceType<typeof User> = User
//
// So `data: Partial<InstanceType<TThis>>` becomes `Partial<User>`.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ModelClass<T extends BaseModel = BaseModel> = (new (...args: any[]) => T) & typeof BaseModel

/** Options for BaseModel.all() / find(). */
export interface ModelFindOptions {
  /** Relations to eager-load (dot paths for nested: 'posts.comments'). */
  with?:        string[]
  /** Include soft-deleted rows (@DeletedAt entities). */
  withTrashed?: boolean
  /** Only soft-deleted rows (@DeletedAt entities). */
  onlyTrashed?: boolean
}

// ── BaseModel ─────────────────────────────────────────────────────────────

export class BaseModel {

  // ── Driver registration ───────────────────────────────────────────

  static setDriver(driver: BaseDriver, driverType: string): void {
    _driver     = driver
    _driverType = driverType
  }

  static getDriver(): BaseDriver {
    if (!_driver) {
      throw new Error('[AxilORM] No driver. Call BaseModel.setDriver() first.')
    }
    return _driver
  }

  static getDriverType(): string {
    return _driverType
  }

  // ── Table name ────────────────────────────────────────────────────

  static getTableName(): string {
    const meta = getEntityMeta(this as unknown as new () => BaseModel)
    if (!meta?.tableName) {
      throw new Error(`[AxilORM] @Entity decorator missing on ${this.name}`)
    }
    return meta.tableName
  }

  // ── Query Builder ─────────────────────────────────────────────────

  static query<TThis extends ModelClass>(
    this: TThis
  ): QueryBuilder<Record<string, unknown>> {
    const qb = new QueryBuilder(
      BaseModel.getDriver(),
      BaseModel.getDriverType()
    ).from(this.getTableName()).forModel(this)

    // @DeletedAt entities hide soft-deleted rows by default
    const meta = getEntityMeta(this as unknown as new () => BaseModel)
    if (meta?.softDelete) qb.useSoftDeletes(meta.softDelete.columnName)
    return qb
  }

  // ── with() / withTrashed() / onlyTrashed() ────────────────────────
  //
  // Return the (raw-row) query builder, like query() / where().

  static with<TThis extends ModelClass>(
    this: TThis,
    ...relations: string[]
  ): QueryBuilder<Record<string, unknown>> {
    return this.query().with(...relations)
  }

  static withTrashed<TThis extends ModelClass>(
    this: TThis
  ): QueryBuilder<Record<string, unknown>> {
    return this.query().withTrashed()
  }

  static onlyTrashed<TThis extends ModelClass>(
    this: TThis
  ): QueryBuilder<Record<string, unknown>> {
    return this.query().onlyTrashed()
  }

  // ── all() ─────────────────────────────────────────────────────────

  static async all<TThis extends ModelClass>(
    this:    TThis,
    options: ModelFindOptions = {}
  ): Promise<InstanceType<TThis>[]> {
    const rows   = await BaseModel._scoped(this, options).get()
    const models = rows.map((r: Record<string, unknown>) =>
      BaseModel._hydrate(this, r)
    )
    if (options.with?.length) await BaseModel._eagerLoad(this, models, options.with)
    return models
  }

  // ── find() ────────────────────────────────────────────────────────

  static async find<TThis extends ModelClass>(
    this:    TThis,
    id:      number | string,
    options: ModelFindOptions = {}
  ): Promise<InstanceType<TThis> | null> {
    const meta = getEntityMeta(this as unknown as new () => BaseModel)
    const pk   = meta?.primaryKey ?? 'id'
    const row  = await BaseModel._scoped(this, options)
      .where(meta?.columns.get(pk)?.columnName ?? pk, '=', id)
      .first()
    if (!row) return null
    const model = BaseModel._hydrate(this, row)
    if (options.with?.length) await BaseModel._eagerLoad(this, [model], options.with)
    return model
  }

  private static _scoped(
    ctor:    ModelClass,
    options: ModelFindOptions
  ): QueryBuilder<Record<string, unknown>> {
    const qb = ctor.query()
    if (options.onlyTrashed)      qb.onlyTrashed()
    else if (options.withTrashed) qb.withTrashed()
    return qb
  }

  // Related rows become model instances when the target extends BaseModel
  private static async _eagerLoad(
    ctor:      Function,
    models:    object[],
    relations: string[]
  ): Promise<void> {
    await eagerLoad(ctor, models, relations, {
      driver:     BaseModel.getDriver(),
      driverType: BaseModel.getDriverType(),
      hydrate:    (target, row) => target.prototype instanceof BaseModel
        ? BaseModel._hydrate(target as ModelClass, row)
        : row
    })
  }

  // ── findOrFail() ──────────────────────────────────────────────────

  static async findOrFail<TThis extends ModelClass>(
    this: TThis,
    id:   number | string
  ): Promise<InstanceType<TThis>> {
    const result = await this.find(id)
    if (!result) {
      throw new Error(`[AxilORM] ${this.name} id=${id} not found.`)
    }
    return result
  }

  // ── where() ───────────────────────────────────────────────────────

  static where<TThis extends ModelClass>(
    this:     TThis,
    column:   string,
    operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE',
    value:    unknown
  ): QueryBuilder<Record<string, unknown>> {
    return this.query().where(column, operator, value)
  }

  // ── create() ──────────────────────────────────────────────────────
  //
  //   User.create({ name: 'x', email: 'y' })
  //   → data: Partial<User>
  //   → return: Promise<User>

  static async create<TThis extends ModelClass>(
    this: TThis,
    data: Partial<InstanceType<TThis>>
  ): Promise<InstanceType<TThis>> {
    // Map property names to column names (@Column({ name })); unknown keys pass through
    const meta    = getEntityMeta(this as unknown as new () => BaseModel)
    const columns: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      columns[meta?.columns.get(key)?.columnName ?? key] = value
    }
    const pk  = meta?.primaryKey ?? 'id'
    const row = await this.query().insert(columns, meta?.columns.get(pk)?.columnName ?? pk)
    return BaseModel._hydrate(this, row)
  }

  // ── updateWhere() ─────────────────────────────────────────────────

  static async updateWhere<TThis extends ModelClass>(
    this:       TThis,
    conditions: Partial<InstanceType<TThis>>,
    data:       Partial<InstanceType<TThis>>
  ): Promise<number> {
    let qb = this.query()
    for (const [col, val] of Object.entries(
      conditions as Record<string, unknown>
    )) {
      qb = qb.where(col, '=', val) as typeof qb
    }
    return qb.update(data as Record<string, unknown>)
  }

  // ── deleteWhere() ─────────────────────────────────────────────────

  static async deleteWhere<TThis extends ModelClass>(
    this:       TThis,
    conditions: Partial<InstanceType<TThis>>
  ): Promise<number> {
    let qb = this.query()
    for (const [col, val] of Object.entries(
      conditions as Record<string, unknown>
    )) {
      qb = qb.where(col, '=', val) as typeof qb
    }
    return qb.delete()
  }

  // ── count() ───────────────────────────────────────────────────────

  static async count<TThis extends ModelClass>(
    this: TThis
  ): Promise<number> {
    return this.query().count()
  }

  // ── paginate() ────────────────────────────────────────────────────

  static async paginate<TThis extends ModelClass>(
    this:    TThis,
    page:    number,
    perPage  = 15
  ): Promise<{
    data:     InstanceType<TThis>[]
    total:    number
    page:     number
    perPage:  number
    lastPage: number
  }> {
    const [rows, total] = await Promise.all([
      this.query().paginate(page, perPage).get(),
      this.query().count()
    ])

    return {
      data: rows.map((r: Record<string, unknown>) =>
        BaseModel._hydrate(this, r)
      ),
      total,
      page,
      perPage,
      lastPage: Math.ceil(total / perPage)
    }
  }

  // ── Instance state ────────────────────────────────────────────────

  /** @internal */ private _isNew      = true
  /** @internal */ private _original:  Record<string, unknown> = {}
  /** @internal */ private _dirty:     Set<string>             = new Set()

  // ── save() ────────────────────────────────────────────────────────

  async save(): Promise<this> {
    const ctor = this.constructor as typeof BaseModel
    const meta = getEntityMeta(ctor as unknown as new () => BaseModel)
    const pk   = meta?.primaryKey ?? 'id'
    const qb   = new QueryBuilder(
      ctor.getDriver(),
      ctor.getDriverType()
    ).from(ctor.getTableName())
    const data  = this._toColumnMap()
    const pkCol = meta?.columns.get(pk)?.columnName ?? pk

    if (this._isNew) {
      // INSERT — drop the key only when it is not set (generated by the DB);
      // keep caller-supplied keys such as UUIDs
      if (data[pkCol] === undefined || data[pkCol] === null) delete data[pkCol]
      const row = await qb.insert(data, pkCol)
      const id  = row
        ? (row as Record<string, unknown>)[pkCol]
        : data[pkCol]
      ;(this as Record<string, unknown>)[pk] = id
      this._isNew    = false
      this._original = { ...data, [pkCol]: id }
      this._dirty.clear()
    } else {
      // UPDATE — only changed columns
      const updates = this._changedColumns()
      if (Object.keys(updates).length > 0) {
        const id = (this as Record<string, unknown>)[pk]
        await qb.where(pkCol, '=', id).update(updates)
        this._original = { ...this._original, ...updates }
        this._dirty.clear()
      }
    }

    return this
  }

  // ── delete() ──────────────────────────────────────────────────────
  //
  // @DeletedAt entities are soft-deleted (deleted_at = now); everything
  // else is removed with DELETE as before.

  async delete(): Promise<void> {
    const meta = getEntityMeta(this.constructor as unknown as new () => BaseModel)
    if (meta?.softDelete) {
      await this._setDeletedAt(new Date())
      return
    }
    await this.forceDelete()
  }

  /** Permanently DELETE the row, even for @DeletedAt entities. */
  async forceDelete(): Promise<void> {
    const ctor = this.constructor as typeof BaseModel
    const meta = getEntityMeta(ctor as unknown as new () => BaseModel)
    const pk   = meta?.primaryKey ?? 'id'
    const id   = (this as Record<string, unknown>)[pk]

    await new QueryBuilder(ctor.getDriver(), ctor.getDriverType())
      .from(ctor.getTableName())
      .where(meta?.columns.get(pk)?.columnName ?? pk, '=', id)
      .delete()
  }

  /** Undo a soft delete (@DeletedAt entities only). */
  async restore(): Promise<this> {
    await this._setDeletedAt(null)
    return this
  }

  /** True when a @DeletedAt entity is soft-deleted. */
  trashed(): boolean {
    const meta = getEntityMeta(this.constructor as unknown as new () => BaseModel)
    if (!meta?.softDelete) return false
    const value = (this as Record<string, unknown>)[meta.softDelete.propertyKey]
    return value !== null && value !== undefined
  }

  /** Eager-load relations onto this instance: `await user.load('posts')`. */
  async load(...relations: string[]): Promise<this> {
    await BaseModel._eagerLoad(this.constructor, [this], relations)
    return this
  }

  private async _setDeletedAt(value: Date | null): Promise<void> {
    const ctor = this.constructor as typeof BaseModel
    const meta = getEntityMeta(ctor as unknown as new () => BaseModel)
    if (!meta?.softDelete) {
      throw new Error(`[AxilORM] ${ctor.name} has no @DeletedAt column — soft deletes are disabled.`)
    }
    const pk  = meta.primaryKey
    const id  = (this as Record<string, unknown>)[pk]
    const col = meta.softDelete.columnName

    await new QueryBuilder(ctor.getDriver(), ctor.getDriverType())
      .from(ctor.getTableName())
      .where(meta.columns.get(pk)?.columnName ?? pk, '=', id)
      .update({ [col]: value })

    ;(this as Record<string, unknown>)[meta.softDelete.propertyKey] = value
    this._original = { ...this._original, [col]: value }
  }

  // ── refresh() ─────────────────────────────────────────────────────

  async refresh(): Promise<this> {
    const ctor  = this.constructor as typeof BaseModel
    const meta  = getEntityMeta(ctor as unknown as new () => BaseModel)
    const pk    = meta?.primaryKey ?? 'id'
    const id    = (this as Record<string, unknown>)[pk]
    const fresh = await ctor.find(id as number, { withTrashed: true })
    if (fresh) Object.assign(this, fresh)
    return this
  }

  // ── isDirty() / isNew() / toJSON() ────────────────────────────────

  isDirty(column?: string): boolean {
    const changed = this._isNew ? {} : this._changedColumns()
    if (!column) return this._dirty.size > 0 || Object.keys(changed).length > 0
    if (this._dirty.has(column) || column in changed) return true
    const meta = getEntityMeta(this.constructor as unknown as new () => BaseModel)
    const col  = meta?.columns.get(column)?.columnName
    return col !== undefined && col in changed
  }

  isNew(): boolean {
    return this._isNew
  }

  toJSON(): Record<string, unknown> {
    const json = this._toColumnMap()

    // Include relations that were eager-loaded onto this instance
    const meta = getEntityMeta(this.constructor as unknown as new () => BaseModel)
    if (meta) {
      const plain = (v: unknown): unknown =>
        v instanceof BaseModel ? v.toJSON() : v
      for (const prop of meta.relations.keys()) {
        const value = (this as Record<string, unknown>)[prop]
        if (value === undefined) continue
        json[prop] = Array.isArray(value) ? value.map(plain) : plain(value)
      }
    }
    return json
  }

  // ── Internal: instance → column map ───────────────────────────────

  private _toColumnMap(): Record<string, unknown> {
    const meta = getEntityMeta(
      this.constructor as unknown as new () => BaseModel
    )
    if (!meta) return {}

    const result: Record<string, unknown> = {}
    for (const [prop, col] of meta.columns) {
      result[col.columnName] = (this as Record<string, unknown>)[prop]
    }
    return result
  }

  // ── Internal: columns changed since load / last save ──────────────
  //
  // Property assignments are not intercepted, so compare the current
  // values against the snapshot taken at hydrate / save time.

  private _changedColumns(): Record<string, unknown> {
    const meta = getEntityMeta(
      this.constructor as unknown as new () => BaseModel
    )
    if (!meta) return {}

    const changed: Record<string, unknown> = {}
    for (const [prop, col] of meta.columns) {
      if (prop === meta.primaryKey) continue
      const value = (this as Record<string, unknown>)[prop]
      if (
        this._dirty.has(prop) ||
        this._dirty.has(col.columnName) ||
        !Object.is(value, this._original[col.columnName])
      ) {
        changed[col.columnName] = value
      }
    }
    return changed
  }

  // ── Internal: hydrate row → model instance ────────────────────────

  static _hydrate<TThis extends ModelClass>(
    ctor: TThis,
    row:  Record<string, unknown>
  ): InstanceType<TThis> {
    const instance = new ctor() as InstanceType<TThis>
    const meta     = getEntityMeta(ctor as unknown as new () => BaseModel)

    if (meta) {
      for (const [prop, col] of meta.columns) {
        if (col.columnName in row) {
          ;(instance as Record<string, unknown>)[prop] = row[col.columnName]
        } else if (prop in row) {
          ;(instance as Record<string, unknown>)[prop] = row[prop]
        }
      }
    } else {
      Object.assign(instance, row)
    }

    // Reset tracking state
    ;(instance as Record<string, unknown>)['_isNew']    = false
    ;(instance as Record<string, unknown>)['_original'] = { ...row }
    ;(instance as Record<string, unknown>)['_dirty']    = new Set<string>()

    // Track tSensitive values for the request (sensitive data lineage)
    observeLoaded(instance)
    return instance
  }
}