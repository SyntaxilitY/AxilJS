/**
 * Fluent Query Builder.
 * Build SQL queries programmatically with a chainable API.
 * Handles parameter binding to prevent SQL injection.
 *
 * Usage:
 *   const users = await db
 *     .select('*')
 *     .from('users')
 *     .where('age', '>', 18)
 *     .orderBy('name', 'ASC')
 *     .limit(10)
 *     .execute<User>()
 */
import { BaseDriver } from '../connection/base-driver';
import { JoinType, WhereOperator } from '../types';
export declare class QueryBuilder {
    private driver;
    private selectColumns;
    private fromTable;
    private joins;
    private whereConditions;
    private orderByClauses;
    private groupByColumns;
    private havingClause;
    private limitValue?;
    private offsetValue?;
    private insertTable;
    private insertData;
    private updateTable;
    private updateData;
    private deleteTable;
    private operation;
    private params;
    private driverType;
    private softDeleteColumn?;
    private trashedMode;
    constructor(driver: BaseDriver, driverType?: string);
    select(...columns: string[]): QueryBuilder;
    from(table: string): QueryBuilder;
    join(table: string, on: string, type?: JoinType): QueryBuilder;
    leftJoin(table: string, on: string): QueryBuilder;
    rightJoin(table: string, on: string): QueryBuilder;
    /**
     * `.where('age', '>', 18)`, `.where('id', 1)` (shorthand for `=`), or a
     * parenthesised group: `.where(qb => qb.where('a', 1).orWhere('b', 2))`.
     */
    where(callback: (qb: QueryBuilder) => unknown): QueryBuilder;
    where(column: string, operatorOrValue: WhereOperator | unknown, value?: unknown): QueryBuilder;
    orWhere(callback: (qb: QueryBuilder) => unknown): QueryBuilder;
    orWhere(column: string, operatorOrValue: WhereOperator | unknown, value?: unknown): QueryBuilder;
    whereIn(column: string, values: unknown[]): QueryBuilder;
    whereNotIn(column: string, values: unknown[]): QueryBuilder;
    whereNull(column: string): QueryBuilder;
    whereNotNull(column: string): QueryBuilder;
    whereBetween(column: string, min: unknown, max: unknown): QueryBuilder;
    whereNotBetween(column: string, min: unknown, max: unknown): QueryBuilder;
    whereLike(column: string, pattern: string): QueryBuilder;
    private addWhere;
    private pushCondition;
    /** Scope queries to a soft-delete column (BaseRepository does this for @DeletedAt entities). */
    useSoftDeletes(column?: string): QueryBuilder;
    /** Include soft-deleted rows. */
    withTrashed(): QueryBuilder;
    /** Only soft-deleted rows. */
    onlyTrashed(): QueryBuilder;
    orderBy(column: string, direction?: 'ASC' | 'DESC'): QueryBuilder;
    groupBy(...columns: string[]): QueryBuilder;
    having(clause: string): QueryBuilder;
    limit(value: number): QueryBuilder;
    offset(value: number): QueryBuilder;
    /**
     * Build an INSERT query.
     *
     * Usage:
     *   await db.insert('users', { name: 'Tariq', email: 'tariq@@axiljs.dev' })
     */
    insert(table: string, data: Record<string, unknown> | Record<string, unknown>[]): QueryBuilder;
    /**
     * Build an UPDATE query.
     *
     * Usage:
     *   await db.update('users').set({ name: 'New Name' }).where('id', 1)
     */
    update(table: string): QueryBuilder;
    set(data: Record<string, unknown>): QueryBuilder;
    /**
     * Build a DELETE query.
     *
     * Usage:
     *   await db.delete('users').where('id', 1)
     */
    delete(table: string): QueryBuilder;
    /**
     * Build the SQL string and parameter array.
     * Called internally by execute().
     */
    toSQL(): {
        sql: string;
        params: unknown[];
    };
    /**
     * Execute the built query and return results.
     */
    execute<T = Record<string, unknown>>(): Promise<import("../types").QueryResult<T>>;
    /**
     * Execute and return first row only.
     */
    first<T = Record<string, unknown>>(): Promise<T | null>;
    /**
     * Execute and return all rows.
     */
    all<T = Record<string, unknown>>(): Promise<T[]>;
    /**
     * Execute and return count.
     */
    count(column?: string): Promise<number>;
    private buildSelect;
    private buildInsert;
    private buildUpdate;
    private buildDelete;
    private buildWhere;
    private softDeleteScope;
    private buildConditions;
    private buildCondition;
    /**
     * Get the next parameter placeholder.
     * PostgreSQL uses $1, $2, $3...
     * MySQL and SQLite use ?, ?, ?...
     */
    private placeholder;
}
//# sourceMappingURL=query-builder.d.ts.map