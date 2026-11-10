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
import {
  WhereCondition,
  OrderByClause,
  JoinClause,
  JoinType,
  WhereOperator
} from '../types';
import {
  assertSafeIdentifier,
  assertSortDirection,
  assertWhereOperator
} from '../query/identifier';

export class QueryBuilder {
  private driver: BaseDriver;

  // SELECT columns
  private selectColumns: string[] = [];

  // FROM table
  private fromTable: string = '';

  // JOIN clauses
  private joins: JoinClause[] = [];

  // WHERE conditions
  private whereConditions: WhereCondition[] = [];

  // ORDER BY clauses
  private orderByClauses: OrderByClause[] = [];

  // GROUP BY columns
  private groupByColumns: string[] = [];

  // HAVING clause (raw SQL)
  private havingClause: string = '';

  // LIMIT and OFFSET
  private limitValue?: number;
  private offsetValue?: number;

  // For INSERT
  private insertTable: string = '';
  private insertData: Record<string, unknown>[] = [];

  // For UPDATE
  private updateTable: string = '';
  private updateData: Record<string, unknown> = {};

  // For DELETE
  private deleteTable: string = '';

  // Operation type
  private operation: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' = 'SELECT';

  // Collected parameter values (prevents SQL injection)
  private params: unknown[] = [];

  // Driver type affects placeholder syntax ($ vs ?)
  private driverType: string;

  // Soft deletes: column + which rows to see (set by BaseRepository for @DeletedAt entities)
  private softDeleteColumn?: string;
  private trashedMode: 'exclude' | 'include' | 'only' = 'exclude';

  constructor(driver: BaseDriver, driverType: string = 'sqlite') {
    this.driver = driver;
    this.driverType = driverType;
  }

  // ─── SELECT ──────────────────────────────────────────────────────────────────

  select(...columns: string[]): QueryBuilder {
    this.operation = 'SELECT';
    this.selectColumns = columns.length > 0 ? columns : ['*'];
    return this;
  }

  from(table: string): QueryBuilder {
    this.fromTable = table;
    return this;
  }

  // ─── JOINs ───────────────────────────────────────────────────────────────────

  join(table: string, on: string, type: JoinType = 'INNER'): QueryBuilder {
    this.joins.push({ type, table, on });
    return this;
  }

  leftJoin(table: string, on: string): QueryBuilder {
    return this.join(table, on, 'LEFT');
  }

  rightJoin(table: string, on: string): QueryBuilder {
    return this.join(table, on, 'RIGHT');
  }

  // ─── WHERE ───────────────────────────────────────────────────────────────────

  /**
   * `.where('age', '>', 18)`, `.where('id', 1)` (shorthand for `=`), or a
   * parenthesised group: `.where(qb => qb.where('a', 1).orWhere('b', 2))`.
   */
  where(callback: (qb: QueryBuilder) => unknown): QueryBuilder;
  where(column: string, operatorOrValue: WhereOperator | unknown, value?: unknown): QueryBuilder;
  where(
    column: string | ((qb: QueryBuilder) => unknown),
    operatorOrValue?: WhereOperator | unknown,
    value?: unknown
  ): QueryBuilder {
    return this.addWhere('AND', column, operatorOrValue, value);
  }

  orWhere(callback: (qb: QueryBuilder) => unknown): QueryBuilder;
  orWhere(column: string, operatorOrValue: WhereOperator | unknown, value?: unknown): QueryBuilder;
  orWhere(
    column: string | ((qb: QueryBuilder) => unknown),
    operatorOrValue?: WhereOperator | unknown,
    value?: unknown
  ): QueryBuilder {
    return this.addWhere('OR', column, operatorOrValue, value);
  }

  whereIn(column: string, values: unknown[]): QueryBuilder {
    return this.pushCondition({ column, operator: 'IN', values });
  }

  whereNotIn(column: string, values: unknown[]): QueryBuilder {
    return this.pushCondition({ column, operator: 'NOT IN', values });
  }

  whereNull(column: string): QueryBuilder {
    return this.pushCondition({ column, operator: 'IS NULL' });
  }

