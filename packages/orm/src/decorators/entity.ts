/**
 * AxilORM — All Decorators
 * Trace ID: 992f2995fd8091f39f6f41f757fb766a
 */

// ── Column Type ───────────────────────────────────────────────────────────

export type ColumnType =
  | 'string'
  | 'number'
  | 'integer'
  | 'bigint'
  | 'float'
  | 'decimal'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'timestamp'
  | 'text'
  | 'json'
  | 'jsonb'
  | 'uuid'
  | 'enum'

// ── Options ───────────────────────────────────────────────────────────────

export interface ColumnOptions {
  type?:          ColumnType
  name?:          string
  nullable?:      boolean
  unique?:        boolean
  default?:       unknown
  length?:        number
  precision?:     number
  scale?:         number
}

export interface PrimaryKeyOptions {
  type?:          'integer' | 'bigint' | 'uuid' | 'string'
  generated?:     boolean
  autoIncrement?: boolean
  name?:          string
}

export interface RelationOptions {
  /**
   * hasOne / hasMany: column on the related table pointing at this entity
   *                   (default `<this_class_snake>_id`).
   * belongsTo:        column on this table pointing at the related entity
   *                   (default `<related_class_snake>_id`).
   * manyToMany:       pivot column pointing at this entity
   *                   (default `<this_class_snake>_id`).
   */
  foreignKey?:    string
  /** manyToMany: pivot table (default: both class names in snake_case, sorted, joined by `_`). */
  pivotTable?:    string
  /** manyToMany: pivot column pointing at the related entity (default `<related_class_snake>_id`). */
  relatedKey?:    string
  /** Recorded only — relations are loaded explicitly with `with()`. */
  eager?:         boolean
}

export interface IndexOptions {
  name?:          string
  unique?:        boolean
}

// ── Metadata Interfaces ───────────────────────────────────────────────────

export interface ColumnMeta {
  propertyKey:    string
  columnName:     string
  type:           ColumnType
  nullable:       boolean
  unique:         boolean
  default?:       unknown
  length?:        number
  precision?:     number
  scale?:         number
  isPrimary:      boolean
  isGenerated:    boolean
}

export interface RelationMeta {
  type:           'hasOne' | 'hasMany' | 'belongsTo' | 'manyToMany'
  propertyKey:    string
  target:         () => Function
  foreignKey:     string
  pivotTable?:    string
  relatedKey?:    string
  eager:          boolean
}

export interface IndexMeta {
  name:           string
  columns:        string[]
  unique:         boolean
}

export interface EntityMeta {
  tableName:      string
  primaryKey:     string
  columns:        Map<string, ColumnMeta>
  relations:      Map<string, RelationMeta>
  indexes:        IndexMeta[]
  /** Set by @DeletedAt — enables soft deletes for the entity. */
  softDelete?:    { propertyKey: string; columnName: string }
}

// Backward compat
export type EntityMetadata = EntityMeta

// ── Decorator return type (avoids PropertyDecorator conflict) ─────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PropDecorator = (target: any, propertyKey: string | symbol) => void

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ClassDeco    = (target: any) => void

// ── Registry ─────────────────────────────────────────────────────────────

export const entityRegistry = new Map<Function, EntityMeta>()

export function getOrCreateMeta(target: Function): EntityMeta {
  if (!entityRegistry.has(target)) {
    entityRegistry.set(target, {
      tableName:  '',
      primaryKey: 'id',
      columns:    new Map<string, ColumnMeta>(),
      relations:  new Map<string, RelationMeta>(),
      indexes:    []
    })
  }
  return entityRegistry.get(target)!
}

export function getEntityMetadata(target: Function): EntityMeta | undefined {
  return entityRegistry.get(target)
}

export function getAllEntities(): Map<Function, EntityMeta> {
  return entityRegistry
}

// ── @Entity ───────────────────────────────────────────────────────────────

export function Entity(tableName?: string): ClassDeco {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (target: any): void => {
    const meta     = getOrCreateMeta(target as Function)
    meta.tableName = tableName ?? (target as Function).name.toLowerCase() + 's'
  }
}

// ── @PrimaryKey ───────────────────────────────────────────────────────────

