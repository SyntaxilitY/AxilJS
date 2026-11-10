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
import { ConnectionManager } from '../connection/connection-manager';
import { QueryBuilder } from '../query-builder/query-builder';
/** Options accepted by the read methods of BaseRepository. */
export interface FindOptions {
    /** Relations to eager-load (declared with @HasOne/@HasMany/@BelongsTo/@ManyToMany). */
    with?: string[];
    /** Include soft-deleted rows (@DeletedAt entities). */
    withTrashed?: boolean;
    /** Only soft-deleted rows (@DeletedAt entities). */
    onlyTrashed?: boolean;
}
export declare class BaseRepository<T extends object> {
    private EntityClass;
    protected tableName: string;
    protected primaryKey: string;
    protected driver: any;
    protected driverType: string;
    /** deleted_at column when the entity has @DeletedAt, otherwise undefined. */
    protected softDeleteColumn?: string;
    private manager;
    constructor(EntityClass: new () => T, manager: ConnectionManager);
    /**
     * Create a new query builder scoped to this entity's table.
     * For @DeletedAt entities soft-deleted rows are excluded unless
     * `withTrashed` / `onlyTrashed` is passed.
     */
    protected query(options?: FindOptions): QueryBuilder;
    private scope;
    private applyWhere;
    private withRelations;
    /**
     * Find all records matching optional conditions.
     *
     * @param where    Key-value conditions (all must match)
     * @param options  Eager loading / soft-delete visibility
     */
    find(where?: Partial<T>, options?: FindOptions): Promise<T[]>;
    /**
     * Find records and eager-load relations in batched IN queries.
     *
     *   await posts.findWithRelations({ published: 1 }, ['author', 'tags'])
     */
    findWithRelations(where: Partial<T> | undefined, relations: string[], options?: FindOptions): Promise<T[]>;
    /**
     * Find the first record matching conditions.
     * Returns null if not found.
     */
    findOne(where: Partial<T>, options?: FindOptions): Promise<T | null>;
    /**
     * Find by primary key.
     * Returns null if not found.
     */
    findById(id: number | string, options?: FindOptions): Promise<T | null>;
    /**
     * Find by primary key or throw NotFoundError.
     */
    findByIdOrFail(id: number | string, options?: FindOptions): Promise<T>;
    /**
     * Count records matching optional conditions.
     */
    count(where?: Partial<T>, options?: FindOptions): Promise<number>;
    /**
     * Insert a new record.
     * Returns the created record with all fields including generated ID.
     */
    create(data: Partial<T>): Promise<T>;
    /**
     * Insert multiple records at once.
     */
    createMany(data: Partial<T>[]): Promise<T[]>;
    /**
     * Update a record by primary key.
     * Returns the updated record.
     */
    update(id: number | string, data: Partial<T>): Promise<T>;
    /**
     * Update multiple records matching conditions.
     */
    updateWhere(where: Partial<T>, data: Partial<T>): Promise<number>;
    /**
     * Delete a record by primary key.
     * @DeletedAt entities are soft-deleted (deleted_at = now).
     */
    delete(id: number | string): Promise<void>;
    /**
     * Delete multiple records matching conditions.
     * @DeletedAt entities are soft-deleted (deleted_at = now).
     */
    deleteWhere(where: Partial<T>): Promise<number>;
    /**
     * Permanently delete a record by primary key (even for @DeletedAt entities).
     */
    forceDelete(id: number | string): Promise<void>;
    /**
     * Restore a soft-deleted record. Returns true when a row was restored.
     */
    restore(id: number | string): Promise<boolean>;
    private softDeleteWhere;
    /**
     * Get paginated results.
     */
    paginate(options: {
        page?: number;
        perPage?: number;
        where?: Partial<T>;
        orderBy?: {
            column: string;
            direction: 'ASC' | 'DESC';
        };
    } & FindOptions): Promise<{
        data: T[];
        total: number;
        page: number;
        perPage: number;
        totalPages: number;
    }>;
    /**
     * Remove undefined values from data objects.
     * Prevents sending undefined to the database.
     */
    private cleanData;
}
//# sourceMappingURL=base-repository.d.ts.map