  whereNotNull(column: string): QueryBuilder {
    return this.pushCondition({ column, operator: 'IS NOT NULL' });
  }

  whereBetween(column: string, min: unknown, max: unknown): QueryBuilder {
    return this.pushCondition({ column, operator: 'BETWEEN', values: [min, max] });
  }

  whereNotBetween(column: string, min: unknown, max: unknown): QueryBuilder {
    return this.pushCondition({ column, operator: 'NOT BETWEEN', values: [min, max] });
  }

  whereLike(column: string, pattern: string): QueryBuilder {
    return this.pushCondition({ column, operator: 'LIKE', value: pattern });
  }

  private addWhere(
    conjunction: 'AND' | 'OR',
    column: string | ((qb: QueryBuilder) => unknown),
    operatorOrValue: WhereOperator | unknown,
    value: unknown
  ): QueryBuilder {
    if (typeof column === 'function') {
      const nested = new QueryBuilder(this.driver, this.driverType);
      column(nested);
      this.whereConditions.push({
        column: '',
        operator: '=',
        group: nested.whereConditions,
        conjunction
      });
      return this;
    }

    // Support shorthand: .where('id', 1) → .where('id', '=', 1)
    if (value === undefined && operatorOrValue !== 'IS NULL' && operatorOrValue !== 'IS NOT NULL') {
      return this.pushCondition({ column, operator: '=', value: operatorOrValue, conjunction });
    }
    return this.pushCondition({
      column,
      operator: assertWhereOperator(operatorOrValue) as WhereOperator,
      value,
      conjunction
    });
  }

  private pushCondition(condition: WhereCondition): QueryBuilder {
    assertSafeIdentifier(condition.column, 'column');
    this.whereConditions.push(condition);
    return this;
  }

  // ─── SOFT DELETES ────────────────────────────────────────────────────────────

  /** Scope queries to a soft-delete column (BaseRepository does this for @DeletedAt entities). */
  useSoftDeletes(column: string = 'deleted_at'): QueryBuilder {
    this.softDeleteColumn = assertSafeIdentifier(column, 'soft-delete column');
    return this;
  }

  /** Include soft-deleted rows. */
  withTrashed(): QueryBuilder {
    this.trashedMode = 'include';
    return this;
  }

  /** Only soft-deleted rows. */
  onlyTrashed(): QueryBuilder {
    this.trashedMode = 'only';
    return this;
  }

  // ─── ORDER, GROUP, LIMIT ──────────────────────────────────────────────────────

  orderBy(column: string, direction: 'ASC' | 'DESC' = 'ASC'): QueryBuilder {
    // Sort keys often come from the query string — validate both parts
    this.orderByClauses.push({
      column: assertSafeIdentifier(column, 'ORDER BY column'),
      direction: assertSortDirection(direction)
    });
    return this;
  }

  groupBy(...columns: string[]): QueryBuilder {
    this.groupByColumns = columns;
    return this;
  }

  having(clause: string): QueryBuilder {
    this.havingClause = clause;
    return this;
  }

  limit(value: number): QueryBuilder {
    this.limitValue = value;
    return this;
  }

  offset(value: number): QueryBuilder {
    this.offsetValue = value;
    return this;
  }

  // ─── INSERT ───────────────────────────────────────────────────────────────────

  /**
   * Build an INSERT query.
   *
   * Usage:
   *   await db.insert('users', { name: 'Tariq', email: 'tariq@@axiljs.dev' })
   */
  insert(table: string, data: Record<string, unknown> | Record<string, unknown>[]): QueryBuilder {
    this.operation = 'INSERT';
    this.insertTable = table;
    this.insertData = Array.isArray(data) ? data : [data];
    return this;
  }

  // ─── UPDATE ───────────────────────────────────────────────────────────────────

  /**
   * Build an UPDATE query.
   *
   * Usage:
   *   await db.update('users').set({ name: 'New Name' }).where('id', 1)
   */
  update(table: string): QueryBuilder {
    this.operation = 'UPDATE';
    this.updateTable = table;
    return this;
  }

  set(data: Record<string, unknown>): QueryBuilder {
    this.updateData = data;
    return this;
  }

  // ─── DELETE ───────────────────────────────────────────────────────────────────

