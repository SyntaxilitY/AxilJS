/**
 * Core ORM types shared across drivers, query builder, and migrations.
 * These are the building blocks of the entire ORM system.
 */

// ─── Database Drivers ──────────────────────────────────────────────────────────

// Supported database types
export type DatabaseDriver =
  | 'postgres'
  | 'mysql'
  | 'sqlite'
  | 'mongodb';

// ─── Connection Config ─────────────────────────────────────────────────────────

export interface ConnectionConfig {
  // Which database engine to use
  driver: DatabaseDriver;

  // Connection URL (takes priority over individual fields)
  // e.g. postgres://user:pass@host:5432/dbname
  url?: string;

  // Individual connection fields (used if url not provided)
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;

  // SQLite-specific: path to the .db file
  filename?: string;

  // Connection pool settings
  pool?: {
    min?: number;   // Minimum connections (default: 2)
    max?: number;   // Maximum connections (default: 10)
    idleTimeoutMs?: number; // Release idle connections after (default: 30000)
  };

  // Enable query logging (default: false)
  logging?: boolean;

  // SSL configuration
  ssl?: boolean | { ca?: string; cert?: string; key?: string };
}

// ─── Query Result ──────────────────────────────────────────────────────────────

export interface QueryResult<T = Record<string, unknown>> {
  // Returned rows (SELECT queries)
  rows: T[];

  // Number of rows affected (INSERT, UPDATE, DELETE)
  affectedRows: number;

  // Last inserted ID (INSERT queries)
  insertId?: number | string;

  // Raw result from driver (escape hatch)
  raw?: unknown;
}

// ─── Column Types ──────────────────────────────────────────────────────────────

export type ColumnType =
  | 'integer'
  | 'bigint'
  | 'float'
  | 'decimal'
  | 'boolean'
  | 'string'
  | 'text'
  | 'json'
  | 'jsonb'       // PostgreSQL optimized JSON
  | 'date'
  | 'datetime'
  | 'timestamp'
  | 'uuid'
  | 'enum';

// ─── Column Definition ─────────────────────────────────────────────────────────

export interface ColumnDefinition {
  // Column name in the database
  name: string;

  // Data type
  type: ColumnType;

  // Allow NULL values (default: true)
  nullable?: boolean;

  // Default value (SQL expression or literal)
  default?: unknown;

  // Is primary key
  primary?: boolean;

  // Auto-increment (for integer primary keys)
  autoIncrement?: boolean;

  // Unique constraint
  unique?: boolean;

  // Maximum length (for string type)
  length?: number;

  // Precision and scale (for decimal type)
  precision?: number;
  scale?: number;

  // Enum values (for enum type)
  enumValues?: string[];

  // References another table (foreign key)
  references?: {
    table: string;
    column: string;
    onDelete?: 'CASCADE' | 'SET NULL' | '@axilRICT' | 'NO ACTION';
    onUpdate?: 'CASCADE' | 'SET NULL' | '@axilRICT' | 'NO ACTION';
  };
}

// ─── Entity Metadata ───────────────────────────────────────────────────────────

// Stored on entity class via reflect-metadata
export interface EntityMetadata {
  // Database table name
  tableName: string;

  // Column definitions
  columns: Map<string, ColumnDefinition>;

  // Primary key column name
  primaryKey: string;
}

// ─── Where Clause ─────────────────────────────────────────────────────────────

// Operators for WHERE conditions
export type WhereOperator =
  | '='
  | '!='
  | '<'
  | '<='
  | '>'
  | '>='
  | 'LIKE'
  | 'ILIKE'     // Case-insensitive LIKE (PostgreSQL)
  | 'IN'
  | 'NOT IN'
  | 'IS NULL'
  | 'IS NOT NULL'
  | 'BETWEEN';

export interface WhereCondition {
  column: string;
  operator: WhereOperator;
  value?: unknown;
  // For BETWEEN: [min, max]
  values?: unknown[];
}

// ─── Order By ─────────────────────────────────────────────────────────────────

export interface OrderByClause {
  column: string;
  direction: 'ASC' | 'DESC';
}

// ─── Join ─────────────────────────────────────────────────────────────────────

export type JoinType = 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';

export interface JoinClause {
  type: JoinType;
  table: string;
  on: string; // Raw SQL ON condition e.g. "users.id = posts.user_id"
}