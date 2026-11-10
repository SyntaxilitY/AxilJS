/**
 * Core ORM types shared across drivers, query builder, and migrations.
 * These are the building blocks of the entire ORM system.
 */
export type DatabaseDriver = 'postgres' | 'mysql' | 'sqlite' | 'mongodb';
export interface ConnectionConfig {
    driver: DatabaseDriver;
    url?: string;
    host?: string;
    port?: number;
    database?: string;
    username?: string;
    password?: string;
    filename?: string;
    pool?: {
        min?: number;
        max?: number;
        idleTimeoutMs?: number;
    };
    logging?: boolean;
    ssl?: boolean | {
        ca?: string;
        cert?: string;
        key?: string;
        rejectUnauthorized?: boolean;
    };
}
export interface QueryResult<T = Record<string, unknown>> {
    rows: T[];
    affectedRows: number;
    insertId?: number | string;
    raw?: unknown;
}
export type ColumnType = 'integer' | 'bigint' | 'float' | 'decimal' | 'boolean' | 'string' | 'text' | 'json' | 'jsonb' | 'date' | 'datetime' | 'timestamp' | 'uuid' | 'enum';
export interface ColumnDefinition {
    name: string;
    type: ColumnType;
    nullable?: boolean;
    default?: unknown;
    primary?: boolean;
    autoIncrement?: boolean;
    unique?: boolean;
    length?: number;
    precision?: number;
    scale?: number;
    enumValues?: string[];
    references?: {
        table: string;
        column: string;
        onDelete?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
        onUpdate?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
    };
}
export interface EntityMetadata {
    tableName: string;
    columns: Map<string, ColumnDefinition>;
    primaryKey: string;
}
export type WhereOperator = '=' | '!=' | '<' | '<=' | '>' | '>=' | 'LIKE' | 'ILIKE' | 'IN' | 'NOT IN' | 'IS NULL' | 'IS NOT NULL' | 'BETWEEN' | 'NOT BETWEEN' | 'NOT LIKE' | '<>';
export interface WhereCondition {
    column: string;
    operator: WhereOperator;
    value?: unknown;
    values?: unknown[];
    conjunction?: 'AND' | 'OR';
    group?: WhereCondition[];
}
export interface OrderByClause {
    column: string;
    direction: 'ASC' | 'DESC';
}
export type JoinType = 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
export interface JoinClause {
    type: JoinType;
    table: string;
    on: string;
}
//# sourceMappingURL=types.d.ts.map