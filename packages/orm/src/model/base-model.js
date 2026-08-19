"use strict";
/**
 * AxilORM — Base Model
 * Trace ID: 992f2995fd8091f39f6f41f757fb766a
 *
 * Uses polymorphic `this` typing so that:
 *   User.create({ name: 'x' })  →  Promise<User>   (not Promise<BaseModel>)
 *   User.find(1)                →  Promise<User | null>
 *   user.save()                 →  Promise<User>
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseModel = void 0;
const query_builder_1 = require("../query/query-builder");
const model_metadata_1 = require("./model-metadata");
// ── Shared driver ─────────────────────────────────────────────────────────
let _driver = null;
let _driverType = 'sqlite';
// ── BaseModel ─────────────────────────────────────────────────────────────
class BaseModel {
    // ── Driver registration ───────────────────────────────────────────
    static setDriver(driver, driverType) {
        _driver = driver;
        _driverType = driverType;
    }
    static getDriver() {
        if (!_driver) {
            throw new Error('[AxilORM] No driver. Call BaseModel.setDriver() first.');
        }
        return _driver;
    }
    static getDriverType() {
        return _driverType;
    }
    // ── Table name ────────────────────────────────────────────────────
    static getTableName() {
        const meta = (0, model_metadata_1.getEntityMeta)(this);
        if (!meta?.tableName) {
            throw new Error(`[AxilORM] @Entity decorator missing on ${this.name}`);
        }
        return meta.tableName;
    }
    // ── Query Builder ─────────────────────────────────────────────────
    static query() {
        return new query_builder_1.QueryBuilder(BaseModel.getDriver(), BaseModel.getDriverType()).from(this.getTableName());
    }
    // ── all() ─────────────────────────────────────────────────────────
    static async all() {
        const rows = await this.query().get();
        return rows.map((r) => BaseModel._hydrate(this, r));
    }
    // ── find() ────────────────────────────────────────────────────────
    static async find(id) {
        const meta = (0, model_metadata_1.getEntityMeta)(this);
        const pk = meta?.primaryKey ?? 'id';
        const row = await this.query().where(pk, '=', id).first();
        return row ? BaseModel._hydrate(this, row) : null;
    }
    // ── findOrFail() ──────────────────────────────────────────────────
    static async findOrFail(id) {
        const result = await this.find(id);
        if (!result) {
            throw new Error(`[AxilORM] ${this.name} id=${id} not found.`);
        }
        return result;
    }
    // ── where() ───────────────────────────────────────────────────────
    static where(column, operator, value) {
        return this.query().where(column, operator, value);
    }
    // ── create() ──────────────────────────────────────────────────────
    //
    //   User.create({ name: 'x', email: 'y' })
    //   → data: Partial<User>
    //   → return: Promise<User>
    static async create(data) {
        const row = await this.query().insert(data);
        return BaseModel._hydrate(this, row);
    }
    // ── updateWhere() ─────────────────────────────────────────────────
    static async updateWhere(conditions, data) {
        let qb = this.query();
        for (const [col, val] of Object.entries(conditions)) {
            qb = qb.where(col, '=', val);
        }
        return qb.update(data);
    }
    // ── deleteWhere() ─────────────────────────────────────────────────
    static async deleteWhere(conditions) {
        let qb = this.query();
        for (const [col, val] of Object.entries(conditions)) {
            qb = qb.where(col, '=', val);
        }
        return qb.delete();
    }
    // ── count() ───────────────────────────────────────────────────────
    static async count() {
        return this.query().count();
    }
    // ── paginate() ────────────────────────────────────────────────────
    static async paginate(page, perPage = 15) {
        const [rows, total] = await Promise.all([
            this.query().paginate(page, perPage).get(),
            this.query().count()
        ]);
        return {
            data: rows.map((r) => BaseModel._hydrate(this, r)),
            total,
            page,
            perPage,
            lastPage: Math.ceil(total / perPage)
        };
    }
    // ── Instance state ────────────────────────────────────────────────
    /** @internal */ _isNew = true;
    /** @internal */ _original = {};
    /** @internal */ _dirty = new Set();
    // ── save() ────────────────────────────────────────────────────────
    async save() {
        const ctor = this.constructor;
        const meta = (0, model_metadata_1.getEntityMeta)(ctor);
        const pk = meta?.primaryKey ?? 'id';
        const qb = new query_builder_1.QueryBuilder(ctor.getDriver(), ctor.getDriverType()).from(ctor.getTableName());
        const data = this._toColumnMap();
        if (this._isNew) {
            // INSERT
            delete data[pk];
            const row = await qb.insert(data);
            const id = row[pk];
            this[pk] = id;
            this._isNew = false;
            this._original = { ...data, [pk]: id };
            this._dirty.clear();
        }
        else {
            // UPDATE — only dirty columns
            const updates = {};
            for (const key of this._dirty) {
                updates[key] = this[key];
            }
            if (Object.keys(updates).length > 0) {
                const id = this[pk];
                await qb.where(pk, '=', id).update(updates);
                this._dirty.clear();
            }
        }
        return this;
    }
    // ── delete() ──────────────────────────────────────────────────────
    async delete() {
        const ctor = this.constructor;
        const meta = (0, model_metadata_1.getEntityMeta)(ctor);
        const pk = meta?.primaryKey ?? 'id';
        const id = this[pk];
        await new query_builder_1.QueryBuilder(ctor.getDriver(), ctor.getDriverType())
            .from(ctor.getTableName())
            .where(pk, '=', id)
            .delete();
    }
    // ── refresh() ─────────────────────────────────────────────────────
    async refresh() {
        const ctor = this.constructor;
        const meta = (0, model_metadata_1.getEntityMeta)(ctor);
        const pk = meta?.primaryKey ?? 'id';
        const id = this[pk];
        const fresh = await ctor.find(id);
        if (fresh)
            Object.assign(this, fresh);
        return this;
    }
    // ── isDirty() / isNew() / toJSON() ────────────────────────────────
    isDirty(column) {
        return column ? this._dirty.has(column) : this._dirty.size > 0;
    }
    isNew() {
        return this._isNew;
    }
    toJSON() {
        return this._toColumnMap();
    }
    // ── Internal: instance → column map ───────────────────────────────
    _toColumnMap() {
        const meta = (0, model_metadata_1.getEntityMeta)(this.constructor);
        if (!meta)
            return {};
        const result = {};
        for (const [prop, col] of meta.columns) {
            result[col.columnName] = this[prop];
        }
        return result;
    }
    // ── Internal: hydrate row → model instance ────────────────────────
    static _hydrate(ctor, row) {
        const instance = new ctor();
        const meta = (0, model_metadata_1.getEntityMeta)(ctor);
        if (meta) {
            for (const [prop, col] of meta.columns) {
                if (col.columnName in row) {
                    ;
                    instance[prop] = row[col.columnName];
                }
                else if (prop in row) {
                    ;
                    instance[prop] = row[prop];
                }
            }
        }
        else {
            Object.assign(instance, row);
        }
        // Reset tracking state
        ;
        instance['_isNew'] = false;
        instance['_original'] = { ...row };
        instance['_dirty'] = new Set();
        return instance;
    }
}
exports.BaseModel = BaseModel;
//# sourceMappingURL=base-model.js.map