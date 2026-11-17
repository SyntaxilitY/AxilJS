/**
 * @axiljs/orm — Public API
 * Trace ID: 992f2995fd8091f39f6f41f757fb766a
 */
export { ConnectionManager, createConnection } from './connection/connection-manager';
export { BaseDriver, classifyStatement } from './connection/base-driver';
export type { TransactionContext } from './connection/base-driver';
export { SQLiteDriver } from './connection/sqlite-driver';
export { PostgresDriver } from './connection/postgres-driver';
export { MySQLDriver } from './connection/mysql-driver';
export { Entity, PrimaryKey, Column, CreatedAt, UpdatedAt, DeletedAt, HasOne, HasMany, BelongsTo, ManyToMany, Index, CompositeIndex, getEntityMetadata, getAllEntities, entityRegistry } from './decorators/entity';
export type { ColumnType, ColumnOptions, PrimaryKeyOptions, RelationOptions, IndexOptions, ColumnMeta, RelationMeta, IndexMeta, EntityMeta, EntityMetadata } from './decorators/entity';
export { QueryBuilder as ModelQueryBuilder } from './query/query-builder';
export { QueryBuilder } from './query-builder/query-builder';
export { assertSafeIdentifier, isSafeIdentifier, assertSortDirection, UnsafeIdentifierError } from './query/identifier';
export { eagerLoad } from './relations/eager-loader';
export type { EagerLoadOptions } from './relations/eager-loader';
export { BaseRepository } from './repository/base-repository';
export type { FindOptions } from './repository/base-repository';
export { BaseModel } from './model/base-model';
export type { ModelFindOptions } from './model/base-model';
export { getEntityMeta, getOrCreateMeta } from './model/model-metadata';
export { Schema, TableBuilder } from './schema/schema-builder';
export { Transaction, TransactionScope } from './transaction/transaction-manager';
export { ViewManager } from './views/view-manager';
export { ProcedureManager } from './procedures/procedure-manager';
export { MigrationRunner } from './migrations/migration-runner';
export type { Migration } from './migrations/migration-runner';
export * from './types';
//# sourceMappingURL=index.d.ts.map