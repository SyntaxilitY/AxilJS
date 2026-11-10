"use strict";
/**
 * Base Repository.
 * Provides standard CRUD operations for an entity.
 * Developers extend this for their entities.
 *
 * Usage:
 *   class UserRepository extends BaseRepository<User> {
 *     constructor(db: ConnectionManager) {
 *       super(User, db)
 *     }
 *
 *     // Add custom methods
 *     async findByEmail(email: string) {
 *       return this.findOne({ email })
 *     }
 *   }
 *
 * Entities with @DeletedAt are soft-deleted: delete() sets deleted_at and
 * reads skip those rows unless `{ withTrashed: true }` / `{ onlyTrashed: true }`.
 * Relations are eager-loaded with `{ with: ['posts'] }` or findWithRelations().
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseRepository = void 0;
const query_builder_1 = require("../query-builder/query-builder");
const entity_1 = require("../decorators/entity");
const eager_loader_1 = require("../relations/eager-loader");
const common_1 = require("@axiljs/common");
class BaseRepository {
    EntityClass;
    tableName;
    primaryKey;
    driver;
    driverType;
    /** deleted_at column when the entity has @DeletedAt, otherwise undefined. */
    softDeleteColumn;
    manager;
    constructor(EntityClass, manager) {
        this.EntityClass = EntityClass;
        this.manager = manager;
        this.driver = manager.getDriver();
        // Get table info from entity decorators
        const metadata = (0, entity_1.getEntityMetadata)(EntityClass);
        if (!metadata) {
            // No decorators - use class name as table name
            this.tableName = EntityClass.name.toLowerCase() + 's';
            this.primaryKey = 'id';
        }
        else {
            this.tableName = metadata.tableName;
            this.primaryKey = metadata.primaryKey;
            this.softDeleteColumn = metadata.softDelete?.columnName;
        }
        // Detect driver type for query builder
        this.driverType = manager.config?.driver || 'sqlite';
    }
    /**
     * Create a new query builder scoped to this entity's table.
     * For @DeletedAt entities soft-deleted rows are excluded unless
     * `withTrashed` / `onlyTrashed` is passed.
     */
    query(options = {}) {
        const qb = new query_builder_1.QueryBuilder(this.driver, this.driverType)
            .select('*')
            .from(this.tableName);
        return this.scope(qb, options);
    }
    scope(qb, options = {}) {
        if (!this.softDeleteColumn)
            return qb;
        qb.useSoftDeletes(this.softDeleteColumn);
        if (options.onlyTrashed)
            qb.onlyTrashed();
        else if (options.withTrashed)
            qb.withTrashed();
        return qb;
    }
    applyWhere(qb, where) {
        if (where) {
            for (const [key, value] of Object.entries(where)) {
                // Skip undefined — where(key, '=', undefined) would fall into the
                // shorthand path and compare against the string '='
                if (value !== undefined) {
                    qb.where(key, '=', value);
                }
            }
        }
        return qb;
    }
    async withRelations(rows, options) {
        if (options.with?.length && rows.length) {
            await (0, eager_loader_1.eagerLoad)(this.EntityClass, rows, options.with, {
                driver: this.driver,
                driverType: this.driverType
            });
        }
        return rows;
    }
    // ─── Find ─────────────────────────────────────────────────────────────────────
    /**
     * Find all records matching optional conditions.
     *
     * @param where    Key-value conditions (all must match)
     * @param options  Eager loading / soft-delete visibility
     */
    async find(where, options = {}) {
        const qb = this.applyWhere(this.query(options), where);
        return this.withRelations(await qb.all(), options);
    }
    /**
     * Find records and eager-load relations in batched IN queries.
     *
     *   await posts.findWithRelations({ published: 1 }, ['author', 'tags'])
     */
    async findWithRelations(where, relations, options = {}) {
        return this.find(where, { ...options, with: relations });
    }
    /**
     * Find the first record matching conditions.
     * Returns null if not found.
     */
    async findOne(where, options = {}) {
        const row = await this.applyWhere(this.query(options), where).first();
        if (row)
            await this.withRelations([row], options);
        return row;
    }
    /**
     * Find by primary key.
     * Returns null if not found.
     */
    async findById(id, options = {}) {
        const row = await this.query(options)
            .where(this.primaryKey, '=', id)
            .first();
        if (row)
            await this.withRelations([row], options);
        return row;
    }
    /**
     * Find by primary key or throw NotFoundError.
     */
    async findByIdOrFail(id, options = {}) {
        const record = await this.findById(id, options);
        if (!record) {
            throw new common_1.NotFoundError(`${this.EntityClass.name} with ${this.primaryKey}=${id} not found`);
        }
        return record;
    }
    /**
     * Count records matching optional conditions.
     */
    async count(where, options = {}) {
        const qb = this.applyWhere(this.query(options), where);
        return qb.count(this.primaryKey);
    }
    // ─── Create ───────────────────────────────────────────────────────────────────
    /**
     * Insert a new record.
     * Returns the created record with all fields including generated ID.
     */
    async create(data) {
        // Remove undefined values
        const cleanData = this.cleanData(data);
        const result = await new query_builder_1.QueryBuilder(this.driver, this.driverType)
            .insert(this.tableName, cleanData)
            .execute();
        // PostgreSQL returns the row via RETURNING *
        if (result.rows.length > 0) {
            return result.rows[0];
        }
        // Caller supplied the primary key (e.g. UUID) — insertId would be the
        // SQLite rowid / MySQL 0, not the key, so look up by the supplied value
        const suppliedId = cleanData[this.primaryKey];
        if (suppliedId !== undefined && suppliedId !== null) {
            return (await this.findById(suppliedId, { withTrashed: true })) ?? cleanData;
        }
        // For other drivers, fetch by insertId
        const insertId = result.insertId;
        if (insertId) {
            return (await this.findById(insertId, { withTrashed: true }));
        }
        return cleanData;
    }
    /**
     * Insert multiple records at once.
     */
    async createMany(data) {
        const results = [];
        for (const item of data) {
            results.push(await this.create(item));
        }
        return results;
    }
    // ─── Update ───────────────────────────────────────────────────────────────────
    /**
     * Update a record by primary key.
     * Returns the updated record.
     */
    async update(id, data) {
        const cleanData = this.cleanData(data);
        await this.scope(new query_builder_1.QueryBuilder(this.driver, this.driverType).update(this.tableName).set(cleanData))
            .where(this.primaryKey, '=', id)
            .execute();
        return (await this.findByIdOrFail(id));
    }
    /**
     * Update multiple records matching conditions.
     */
    async updateWhere(where, data) {
        const qb = this.scope(new query_builder_1.QueryBuilder(this.driver, this.driverType)
            .update(this.tableName)
            .set(this.cleanData(data)));
        for (const [key, value] of Object.entries(where)) {
            qb.where(key, '=', value);
        }
        const result = await qb.execute();
        return result.affectedRows;
    }
    // ─── Delete ───────────────────────────────────────────────────────────────────
    /**
     * Delete a record by primary key.
     * @DeletedAt entities are soft-deleted (deleted_at = now).
     */
    async delete(id) {
        if (this.softDeleteColumn) {
            await this.softDeleteWhere({ [this.primaryKey]: id });
            return;
        }
        await this.forceDelete(id);
    }
    /**
     * Delete multiple records matching conditions.
     * @DeletedAt entities are soft-deleted (deleted_at = now).
     */
    async deleteWhere(where) {
        if (this.softDeleteColumn) {
            return this.softDeleteWhere(where);
        }
        const qb = new query_builder_1.QueryBuilder(this.driver, this.driverType)
            .delete(this.tableName);
        for (const [key, value] of Object.entries(where)) {
            qb.where(key, '=', value);
        }
        const result = await qb.execute();
        return result.affectedRows;
    }
    /**
     * Permanently delete a record by primary key (even for @DeletedAt entities).
     */
    async forceDelete(id) {
        await new query_builder_1.QueryBuilder(this.driver, this.driverType)
            .delete(this.tableName)
            .where(this.primaryKey, '=', id)
            .execute();
    }
    /**
     * Restore a soft-deleted record. Returns true when a row was restored.
     */
    async restore(id) {
        if (!this.softDeleteColumn) {
            throw new Error(`[AxilORM] ${this.EntityClass.name} has no @DeletedAt column — soft deletes are disabled.`);
        }
        const result = await new query_builder_1.QueryBuilder(this.driver, this.driverType)
            .update(this.tableName)
            .set({ [this.softDeleteColumn]: null })
            .useSoftDeletes(this.softDeleteColumn)
            .onlyTrashed()
            .where(this.primaryKey, '=', id)
            .execute();
        return result.affectedRows > 0;
    }
    async softDeleteWhere(where) {
        const qb = new query_builder_1.QueryBuilder(this.driver, this.driverType)
            .update(this.tableName)
            .set({ [this.softDeleteColumn]: new Date() })
            .useSoftDeletes(this.softDeleteColumn);
        for (const [key, value] of Object.entries(where)) {
            qb.where(key, '=', value);
        }
        const result = await qb.execute();
        return result.affectedRows;
    }
    // ─── Pagination ───────────────────────────────────────────────────────────────
    /**
     * Get paginated results.
     */
    async paginate(options) {
        const page = options.page || 1;
        const perPage = options.perPage || 20;
        const offset = (page - 1) * perPage;
        // Count total
        const total = await this.count(options.where, options);
        // Fetch page
        const qb = this.applyWhere(this.query(options).limit(perPage).offset(offset), options.where);
        if (options.orderBy) {
            qb.orderBy(options.orderBy.column, options.orderBy.direction);
        }
        const data = await this.withRelations(await qb.all(), options);
        return {
            data,
            total,
            page,
            perPage,
            totalPages: Math.ceil(total / perPage)
        };
    }
    // ─── Helpers ──────────────────────────────────────────────────────────────────
    /**
     * Remove undefined values from data objects.
     * Prevents sending undefined to the database.
     */
    cleanData(data) {
        const clean = {};
        for (const [key, value] of Object.entries(data)) {
            if (value !== undefined) {
                clean[key] = value;
            }
        }
        return clean;
    }
}
exports.BaseRepository = BaseRepository;
//# sourceMappingURL=base-repository.js.map