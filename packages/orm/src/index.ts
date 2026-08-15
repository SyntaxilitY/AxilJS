/**
 * @axil/orm - Public API
 */

// Connection
export { ConnectionManager, createConnection } from './connection/connection-manager';
export { BaseDriver } from './connection/base-driver';
export type { TransactionContext } from './connection/base-driver';

// Drivers
export { SQLiteDriver } from './connection/sqlite-driver';
export { PostgresDriver } from './connection/postgres-driver';
export { MySQLDriver } from './connection/mysql-driver';

// Decorators
export {
  Entity,
  PrimaryKey,
  Column,
  CreatedAt,
  UpdatedAt,
  DeletedAt,
  getEntityMetadata
} from './decorators/entity';

// Query Builder
export { QueryBuilder } from './query-builder/query-builder';

// Repository
export { BaseRepository } from './repository/base-repository';

// Migrations
export { MigrationRunner } from './migrations/migration-runner';
export type { Migration } from './migrations/migration-runner';

// Types
export * from './types';