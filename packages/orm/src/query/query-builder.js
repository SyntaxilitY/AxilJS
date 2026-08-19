"use strict";
/**
 * AxilORM — Query Builder
 *
 * Fluent, chainable, driver-aware query builder.
 * Faster than Prisma/TypeORM because:
 *   - No reflection overhead
 *   - Zero-copy result mapping
 *   - Lazy SQL compilation
 *   - Direct driver pass-through
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.QueryBuilder = void 0;
class QueryBuilder {
    driver;
    driverType;
    _table = '';
    _selects = ['*'];
    _wheres = [];
    _joins = [];
    _orders = [];
    _groupBy = [];
    _having = '';
    _limit;
    _offset;
    _params = [];
    _paramIdx = 1;
    constructor(driver, driverType) {
        this.driver = driver;
        this.driverType = driverType;
    }
    // ── Table ─────────────────────────────────────────────────────────
    from(table) {
        this._table = table;
        return this;
    }
    table(table) {
        return this.from(table);
    }
    // ── Select ────────────────────────────────────────────────────────
    select(...columns) {
        this._selects = columns;
        return this;
    }
    addSelect(...columns) {
        this._selects.push(...columns);
        return this;
    }
    // ── Where ─────────────────────────────────────────────────────────
    where(column, operator, value) {
        this._wheres.push({ column, operator, value, conjunction: 'AND' });
        return this;
    }
    orWhere(column, operator, value) {
        this._wheres.push({ column, operator, value, conjunction: 'OR' });
        return this;
    }
    whereRaw(raw) {
        this._wheres.push({ column: '', operator: '=', raw, conjunction: 'AND' });
        return this;
    }
    whereIn(column, values) {
        this._wheres.push({ column, operator: 'IN', value: values, conjunction: 'AND' });
        return this;
    }
    whereNull(column) {
        this._wheres.push({ column, operator: 'IS NULL', conjunction: 'AND' });
        return this;
    }
    whereNotNull(column) {
        this._wheres.push({ column, operator: 'IS NOT NULL', conjunction: 'AND' });
        return this;
    }
    // ── Join ──────────────────────────────────────────────────────────
    join(table, on, type = 'INNER') {
        this._joins.push({ type, table, on });
        return this;
    }
    leftJoin(table, on) {
        return this.join(table, on, 'LEFT');
    }
    rightJoin(table, on) {
        return this.join(table, on, 'RIGHT');
    }
    // ── Order / Group / Limit ─────────────────────────────────────────
    orderBy(column, direction = 'ASC') {
        this._orders.push({ column, direction });
        return this;
    }
    groupBy(...columns) {
        this._groupBy.push(...columns);
        return this;
    }
    having(condition) {
        this._having = condition;
        return this;
    }
    limit(n) {
        this._limit = n;
        return this;
    }
    offset(n) {
        this._offset = n;
        return this;
    }
    // ── Pagination shortcut ───────────────────────────────────────────
    paginate(page, perPage) {
        return this.limit(perPage).offset((page - 1) * perPage);
    }
    // ── SQL Compilation ───────────────────────────────────────────────
    nextParam(value) {
        this._params.push(value);
        if (this.driverType === 'postgres') {
            return `$${this._paramIdx++}`;
        }
        return '?';
    }
    compileWheres() {
        if (this._wheres.length === 0)
            return '';
        const parts = this._wheres.map((w, i) => {
            const prefix = i === 0 ? 'WHERE' : w.conjunction;
            if (w.raw)
                return `${prefix} ${w.raw}`;
            if (w.operator === 'IS NULL')
                return `${prefix} ${w.column} IS NULL`;
            if (w.operator === 'IS NOT NULL')
                return `${prefix} ${w.column} IS NOT NULL`;
            if (w.operator === 'IN' || w.operator === 'NOT IN') {
                const values = w.value;
                const placeholders = values.map(v => this.nextParam(v)).join(', ');
                return `${prefix} ${w.column} ${w.operator} (${placeholders})`;
            }
            const ph = this.nextParam(w.value);
            return `${prefix} ${w.column} ${w.operator} ${ph}`;
        });
        return parts.join(' ');
    }
    toSQL() {
        this._params = [];
        this._paramIdx = 1;
        const selects = this._selects.join(', ');
        const joins = this._joins
            .map(j => `${j.type} JOIN ${j.table} ON ${j.on}`)
            .join(' ');
        const wheres = this.compileWheres();
        const groups = this._groupBy.length
            ? `GROUP BY ${this._groupBy.join(', ')}`
            : '';
        const having = this._having ? `HAVING ${this._having}` : '';
        const orders = this._orders.length
            ? `ORDER BY ${this._orders.map(o => `${o.column} ${o.direction}`).join(', ')}`
            : '';
        const limit = this._limit !== undefined ? `LIMIT ${this._limit}` : '';
        const offset = this._offset !== undefined ? `OFFSET ${this._offset}` : '';
        const sql = [
            `SELECT ${selects}`,
            `FROM ${this._table}`,
            joins, wheres, groups, having, orders, limit, offset
        ]
            .filter(Boolean)
            .join(' ')
            .trim();
        return { sql, params: [...this._params] };
    }
    // ── Execute ───────────────────────────────────────────────────────
    async get() {
        const { sql, params } = this.toSQL();
        const result = await this.driver.query(sql, params);
        return result.rows;
    }
    async first() {
        this.limit(1);
        const rows = await this.get();
        return rows[0] ?? null;
    }
    async firstOrFail() {
        const row = await this.first();
        if (!row)
            throw new Error(`No record found in ${this._table}`);
        return row;
    }
    async count() {
        const original = [...this._selects];
        this._selects = ['COUNT(*) AS _count'];
        const rows = await this.get();
        this._selects = original;
        return Number(rows[0]?._count ?? 0);
    }
    async exists() {
        return (await this.count()) > 0;
    }
    async pluck(column) {
        this._selects = [String(column)];
        const rows = await this.get();
        return rows.map(r => r[column]);
    }
    // ── Insert ────────────────────────────────────────────────────────
    async insert(data) {
        const keys = Object.keys(data);
        const values = Object.values(data);
        this._params = [];
        this._paramIdx = 1;
        const placeholders = values.map(v => this.nextParam(v)).join(', ');
        const columns = keys.join(', ');
        const returning = this.driverType === 'postgres' ? 'RETURNING *' : '';
        const sql = `INSERT INTO ${this._table} (${columns}) VALUES (${placeholders}) ${returning}`.trim();
        const result = await this.driver.query(sql, this._params);
        if (this.driverType === 'postgres') {
            return result.rows[0];
        }
        // MySQL / SQLite: fetch the inserted row
        const lastId = result.lastInsertRowid ?? result.insertId;
        const fetched = await this.driver.query(`SELECT * FROM ${this._table} WHERE id = ${this.nextParam(lastId)}`, [lastId]);
        return fetched.rows[0];
    }
    // ── Insert Many ───────────────────────────────────────────────────
    async insertMany(rows) {
        if (rows.length === 0)
            return 0;
        this._params = [];
        this._paramIdx = 1;
        const keys = Object.keys(rows[0]);
        const valueGroups = rows.map(row => {
            const phs = Object.values(row).map(v => this.nextParam(v));
            return `(${phs.join(', ')})`;
        });
        const sql = `INSERT INTO ${this._table} (${keys.join(', ')}) VALUES ${valueGroups.join(', ')}`;
        await this.driver.query(sql, this._params);
        return rows.length;
    }
    // ── Update ────────────────────────────────────────────────────────
    async update(data) {
        this._params = [];
        this._paramIdx = 1;
        const sets = Object.entries(data)
            .map(([k, v]) => `${k} = ${this.nextParam(v)}`)
            .join(', ');
        const wheres = this.compileWheres();
        const returning = this.driverType === 'postgres' ? 'RETURNING id' : '';
        const sql = `UPDATE ${this._table} SET ${sets} ${wheres} ${returning}`.trim();
        const result = await this.driver.query(sql, this._params);
        return result.rowCount ?? result.changes ?? result.rows.length;
    }
    // ── Delete ────────────────────────────────────────────────────────
    async delete() {
        this._params = [];
        this._paramIdx = 1;
        const wheres = this.compileWheres();
        const returning = this.driverType === 'postgres' ? 'RETURNING id' : '';
        const sql = `DELETE FROM ${this._table} ${wheres} ${returning}`.trim();
        const result = await this.driver.query(sql, this._params);
        return result.rowCount ?? result.changes ?? result.rows.length;
    }
    // ── Increment / Decrement ─────────────────────────────────────────
    async increment(column, by = 1) {
        const wheres = this.compileWheres();
        const sql = `UPDATE ${this._table} SET ${column} = ${column} + ${by} ${wheres}`;
        await this.driver.query(sql, this._params);
    }
    async decrement(column, by = 1) {
        await this.increment(column, -by);
    }
    // ── Aggregate ─────────────────────────────────────────────────────
    async sum(column) {
        this._selects = [`SUM(${column}) AS _sum`];
        const rows = await this.get();
        return Number(rows[0]?._sum ?? 0);
    }
    async avg(column) {
        this._selects = [`AVG(${column}) AS _avg`];
        const rows = await this.get();
        return Number(rows[0]?._avg ?? 0);
    }
    async max(column) {
        this._selects = [`MAX(${column}) AS _max`];
        const rows = await this.get();
        return Number(rows[0]?._max ?? 0);
    }
    async min(column) {
        this._selects = [`MIN(${column}) AS _min`];
        const rows = await this.get();
        return Number(rows[0]?._min ?? 0);
    }
    // ── Raw ───────────────────────────────────────────────────────────
    async raw(sql, params = []) {
        const result = await this.driver.query(sql, params);
        return result.rows;
    }
}
exports.QueryBuilder = QueryBuilder;
//# sourceMappingURL=query-builder.js.map