export function PrimaryKey(options: PrimaryKeyOptions = {}): PropDecorator {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (target: any, propertyKey: string | symbol): void => {
    const key        = String(propertyKey)
    const ctor       = (typeof target === 'function' ? target : target?.constructor) as Function
    const meta       = getOrCreateMeta(ctor)
    const isGenerated = options.generated ?? options.autoIncrement ?? true

    meta.primaryKey = key
    meta.columns.set(key, {
      propertyKey:  key,
      columnName:   options.name ?? key,
      type:         options.type ?? 'integer',
      nullable:     false,
      unique:       true,
      isPrimary:    true,
      isGenerated
    })
  }
}

// ── @Column ───────────────────────────────────────────────────────────────

export function Column(options: ColumnOptions = {}): PropDecorator {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (target: any, propertyKey: string | symbol): void => {
    const key  = String(propertyKey)
    const ctor = (typeof target === 'function' ? target : target?.constructor) as Function
    const meta = getOrCreateMeta(ctor)

    meta.columns.set(key, {
      propertyKey:  key,
      columnName:   options.name      ?? key,
      type:         options.type      ?? 'string',
      nullable:     options.nullable  ?? false,
      unique:       options.unique    ?? false,
      default:      options.default,
      length:       options.length,
      precision:    options.precision,
      scale:        options.scale,
      isPrimary:    false,
      isGenerated:  false
    })
  }
}

// ── Timestamp shortcuts ───────────────────────────────────────────────────

export function CreatedAt(): PropDecorator {
  return Column({
    type:     'timestamp',
    name:     'created_at',
    nullable: false,
    default:  'CURRENT_TIMESTAMP'
  })
}

export function UpdatedAt(): PropDecorator {
  return Column({
    type:     'timestamp',
    name:     'updated_at',
    nullable: true
  })
}

export function DeletedAt(): PropDecorator {
  const column = Column({
    type:     'timestamp',
    name:     'deleted_at',
    nullable: true
  })
  // Also mark the entity as soft-deletable (see BaseModel / BaseRepository)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (target: any, propertyKey: string | symbol): void => {
    column(target, propertyKey)
    const ctor = (typeof target === 'function' ? target : target?.constructor) as Function
    getOrCreateMeta(ctor).softDelete = { propertyKey: String(propertyKey), columnName: 'deleted_at' }
  }
}

// ── Relations ─────────────────────────────────────────────────────────────

function makeRelation(
  relationType: 'hasOne' | 'hasMany' | 'belongsTo' | 'manyToMany'
) {
  return function (
    targetFactory: () => Function,
    options:        RelationOptions = {}
  ): PropDecorator {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (instance: any, propertyKey: string | symbol): void => {
      const key  = String(propertyKey)
      const ctor = (typeof instance === 'function'
        ? instance
        : instance?.constructor) as Function
      const meta = getOrCreateMeta(ctor)

      meta.relations.set(key, {
        type:        relationType,
        propertyKey: key,
        target:      targetFactory,
        foreignKey:  options.foreignKey ?? '',
        pivotTable:  options.pivotTable,
        relatedKey:  options.relatedKey,
        eager:       options.eager      ?? false
      })
    }
  }
}

export const HasOne     = makeRelation('hasOne')
export const HasMany    = makeRelation('hasMany')
export const BelongsTo  = makeRelation('belongsTo')
export const ManyToMany = makeRelation('manyToMany')

// ── @Index ────────────────────────────────────────────────────────────────

export function Index(options: IndexOptions = {}): PropDecorator {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (target: any, propertyKey: string | symbol): void => {
    const key  = String(propertyKey)
    const ctor = (typeof target === 'function'
      ? target
      : target?.constructor) as Function
    const meta = getOrCreateMeta(ctor)

    meta.indexes.push({
      name:    options.name   ?? `idx_${key}`,
      columns: [key],
      unique:  options.unique ?? false
    })
  }
}

// ── @CompositeIndex ───────────────────────────────────────────────────────

export function CompositeIndex(
  columns: string[],
  options: IndexOptions = {}
): ClassDeco {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (target: any): void => {
    const meta = getOrCreateMeta(target as Function)
    meta.indexes.push({
      name:    options.name   ?? `idx_${columns.join('_')}`,
      columns,
      unique:  options.unique ?? false
    })
  }
}