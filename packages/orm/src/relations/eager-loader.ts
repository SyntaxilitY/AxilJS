/**
 * AxilORM — Relation eager loading
 *
 * Loads relations declared with @HasOne / @HasMany / @BelongsTo / @ManyToMany
 * for a batch of parent records with one `WHERE key IN (...)` query per
 * relation (no N+1). Dot paths (`posts.comments`) load nested relations.
 *
 * Key conventions (override with the decorator options):
 *   hasOne / hasMany  related.<foreignKey>  → parent primary key
 *                     foreignKey default: `<parent_class_snake>_id`
 *   belongsTo         parent.<foreignKey>   → related primary key
 *                     foreignKey default: `<related_class_snake>_id`
 *   manyToMany        pivot.<foreignKey> → parent pk, pivot.<relatedKey> → related pk
 *                     pivotTable default: both class names in snake_case, sorted, joined by `_`
 *                     foreignKey default: `<parent_class_snake>_id`
 *                     relatedKey default: `<related_class_snake>_id`
 */

import { getEntityMetadata } from '../decorators/entity'
import type { EntityMeta, RelationMeta } from '../decorators/entity'
import { QueryBuilder } from '../query/query-builder'
import type { BaseDriver } from '../connection/base-driver'

type Row = Record<string, unknown>

export interface EagerLoadOptions {
  driver:     BaseDriver
  driverType: string
  /** Convert a related raw row into the value stored on the parent (default: the raw row). */
  hydrate?:   (target: Function, row: Row) => unknown
}

// Keep IN lists well below every driver's bind-parameter limit
const CHUNK = 500
const PIVOT_KEY = '__axil_pivot_key'

export function snakeCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .toLowerCase()
}

function columnOf(meta: EntityMeta, propertyKey: string): string {
  return meta.columns.get(propertyKey)?.columnName ?? propertyKey
}

// Read a column value from a raw row (keyed by column) or a hydrated model
// instance (keyed by property)
function readColumn(record: Row, meta: EntityMeta | undefined, column: string): unknown {
  if (meta) {
    for (const [prop, col] of meta.columns) {
      if (col.columnName === column && prop in record) return record[prop]
    }
  }
  return record[column]
}

function uniqueKeys(values: unknown[]): unknown[] {
  const seen = new Map<string, unknown>()
  for (const v of values) {
    if (v === null || v === undefined) continue
    const k = String(v)
    if (!seen.has(k)) seen.set(k, v)
  }
  return [...seen.values()]
}

async function fetchIn(
  build:  () => QueryBuilder<Row>,
  column: string,
  keys:   unknown[]
): Promise<Row[]> {
  const rows: Row[] = []
  for (let i = 0; i < keys.length; i += CHUNK) {
    rows.push(...await build().whereIn(column, keys.slice(i, i + CHUNK)).get())
  }
  return rows
}

function relatedQuery(target: Function, meta: EntityMeta, opts: EagerLoadOptions): QueryBuilder<Row> {
  const qb = new QueryBuilder<Row>(opts.driver, opts.driverType).from(meta.tableName)
  if (meta.softDelete) qb.useSoftDeletes(meta.softDelete.columnName)
  return qb
}

/**
 * Attach `relations` to every record in `records` (mutates them: the related
 * value is stored under the relation's property name).
 */
export async function eagerLoad(
  owner:     Function,
  records:   object[],
  relations: string[],
  opts:      EagerLoadOptions
): Promise<void> {
  if (records.length === 0 || relations.length === 0) return

  const ownerMeta = getEntityMetadata(owner)

  // "posts.comments", "posts" → { posts: ['comments'] }
  const tree = new Map<string, string[]>()
  for (const path of relations) {
    const [head, ...rest] = path.split('.')
    if (!tree.has(head)) tree.set(head, [])
    if (rest.length) tree.get(head)!.push(rest.join('.'))
  }

  for (const [name, nested] of tree) {
    const relation = ownerMeta?.relations.get(name)
    if (!ownerMeta || !relation) {
      throw new Error(`[AxilORM] Unknown relation "${name}" on ${owner.name}`)
    }

    const target     = relation.target()
    const targetMeta = getEntityMetadata(target)
    if (!targetMeta?.tableName) {
      throw new Error(`[AxilORM] Relation "${name}" on ${owner.name}: target is not an @Entity`)
    }

    const loaded = await loadRelation(owner, ownerMeta, records as Row[], relation, target, targetMeta, opts)
    if (nested.length && loaded.length) {
      await eagerLoad(target, loaded as object[], nested, opts)
    }
  }
}

