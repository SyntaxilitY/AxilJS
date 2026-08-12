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
import { ConnectionManager } from '../connection/connection-manager';
import { QueryBuilder } from '../query-builder/query-builder';
export declare class BaseRepository<T extends object> {
    private EntityClass;
    protected tableName: string;
    protected primaryKey: string;
    protected driver: any;
    protected driverType: string;
    private manager;
    constructor(EntityClass: new () => T, manager: ConnectionManager);
    /**
     * Create a new query builder scoped to this entity's table.
     */
    protected query(): QueryBuilder;
    /**
     * Find all records matching optional conditions.
     *
     * @param where  Key-value conditions (all must match)
     */
    find(where?: Partial<T>): Promise<T[]>;
    /**
     * Find the first record matching conditions.
     * Returns null if not found.
     */
    findOne(where: Partial<T>): Promise<T | null>;
    /**
     * Find by primary key.
     * Returns null if not found.
     */
    findById(id: number | string): Promise<T | null>;
    /**
     * Find by primary key or throw NotFoundError.
     */
    findByIdOrFail(id: number | string): Promise<T>;
    /**
     * Count records matching optional conditions.
     */
    count(where?: Partial<T>): Promise<number>;
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
     */
    delete(id: number | string): Promise<void>;
    /**
     * Delete multiple records matching conditions.
     */
    deleteWhere(where: Partial<T>): Promise<number>;
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
    }): Promise<{
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