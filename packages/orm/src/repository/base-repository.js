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
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseRepository = void 0;
const query_builder_1 = require("../query-builder/query-builder");
const entity_1 = require("../decorators/entity");
const common_1 = require("@axiljs/common");
class BaseRepository {
    EntityClass;
    tableName;
    primaryKey;
    driver;
    driverType;
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
        }
        // Detect driver type for query builder
        this.driverType = manager.config?.driver || 'sqlite';
    }
    /**
     * Create a new query builder scoped to this entity's table.
     */
    query() {
        return new query_builder_1.QueryBuilder(this.driver, this.driverType)
            .select('*')
            .from(this.tableName);
    }
    // ─── Find ─────────────────────────────────────────────────────────────────────
    /**
     * Find all records matching optional conditions.
     *
     * @param where  Key-value conditions (all must match)
     */
    async find(where) {
        const qb = this.query();
        if (where) {
            for (const [key, value] of Object.entries(where)) {
                if (value !== undefined) {
                    qb.where(key, '=', value);
                }
            }
        }
        return qb.all();
    }
    /**
     * Find the first record matching conditions.
     * Returns null if not found.
     */
    async findOne(where) {
        const qb = this.query();
        for (const [key, value] of Object.entries(where)) {
            if (value !== undefined) {
                qb.where(key, '=', value);
            }
        }
        return qb.first();
    }
    /**
     * Find by primary key.
     * Returns null if not found.
     */
    async findById(id) {
        return this.query()
            .where(this.primaryKey, '=', id)
            .first();
    }
    /**
     * Find by primary key or throw NotFoundError.
     */
    async findByIdOrFail(id) {
        const record = await this.findById(id);
        if (!record) {
            throw new common_1.NotFoundError(`${this.EntityClass.name} with ${this.primaryKey}=${id} not found`);
        }
        return record;
    }
    /**
     * Count records matching optional conditions.
     */
    async count(where) {
        const qb = this.query();
        if (where) {
            for (const [key, value] of Object.entries(where)) {
                if (value !== undefined) {
                    qb.where(key, '=', value);
                }
            }
        }
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
        // For other drivers, fetch by insertId
        const insertId = result.insertId;
        if (insertId) {
            return (await this.findById(insertId));
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
        await new query_builder_1.QueryBuilder(this.driver, this.driverType)
            .update(this.tableName)
            .set(cleanData)
            .where(this.primaryKey, '=', id)
            .execute();
        return (await this.findByIdOrFail(id));
    }
    /**
     * Update multiple records matching conditions.
     */
    async updateWhere(where, data) {
        const qb = new query_builder_1.QueryBuilder(this.driver, this.driverType)
            .update(this.tableName)
            .set(this.cleanData(data));
        for (const [key, value] of Object.entries(where)) {
            qb.where(key, '=', value);
        }
        const result = await qb.execute();
        return result.affectedRows;
    }
    // ─── Delete ───────────────────────────────────────────────────────────────────
    /**
     * Delete a record by primary key.
     */
    async delete(id) {
        await new query_builder_1.QueryBuilder(this.driver, this.driverType)
            .delete(this.tableName)
            .where(this.primaryKey, '=', id)
            .execute();
    }
    /**
     * Delete multiple records matching conditions.
     */
    async deleteWhere(where) {
        const qb = new query_builder_1.QueryBuilder(this.driver, this.driverType)
            .delete(this.tableName);
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
        const total = await this.count(options.where);
        // Fetch page
        const qb = this.query().limit(perPage).offset(offset);
        if (options.where) {
            for (const [key, value] of Object.entries(options.where)) {
                qb.where(key, '=', value);
            }
        }
        if (options.orderBy) {
            qb.orderBy(options.orderBy.column, options.orderBy.direction);
        }
        const data = await qb.all();
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