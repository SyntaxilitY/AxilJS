"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueryBuilder = void 0;
const identifier_1 = require("../query/identifier");
class QueryBuilder {
    driver;
    // SELECT columns
    selectColumns = [];
    // FROM table
    fromTable = '';
    // JOIN clauses
    joins = [];
    // WHERE conditions
    whereConditions = [];
    // ORDER BY clauses
    orderByClauses = [];
    // GROUP BY columns
    groupByColumns = [];
    // HAVING clause (raw SQL)
    havingClause = '';
    // LIMIT and OFFSET
    limitValue;
    offsetValue;
    // For INSERT
    insertTable = '';
    insertData = [];
    // For UPDATE
    updateTable = '';
    updateData = {};
    // For DELETE
    deleteTable = '';
    // Operation type
    operation = 'SELECT';
    // Collected parameter values (prevents SQL injection)
    params = [];
    // Driver type affects placeholder syntax ($ vs ?)
    driverType;
    // Soft deletes: column + which rows to see (set by BaseRepository for @DeletedAt entities)
    softDeleteColumn;
    trashedMode = 'exclude';
    constructor(driver, driverType = 'sqlite') {
        this.driver = driver;
        this.driverType = driverType;
    }
    // ─── SELECT ──────────────────────────────────────────────────────────────────
    select(...columns) {
        this.operation = 'SELECT';
        this.selectColumns = columns.length > 0 ? columns : ['*'];
        return this;
    }
    from(table) {
        this.fromTable = table;
        return this;
    }
    // ─── JOINs ───────────────────────────────────────────────────────────────────
    join(table, on, type = 'INNER') {
        this.joins.push({ type, table, on });
        return this;
    }
    leftJoin(table, on) {
        return this.join(table, on, 'LEFT');
    }
    rightJoin(table, on) {
        return this.join(table, on, 'RIGHT');
    }
    where(column, operatorOrValue, value) {
        return this.addWhere('AND', column, operatorOrValue, value);
    }
    orWhere(column, operatorOrValue, value) {
        return this.addWhere('OR', column, operatorOrValue, value);
    }
    whereIn(column, values) {
        return this.pushCondition({ column, operator: 'IN', values });
    }
    whereNotIn(column, values) {
        return this.pushCondition({ column, operator: 'NOT IN', values });
    }
    whereNull(column) {
        return this.pushCondition({ column, operator: 'IS NULL' });
    }
    whereNotNull(column) {
        return this.pushCondition({ column, operator: 'IS NOT NULL' });
    }
    whereBetween(column, min, max) {
        return this.pushCondition({ column, operator: 'BETWEEN', values: [min, max] });
    }
    whereNotBetween(column, min, max) {
        return this.pushCondition({ column, operator: 'NOT BETWEEN', values: [min, max] });
    }
    whereLike(column, pattern) {
        return this.pushCondition({ column, operator: 'LIKE', value: pattern });
    }
    addWhere(conjunction, column, operatorOrValue, value) {
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
            operator: (0, identifier_1.assertWhereOperator)(operatorOrValue),
            value,
            conjunction
        });
    }
    pushCondition(condition) {
        (0, identifier_1.assertSafeIdentifier)(condition.column, 'column');
        this.whereConditions.push(condition);
        return this;
    }
    // ─── SOFT DELETES ────────────────────────────────────────────────────────────
    /** Scope queries to a soft-delete column (BaseRepository does this for @DeletedAt entities). */
    useSoftDeletes(column = 'deleted_at') {
        this.softDeleteColumn = (0, identifier_1.assertSafeIdentifier)(column, 'soft-delete column');
        return this;
    }
    /** Include soft-deleted rows. */
    withTrashed() {
        this.trashedMode = 'include';
        return this;
    }
    /** Only soft-deleted rows. */
    onlyTrashed() {
        this.trashedMode = 'only';
        return this;
    }
    // ─── ORDER, GROUP, LIMIT ──────────────────────────────────────────────────────
    orderBy(column, direction = 'ASC') {
        // Sort keys often come from the query string — validate both parts
        this.orderByClauses.push({
            column: (0, identifier_1.assertSafeIdentifier)(column, 'ORDER BY column'),
            direction: (0, identifier_1.assertSortDirection)(direction)
        });
        return this;
    }
    groupBy(...columns) {
        this.groupByColumns = columns;
        return this;
    }
    having(clause) {
        this.havingClause = clause;
        return this;
    }
    limit(value) {
        this.limitValue = value;
        return this;
    }
    offset(value) {
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
    insert(table, data) {
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
    update(table) {
        this.operation = 'UPDATE';
        this.updateTable = table;
        return this;
    }
    set(data) {
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
    delete(table) {
        this.operation = 'DELETE';
        this.deleteTable = table;
        return this;
    }
    // ─── Build & Execute ──────────────────────────────────────────────────────────
    /**
     * Build the SQL string and parameter array.
     * Called internally by execute().
     */
    toSQL() {
        this.params = [];
        switch (this.operation) {
            case 'SELECT': return this.buildSelect();
            case 'INSERT': return this.buildInsert();
            case 'UPDATE': return this.buildUpdate();
            case 'DELETE': return this.buildDelete();
        }
    }
    /**
     * Execute the built query and return results.
     */
    async execute() {
        const { sql, params } = this.toSQL();
        return this.driver.query(sql, params);
    }
    /**
     * Execute and return first row only.
     */
    async first() {
        this.limitValue = 1;
        const result = await this.execute();
        return result.rows[0] || null;
    }
    /**
     * Execute and return all rows.
     */
    async all() {
        const result = await this.execute();
        return result.rows;
    }
    /**
     * Execute and return count.
     */
    async count(column = '*') {
        // Don't leave the builder mutated, and drop ORDER BY (Postgres rejects
        // ordering by a non-aggregated column in an aggregate query)
        const selects = this.selectColumns;
        const orders = this.orderByClauses;
        this.selectColumns = [`COUNT(${column}) as count`];
        this.orderByClauses = [];
        try {
            const result = await this.execute();
            return parseInt(String(result.rows[0]?.count ?? '0'), 10);
        }
        finally {
            this.selectColumns = selects;
            this.orderByClauses = orders;
        }
    }
    // ─── SQL Builders ─────────────────────────────────────────────────────────────
    buildSelect() {
        let sql = `SELECT ${this.selectColumns.join(', ')} FROM ${this.fromTable}`;
        // JOINs
        for (const join of this.joins) {
            sql += ` ${join.type} JOIN ${join.table} ON ${join.on}`;
        }
        // WHERE
        const whereClause = this.buildWhere();
        if (whereClause)
            sql += ` WHERE ${whereClause}`;
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
            const orderParts = this.orderByClauses.map(o => `${o.column} ${o.direction}`);
            sql += ` ORDER BY ${orderParts.join(', ')}`;
        }
        // LIMIT / OFFSET
        if (this.limitValue !== undefined) {
            sql += ` LIMIT ${this.limitValue}`;
        }
        else if (this.offsetValue !== undefined && this.driverType !== 'postgres') {
            // MySQL / SQLite reject OFFSET without LIMIT
            sql += this.driverType === 'mysql' ? ' LIMIT 18446744073709551615' : ' LIMIT -1';
        }
        if (this.offsetValue !== undefined) {
            sql += ` OFFSET ${this.offsetValue}`;
        }
        return { sql, params: this.params };
    }
    buildInsert() {
        const firstRow = this.insertData[0];
        const columns = Object.keys(firstRow);
        const placeholders = this.insertData.map(row => {
            const rowPlaceholders = columns.map(col => {
                this.params.push(row[col]);
                return this.placeholder();
            });
            return `(${rowPlaceholders.join(', ')})`;
        });
        const sql = `INSERT INTO ${this.insertTable} (${columns.join(', ')}) ` +
            `VALUES ${placeholders.join(', ')}`;
        // PostgreSQL supports RETURNING for getting the inserted row
        const finalSql = this.driverType === 'postgres' ? sql + ' RETURNING *' : sql;
        return { sql: finalSql, params: this.params };
    }
    buildUpdate() {
        const setClauses = Object.keys(this.updateData).map(col => {
            this.params.push(this.updateData[col]);
            return `${col} = ${this.placeholder()}`;
        });
        let sql = `UPDATE ${this.updateTable} SET ${setClauses.join(', ')}`;
        const whereClause = this.buildWhere();
        if (whereClause)
            sql += ` WHERE ${whereClause}`;
        return { sql, params: this.params };
    }
    buildDelete() {
        let sql = `DELETE FROM ${this.deleteTable}`;
        const whereClause = this.buildWhere();
        if (whereClause)
            sql += ` WHERE ${whereClause}`;
        return { sql, params: this.params };
    }
    buildWhere() {
        let conditions = this.buildConditions(this.whereConditions);
        // Soft-delete scope — user conditions are parenthesised so an OR inside
        // them cannot escape the scope
        const scope = this.softDeleteScope();
        if (scope)
            conditions = conditions ? `(${conditions}) AND ${scope}` : scope;
        return conditions;
    }
    softDeleteScope() {
        if (!this.softDeleteColumn || this.trashedMode === 'include')
            return '';
        const col = this.joins.length && this.fromTable && !this.softDeleteColumn.includes('.')
            ? `${this.fromTable}.${this.softDeleteColumn}`
            : this.softDeleteColumn;
        return this.trashedMode === 'only' ? `${col} IS NOT NULL` : `${col} IS NULL`;
    }
    buildConditions(list) {
        const parts = [];
        for (const condition of list) {
            const sql = this.buildCondition(condition);
            if (!sql)
                continue; // e.g. an empty group
            parts.push(parts.length === 0 ? sql : `${condition.conjunction ?? 'AND'} ${sql}`);
        }
        return parts.join(' ');
    }
    buildCondition(condition) {
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
    placeholder() {
        return this.driverType === 'postgres'
            ? `$${this.params.length}`
            : '?';
    }
}
exports.QueryBuilder = QueryBuilder;
//# sourceMappingURL=query-builder.js.map