  /**
   * Build a DELETE query.
   *
   * Usage:
   *   await db.delete('users').where('id', 1)
   */
  delete(table: string): QueryBuilder {
    this.operation = 'DELETE';
    this.deleteTable = table;
    return this;
  }

  // ─── Build & Execute ──────────────────────────────────────────────────────────

  /**
   * Build the SQL string and parameter array.
   * Called internally by execute().
   */
  toSQL(): { sql: string; params: unknown[] } {
    this.params = [];

    switch (this.operation) {
      case 'SELECT':  return this.buildSelect();
      case 'INSERT':  return this.buildInsert();
      case 'UPDATE':  return this.buildUpdate();
      case 'DELETE':  return this.buildDelete();
    }
  }

  /**
   * Execute the built query and return results.
   */
  async execute<T = Record<string, unknown>>() {
    const { sql, params } = this.toSQL();
    return this.driver.query<T>(sql, params);
  }

  /**
   * Execute and return first row only.
   */
  async first<T = Record<string, unknown>>(): Promise<T | null> {
    this.limitValue = 1;
    const result = await this.execute<T>();
    return result.rows[0] || null;
  }

  /**
   * Execute and return all rows.
   */
  async all<T = Record<string, unknown>>(): Promise<T[]> {
    const result = await this.execute<T>();
    return result.rows;
  }

  /**
   * Execute and return count.
   */
  async count(column: string = '*'): Promise<number> {
    // Don't leave the builder mutated, and drop ORDER BY (Postgres rejects
    // ordering by a non-aggregated column in an aggregate query)
    const selects = this.selectColumns;
    const orders = this.orderByClauses;
    this.selectColumns = [`COUNT(${column}) as count`];
    this.orderByClauses = [];
    try {
      const result = await this.execute<{ count: string }>();
      return parseInt(String(result.rows[0]?.count ?? '0'), 10);
    } finally {
      this.selectColumns = selects;
      this.orderByClauses = orders;
    }
  }

  // ─── SQL Builders ─────────────────────────────────────────────────────────────

  private buildSelect(): { sql: string; params: unknown[] } {
    let sql = `SELECT ${this.selectColumns.join(', ')} FROM ${this.fromTable}`;

    // JOINs
    for (const join of this.joins) {
      sql += ` ${join.type} JOIN ${join.table} ON ${join.on}`;
    }

    // WHERE
    const whereClause = this.buildWhere();
    if (whereClause) sql += ` WHERE ${whereClause}`;

    // GROUP BY
    if (this.groupByColumns.length > 0) {
      sql += ` GROUP BY ${this.groupByColumns.join(', ')}`;
    }

    // HAVING
    if (this.havingClause) {
      sql += ` HAVING ${this.havingClause}`;
    }

    // ORDER BY
    if (this.orderByClauses.length > 0) {
      const orderParts = this.orderByClauses.map(
        o => `${o.column} ${o.direction}`
      );
      sql += ` ORDER BY ${orderParts.join(', ')}`;
    }

    // LIMIT / OFFSET
    if (this.limitValue !== undefined) {
      sql += ` LIMIT ${this.limitValue}`;
    } else if (this.offsetValue !== undefined && this.driverType !== 'postgres') {
      // MySQL / SQLite reject OFFSET without LIMIT
      sql += this.driverType === 'mysql' ? ' LIMIT 18446744073709551615' : ' LIMIT -1';
    }
    if (this.offsetValue !== undefined) {
      sql += ` OFFSET ${this.offsetValue}`;
    }

    return { sql, params: this.params };
  }

  private buildInsert(): { sql: string; params: unknown[] } {
    const firstRow = this.insertData[0];
    const columns = Object.keys(firstRow);

    const placeholders = this.insertData.map(row => {
      const rowPlaceholders = columns.map(col => {
        this.params.push(row[col]);
        return this.placeholder();
      });
      return `(${rowPlaceholders.join(', ')})`;
    });

    const sql =
      `INSERT INTO ${this.insertTable} (${columns.join(', ')}) ` +
      `VALUES ${placeholders.join(', ')}`;

    // PostgreSQL supports RETURNING for getting the inserted row
    const finalSql =
      this.driverType === 'postgres' ? sql + ' RETURNING *' : sql;

    return { sql: finalSql, params: this.params };
  }

