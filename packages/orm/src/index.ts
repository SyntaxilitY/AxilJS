/**
 * @axiljs/orm — Public API
 * Trace ID: 992f2995fd8091f39f6f41f757fb766a
 */

// ── Connection ────────────────────────────────────────────────────────────
export { ConnectionManager, createConnection } from './connection/connection-manager'
export { BaseDriver }                          from './connection/base-driver'
export type { TransactionContext }             from './connection/base-driver'

// ── Drivers ───────────────────────────────────────────────────────────────
export { SQLiteDriver }   from './connection/sqlite-driver'
export { PostgresDriver } from './connection/postgres-driver'
export { MySQLDriver }    from './connection/mysql-driver'

// ── Decorators ────────────────────────────────────────────────────────────
// Single source — everything from entity.ts
export {
  Entity,
  PrimaryKey,
  Column,
  CreatedAt,
  UpdatedAt,
  DeletedAt,
  HasOne,
  HasMany,
  BelongsTo,
  ManyToMany,
  Index,
  CompositeIndex,
  getEntityMetadata,
  getAllEntities,
  entityRegistry
} from './decorators/entity'

export type {
  ColumnType,
  ColumnOptions,
  PrimaryKeyOptions,
  RelationOptions,
  IndexOptions,
  ColumnMeta,
  RelationMeta,
  IndexMeta,
  EntityMeta,
  EntityMetadata    // backward compat alias
} from './decorators/entity'

// ── Query Builder (new — used by BaseModel) ───────────────────────────────
export { QueryBuilder as ModelQueryBuilder } from './query/query-builder'

// ── Query Builder (original — used by BaseRepository) ────────────────────
export { QueryBuilder } from './query-builder/query-builder'

// ── Identifier safety (orderBy / where column validation) ────────────────
export {
  assertSafeIdentifier,
  isSafeIdentifier,
  assertSortDirection,
  UnsafeIdentifierError
} from './query/identifier'

// ── Relations (eager loading) ─────────────────────────────────────────────
export { eagerLoad }                  from './relations/eager-loader'
export type { EagerLoadOptions }      from './relations/eager-loader'

// ── Repository ────────────────────────────────────────────────────────────
export { BaseRepository } from './repository/base-repository'
export type { FindOptions } from './repository/base-repository'

// ── BaseModel (new class-based ORM) ──────────────────────────────────────
export { BaseModel }                    from './model/base-model'
export type { ModelFindOptions }        from './model/base-model'
export { getEntityMeta, getOrCreateMeta } from './model/model-metadata'

// ── Schema Builder ────────────────────────────────────────────────────────
export { Schema, TableBuilder } from './schema/schema-builder'

// ── Transaction ───────────────────────────────────────────────────────────
export { Transaction, TransactionScope } from './transaction/transaction-manager'

// ── Views ─────────────────────────────────────────────────────────────────
export { ViewManager } from './views/view-manager'

// ── Procedures ────────────────────────────────────────────────────────────
export { ProcedureManager } from './procedures/procedure-manager'

// ── Migrations ────────────────────────────────────────────────────────────
export { MigrationRunner }    from './migrations/migration-runner'
export type { Migration }     from './migrations/migration-runner'

// ── Types ─────────────────────────────────────────────────────────────────
export * from './types'