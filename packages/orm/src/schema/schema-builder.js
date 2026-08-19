"use strict";
/**
 * AxilORM — Schema Builder
 *
 * Fluent API for building CREATE TABLE statements inside migrations.
 *
 * Usage:
 *   import { Schema } from '@axiljs/orm'
 *
 *   export async function up(db: TransactionContext) {
 *     await Schema.create('users', (table) => {
 *       table.id()
 *       table.string('name', 255)
 *       table.string('email', 255).unique()
 *       table.boolean('is_active').default(true)
 *       table.timestamps()
 *     }, db, 'postgres')
 *   }
 *
 *   export async function down(db: TransactionContext) {
 *     await Schema.drop('users', db)
 *   }
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Schema = exports.TableBuilder = void 0;
class TableBuilder {
    tableName;
    driver;
    columns = [];
    indexes = [];
    constructor(tableName, driver) {
        this.tableName = tableName;
        this.driver = driver;
    }
    // ── Primary Key shortcut ──────────────────────────────────────────
    id() {
        const type = this.driver === 'postgres'
            ? 'SERIAL PRIMARY KEY'
            : this.driver === 'mysql'
                ? 'INTEGER AUTO_INCREMENT PRIMARY KEY'
                : 'INTEGER PRIMARY KEY AUTOINCREMENT';
        this.columns.push({ name: 'id', type, notNull: false, unique: false });
        return this;
    }
    uuid(name = 'id') {
        const type = this.driver === 'postgres'
            ? 'UUID DEFAULT gen_random_uuid() PRIMARY KEY'
            : 'VARCHAR(36) PRIMARY KEY';
        this.columns.push({ name, type, notNull: false, unique: false });
        return this;
    }
    // ── Column types ──────────────────────────────────────────────────
    string(name, length = 255) {
        return this._col(name, `VARCHAR(${length})`);
    }
    text(name) {
        return this._col(name, 'TEXT');
    }
    integer(name) {
        return this._col(name, 'INTEGER');
    }
    bigint(name) {
        return this._col(name, 'BIGINT');
    }
    float(name) {
        return this._col(name, 'FLOAT');
    }
    decimal(name, precision = 10, scale = 2) {
        return this._col(name, `DECIMAL(${precision},${scale})`);
    }
    boolean(name) {
        const type = this.driver === 'sqlite' ? 'INTEGER' : 'BOOLEAN';
        return this._col(name, type);
    }
    date(name) {
        return this._col(name, 'DATE');
    }
    datetime(name) {
        const type = this.driver === 'mysql' ? 'DATETIME' : 'TIMESTAMP';
        return this._col(name, type);
    }
    timestamp(name) {
        return this._col(name, 'TIMESTAMP');
    }
    json(name) {
        const type = this.driver === 'sqlite' ? 'TEXT' : 'JSON';
        return this._col(name, type);
    }
    // ── Foreign Key ───────────────────────────────────────────────────
    foreignKey(name, refTable, refCol = 'id') {
        this.columns.push({
            name,
            type: 'INTEGER',
            notNull: false,
            unique: false,
            extra: `REFERENCES ${refTable}(${refCol}) ON DELETE CASCADE`
        });
        return this;
    }
    // ── Timestamps shortcut ───────────────────────────────────────────
    timestamps() {
        this._col('created_at', 'TIMESTAMP').default('CURRENT_TIMESTAMP');
        this._col('updated_at', 'TIMESTAMP').nullable();
        return this;
    }
    softDeletes() {
        this._col('deleted_at', 'TIMESTAMP').nullable();
        return this;
    }
    // ── Index ─────────────────────────────────────────────────────────
    index(columns, name) {
        const idxName = name ?? `idx_${this.tableName}_${columns.join('_')}`;
        this.indexes.push(`CREATE INDEX IF NOT EXISTS ${idxName} ON ${this.tableName} (${columns.join(', ')})`);
        return this;
    }
    uniqueIndex(columns, name) {
        const idxName = name ?? `uidx_${this.tableName}_${columns.join('_')}`;
        this.indexes.push(`CREATE UNIQUE INDEX IF NOT EXISTS ${idxName} ON ${this.tableName} (${columns.join(', ')})`);
        return this;
    }
    // ── Build ─────────────────────────────────────────────────────────
    toSQL() {
        const cols = this.columns.map(c => {
            const parts = [c.name, c.type];
            if (c.notNull)
                parts.push('NOT NULL');
            if (c.unique)
                parts.push('UNIQUE');
            if (c.defaultVal !== undefined)
                parts.push(`DEFAULT ${c.defaultVal}`);
            if (c.extra)
                parts.push(c.extra);
            return '  ' + parts.join(' ');
        });
        const createSQL = [
            `CREATE TABLE IF NOT EXISTS ${this.tableName} (`,
            cols.join(',\n'),
            `)`
        ].join('\n');
        return [createSQL, ...this.indexes];
    }
    // ── Internal ──────────────────────────────────────────────────────
    _col(name, type) {
        const def = { name, type, notNull: true, unique: false };
        this.columns.push(def);
        return new ColumnBuilder(def);
    }
}
exports.TableBuilder = TableBuilder;
class ColumnBuilder {
    def;
    constructor(def) {
        this.def = def;
    }
    nullable() {
        this.def.notNull = false;
        return this;
    }
    unique() {
        this.def.unique = true;
        return this;
    }
    default(value) {
        this.def.defaultVal = typeof value === 'string' ? `'${value}'` : String(value);
        return this;
    }
}
// ── Schema static API ─────────────────────────────────────────────────────
class Schema {
    static async create(table, callback, db, driver = 'postgres') {
        const builder = new TableBuilder(table, driver);
        callback(builder);
        for (const sql of builder.toSQL()) {
            await db.query(sql);
        }
    }
    static async drop(table, db) {
        await db.query(`DROP TABLE IF EXISTS ${table}`);
    }
    static async dropIfExists(table, db) {
        await db.query(`DROP TABLE IF EXISTS ${table}`);
    }
    static async rename(from, to, db) {
        await db.query(`ALTER TABLE ${from} RENAME TO ${to}`);
    }
    static async addColumn(table, name, type, db) {
        await db.query(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
    }
    static async dropColumn(table, name, db) {
        await db.query(`ALTER TABLE ${table} DROP COLUMN ${name}`);
    }
}
exports.Schema = Schema;
//# sourceMappingURL=schema-builder.js.map