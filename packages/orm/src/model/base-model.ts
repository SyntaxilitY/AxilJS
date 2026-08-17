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
    return new QueryBuilder(
      BaseModel.getDriver(),
      BaseModel.getDriverType()
    ).from(this.getTableName())
  }

  // ── all() ─────────────────────────────────────────────────────────

  static async all<TThis extends ModelClass>(
    this: TThis
  ): Promise<InstanceType<TThis>[]> {
    const rows = await this.query().get()
    return rows.map((r: Record<string, unknown>) =>
      BaseModel._hydrate(this, r)
    )
  }

  // ── find() ────────────────────────────────────────────────────────

  static async find<TThis extends ModelClass>(
    this: TThis,
    id:   number | string
  ): Promise<InstanceType<TThis> | null> {
    const meta = getEntityMeta(this as unknown as new () => BaseModel)
    const pk   = meta?.primaryKey ?? 'id'
    const row  = await this.query().where(pk, '=', id).first()
    return row ? BaseModel._hydrate(this, row) : null
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
    const row = await this.query().insert(data as Record<string, unknown>)
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
    const data = this._toColumnMap()

    if (this._isNew) {
      // INSERT
      delete data[pk]
      const row = await qb.insert(data)
      const id  = (row as Record<string, unknown>)[pk]
      ;(this as Record<string, unknown>)[pk] = id
      this._isNew    = false
      this._original = { ...data, [pk]: id }
      this._dirty.clear()
    } else {
      // UPDATE — only dirty columns
      const updates: Record<string, unknown> = {}
      for (const key of this._dirty) {
        updates[key] = (this as Record<string, unknown>)[key]
      }
      if (Object.keys(updates).length > 0) {
        const id = (this as Record<string, unknown>)[pk]
        await qb.where(pk, '=', id).update(updates)
        this._dirty.clear()
      }
    }

    return this
  }

  // ── delete() ──────────────────────────────────────────────────────

  async delete(): Promise<void> {
    const ctor = this.constructor as typeof BaseModel
    const meta = getEntityMeta(ctor as unknown as new () => BaseModel)
    const pk   = meta?.primaryKey ?? 'id'
    const id   = (this as Record<string, unknown>)[pk]

    await new QueryBuilder(ctor.getDriver(), ctor.getDriverType())
      .from(ctor.getTableName())
      .where(pk, '=', id)
      .delete()
  }

  // ── refresh() ─────────────────────────────────────────────────────

  async refresh(): Promise<this> {
    const ctor  = this.constructor as typeof BaseModel
    const meta  = getEntityMeta(ctor as unknown as new () => BaseModel)
    const pk    = meta?.primaryKey ?? 'id'
    const id    = (this as Record<string, unknown>)[pk]
    const fresh = await ctor.find(id as number)
    if (fresh) Object.assign(this, fresh)
    return this
  }

  // ── isDirty() / isNew() / toJSON() ────────────────────────────────

  isDirty(column?: string): boolean {
    return column ? this._dirty.has(column) : this._dirty.size > 0
  }

  isNew(): boolean {
    return this._isNew
  }

  toJSON(): Record<string, unknown> {
    return this._toColumnMap()
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

    return instance
  }
}