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
import { getEntityMetadata } from '../decorators/entity';
import { NotFoundError } from '@axiljs/common';

export class BaseRepository<T extends object> {
  protected tableName: string;
  protected primaryKey: string;
  protected driver: any;
  protected driverType: string;
  private manager: ConnectionManager;

  constructor(
    private EntityClass: new () => T,
    manager: ConnectionManager
  ) {
    this.manager = manager;
    this.driver = manager.getDriver();

    // Get table info from entity decorators
    const metadata = getEntityMetadata(EntityClass);

    if (!metadata) {
      // No decorators - use class name as table name
      this.tableName = EntityClass.name.toLowerCase() + 's';
      this.primaryKey = 'id';
    } else {
      this.tableName = metadata.tableName;
      this.primaryKey = metadata.primaryKey;
    }

    // Detect driver type for query builder
    this.driverType = (manager as any).config?.driver || 'sqlite';
  }

  /**
   * Create a new query builder scoped to this entity's table.
   */
  protected query(): QueryBuilder {
    return new QueryBuilder(this.driver, this.driverType)
      .select('*')
      .from(this.tableName);
  }

  // ─── Find ─────────────────────────────────────────────────────────────────────

  /**
   * Find all records matching optional conditions.
   *
   * @param where  Key-value conditions (all must match)
   */
  async find(where?: Partial<T>): Promise<T[]> {
    const qb = this.query();

    if (where) {
      for (const [key, value] of Object.entries(where)) {
        if (value !== undefined) {
          qb.where(key, '=', value);
        }
      }
    }

    return qb.all<T>();
  }

  /**
   * Find the first record matching conditions.
   * Returns null if not found.
   */
  async findOne(where: Partial<T>): Promise<T | null> {
    const qb = this.query();

    for (const [key, value] of Object.entries(where)) {
      if (value !== undefined) {
        qb.where(key, '=', value);
      }
    }

    return qb.first<T>();
  }

  /**
   * Find by primary key.
   * Returns null if not found.
   */
  async findById(id: number | string): Promise<T | null> {
    return this.query()
      .where(this.primaryKey, '=', id)
      .first<T>();
  }

  /**
   * Find by primary key or throw NotFoundError.
   */
  async findByIdOrFail(id: number | string): Promise<T> {
    const record = await this.findById(id);

    if (!record) {
      throw new NotFoundError(
        `${this.EntityClass.name} with ${this.primaryKey}=${id} not found`
      );
    }

    return record;
  }

  /**
   * Count records matching optional conditions.
   */
  async count(where?: Partial<T>): Promise<number> {
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
  async create(data: Partial<T>): Promise<T> {
    // Remove undefined values
    const cleanData = this.cleanData(data);

    const result = await new QueryBuilder(this.driver, this.driverType)
      .insert(this.tableName, cleanData)
      .execute<T>();

    // PostgreSQL returns the row via RETURNING *
    if (result.rows.length > 0) {
      return result.rows[0];
    }

    // For other drivers, fetch by insertId
    const insertId = result.insertId;
    if (insertId) {
      return (await this.findById(insertId as number))!;
    }

    return cleanData as T;
  }

  /**
   * Insert multiple records at once.
   */
  async createMany(data: Partial<T>[]): Promise<T[]> {
    const results: T[] = [];
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
  async update(id: number | string, data: Partial<T>): Promise<T> {
    const cleanData = this.cleanData(data);

    await new QueryBuilder(this.driver, this.driverType)
      .update(this.tableName)
      .set(cleanData)
      .where(this.primaryKey, '=', id)
      .execute();

    return (await this.findByIdOrFail(id));
  }

  /**
   * Update multiple records matching conditions.
   */
  async updateWhere(where: Partial<T>, data: Partial<T>): Promise<number> {
    const qb = new QueryBuilder(this.driver, this.driverType)
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
  async delete(id: number | string): Promise<void> {
    await new QueryBuilder(this.driver, this.driverType)
      .delete(this.tableName)
      .where(this.primaryKey, '=', id)
      .execute();
  }

  /**
   * Delete multiple records matching conditions.
   */
  async deleteWhere(where: Partial<T>): Promise<number> {
    const qb = new QueryBuilder(this.driver, this.driverType)
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
  async paginate(options: {
    page?: number;
    perPage?: number;
    where?: Partial<T>;
    orderBy?: { column: string; direction: 'ASC' | 'DESC' };
  }): Promise<{
    data: T[];
    total: number;
    page: number;
    perPage: number;
    totalPages: number;
  }> {
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

    const data = await qb.all<T>();

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
  private cleanData(data: Partial<T>): Record<string, unknown> {
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        clean[key] = value;
      }
    }
    return clean;
  }
}