async function loadRelation(
  owner:      Function,
  ownerMeta:  EntityMeta,
  records:    Row[],
  relation:   RelationMeta,
  target:     Function,
  targetMeta: EntityMeta,
  opts:       EagerLoadOptions
): Promise<unknown[]> {
  const hydrate     = (row: Row): unknown => opts.hydrate ? opts.hydrate(target, row) : row
  const ownerPk     = columnOf(ownerMeta, ownerMeta.primaryKey)
  const targetPk    = columnOf(targetMeta, targetMeta.primaryKey)
  const prop        = relation.propertyKey
  const loaded:     unknown[] = []

  switch (relation.type) {
    case 'hasOne':
    case 'hasMany': {
      const fk   = relation.foreignKey || `${snakeCase(owner.name)}_id`
      const keys = uniqueKeys(records.map(r => readColumn(r, ownerMeta, ownerPk)))
      const rows = keys.length ? await fetchIn(() => relatedQuery(target, targetMeta, opts), fk, keys) : []

      const byOwner = new Map<string, unknown[]>()
      for (const row of rows) {
        const value = hydrate(row)
        loaded.push(value)
        const k = String(row[fk])
        if (!byOwner.has(k)) byOwner.set(k, [])
        byOwner.get(k)!.push(value)
      }
      for (const record of records) {
        const list = byOwner.get(String(readColumn(record, ownerMeta, ownerPk))) ?? []
        record[prop] = relation.type === 'hasMany' ? list : (list[0] ?? null)
      }
      return loaded
    }

    case 'belongsTo': {
      const fk   = relation.foreignKey || `${snakeCase(target.name)}_id`
      const keys = uniqueKeys(records.map(r => readColumn(r, ownerMeta, fk)))
      const rows = keys.length ? await fetchIn(() => relatedQuery(target, targetMeta, opts), targetPk, keys) : []

      const byKey = new Map<string, unknown>()
      for (const row of rows) {
        const value = hydrate(row)
        loaded.push(value)
        byKey.set(String(row[targetPk]), value)
      }
      for (const record of records) {
        const key = readColumn(record, ownerMeta, fk)
        record[prop] = key === null || key === undefined ? null : (byKey.get(String(key)) ?? null)
      }
      return loaded
    }

    case 'manyToMany': {
      const pivot = relation.pivotTable || [snakeCase(owner.name), snakeCase(target.name)].sort().join('_')
      const fk    = relation.foreignKey || `${snakeCase(owner.name)}_id`
      const rk    = relation.relatedKey || `${snakeCase(target.name)}_id`
      const table = targetMeta.tableName
      const keys  = uniqueKeys(records.map(r => readColumn(r, ownerMeta, ownerPk)))

      const rows = keys.length
        ? await fetchIn(
            () => relatedQuery(target, targetMeta, opts)
              .select(`${table}.*`, `${pivot}.${fk} AS ${PIVOT_KEY}`)
              .join(pivot, `${pivot}.${rk} = ${table}.${targetPk}`),
            `${pivot}.${fk}`,
            keys
          )
        : []

      const byOwner = new Map<string, unknown[]>()
      for (const row of rows) {
        const k = String(row[PIVOT_KEY])
        delete row[PIVOT_KEY]
        const value = hydrate(row)
        loaded.push(value)
        if (!byOwner.has(k)) byOwner.set(k, [])
        byOwner.get(k)!.push(value)
      }
      for (const record of records) {
        record[prop] = byOwner.get(String(readColumn(record, ownerMeta, ownerPk))) ?? []
      }
      return loaded
    }
  }
}