  private buildUpdate(): { sql: string; params: unknown[] } {
    const setClauses = Object.keys(this.updateData).map(col => {
      this.params.push(this.updateData[col]);
      return `${col} = ${this.placeholder()}`;
    });

    let sql = `UPDATE ${this.updateTable} SET ${setClauses.join(', ')}`;

    const whereClause = this.buildWhere();
    if (whereClause) sql += ` WHERE ${whereClause}`;

    return { sql, params: this.params };
  }

  private buildDelete(): { sql: string; params: unknown[] } {
    let sql = `DELETE FROM ${this.deleteTable}`;

    const whereClause = this.buildWhere();
    if (whereClause) sql += ` WHERE ${whereClause}`;

    return { sql, params: this.params };
  }

  private buildWhere(): string {
    let conditions = this.buildConditions(this.whereConditions);

    // Soft-delete scope — user conditions are parenthesised so an OR inside
    // them cannot escape the scope
    const scope = this.softDeleteScope();
    if (scope) conditions = conditions ? `(${conditions}) AND ${scope}` : scope;

    return conditions;
  }

  private softDeleteScope(): string {
    if (!this.softDeleteColumn || this.trashedMode === 'include') return '';
    const col = this.joins.length && this.fromTable && !this.softDeleteColumn.includes('.')
      ? `${this.fromTable}.${this.softDeleteColumn}`
      : this.softDeleteColumn;
    return this.trashedMode === 'only' ? `${col} IS NOT NULL` : `${col} IS NULL`;
  }

  private buildConditions(list: WhereCondition[]): string {
    const parts: string[] = [];
    for (const condition of list) {
      const sql = this.buildCondition(condition);
      if (!sql) continue; // e.g. an empty group
      parts.push(parts.length === 0 ? sql : `${condition.conjunction ?? 'AND'} ${sql}`);
    }
    return parts.join(' ');
  }

  private buildCondition(condition: WhereCondition): string {
    if (condition.group) {
      const inner = this.buildConditions(condition.group);
      return inner ? `(${inner})` : '';
    }

    switch (condition.operator) {
      case 'IS NULL':
        return `${condition.column} IS NULL`;

      case 'IS NOT NULL':
        return `${condition.column} IS NOT NULL`;

      case 'IN':
      case 'NOT IN': {
        // .where(col, 'IN', [...]) stores the list in `value`
        const values = condition.values ?? (Array.isArray(condition.value) ? condition.value : undefined);
        // `IN ()` is a syntax error — empty IN matches nothing, empty NOT IN matches everything
        if (!values || values.length === 0) {
          return condition.operator === 'IN' ? '1 = 0' : '1 = 1';
        }
        const placeholders = values.map(v => {
          this.params.push(v);
          return this.placeholder();
        });
        return `${condition.column} ${condition.operator} (${placeholders.join(', ')})`;
      }

      case 'BETWEEN':
      case 'NOT BETWEEN': {
        const [min, max] = condition.values ?? (Array.isArray(condition.value) ? condition.value : []);
        this.params.push(min);
        const p1 = this.placeholder();
        this.params.push(max);
        const p2 = this.placeholder();
        return `${condition.column} ${condition.operator} ${p1} AND ${p2}`;
      }

      default: {
        // `col = NULL` never matches in SQL — translate to IS [NOT] NULL
        if (condition.value === null && condition.operator === '=') {
          return `${condition.column} IS NULL`;
        }
        if (condition.value === null && (condition.operator === '!=' || condition.operator === '<>')) {
          return `${condition.column} IS NOT NULL`;
        }
        this.params.push(condition.value);
        return `${condition.column} ${condition.operator} ${this.placeholder()}`;
      }
    }
  }

  /**
   * Get the next parameter placeholder.
   * PostgreSQL uses $1, $2, $3...
   * MySQL and SQLite use ?, ?, ?...
   */
  private placeholder(): string {
    return this.driverType === 'postgres'
      ? `$${this.params.length}`
      : '?';
  }
}