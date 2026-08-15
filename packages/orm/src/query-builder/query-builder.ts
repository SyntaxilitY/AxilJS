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

  where(
    column: string,
    operatorOrValue: WhereOperator | unknown,
    value?: unknown
  ): QueryBuilder {
    // Support shorthand: .where('id', 1) → .where('id', '=', 1)
    if (value === undefined && operatorOrValue !== 'IS NULL' && operatorOrValue !== 'IS NOT NULL') {
      this.whereConditions.push({
        column,
        operator: '=',
        value: operatorOrValue
      });
    } else {
      this.whereConditions.push({
        column,
        operator: operatorOrValue as WhereOperator,
        value
      });
    }
    return this;
  }

  whereIn(column: string, values: unknown[]): QueryBuilder {
    this.whereConditions.push({ column, operator: 'IN', values });
    return this;
  }

  whereNull(column: string): QueryBuilder {
    this.whereConditions.push({ column, operator: 'IS NULL' });
    return this;
  }

  whereNotNull(column: string): QueryBuilder {
    this.whereConditions.push({ column, operator: 'IS NOT NULL' });
    return this;
  }

  whereBetween(column: string, min: unknown, max: unknown): QueryBuilder {
    this.whereConditions.push({ column, operator: 'BETWEEN', values: [min, max] });
    return this;
  }

  // ─── ORDER, GROUP, LIMIT ──────────────────────────────────────────────────────

  orderBy(column: string, direction: 'ASC' | 'DESC' = 'ASC'): QueryBuilder {
    this.orderByClauses.push({ column, direction });
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
    this.selectColumns = [`COUNT(${column}) as count`];
    const result = await this.execute<{ count: string }>();
    return parseInt(result.rows[0]?.count || '0', 10);
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
    if (this.whereConditions.length === 0) return '';

    return this.whereConditions
      .map(condition => {
        switch (condition.operator) {
          case 'IS NULL':
            return `${condition.column} IS NULL`;

          case 'IS NOT NULL':
            return `${condition.column} IS NOT NULL`;

          case 'IN':
          case 'NOT IN': {
            const placeholders = (condition.values || []).map(v => {
              this.params.push(v);
              return this.placeholder();
            });
            return `${condition.column} ${condition.operator} (${placeholders.join(', ')})`;
          }

          case 'BETWEEN': {
            const [min, max] = condition.values || [];
            this.params.push(min);
            const p1 = this.placeholder();
            this.params.push(max);
            const p2 = this.placeholder();
            return `${condition.column} BETWEEN ${p1} AND ${p2}`;
          }

          default: {
            this.params.push(condition.value);
            return `${condition.column} ${condition.operator} ${this.placeholder()}`;
          }
        }
      })
      .join(' AND ');
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