/**
 * Entity decorators.
 * Mark classes as database entities and define their columns.
 *
 * Usage:
 *   @Entity('users')
 *   class User {
 *     @PrimaryKey()
 *     id: number
 *
 *     @Column({ type: 'string', length: 255 })
 *     name: string
 *
 *     @Column({ type: 'string', unique: true })
 *     email: string
 *
 *     @Column({ type: 'timestamp', default: 'CURRENT_TIMESTAMP' })
 *     createdAt: Date
 *   }
 */
import { ColumnDefinition, EntityMetadata, ColumnType } from '../types';
declare const entityRegistry: Map<Function, EntityMetadata>;
/**
 * Get entity metadata for a class.
 */
export declare function getEntityMetadata(target: Function): EntityMetadata | undefined;
/**
 * Mark a class as a database entity.
 * The tableName maps this class to a database table.
 *
 * @param tableName  Database table name (default: lowercase class name + 's')
 */
export declare function Entity(tableName?: string): ClassDecorator;
/**
 * Mark a property as the primary key.
 * Defaults to auto-incrementing integer.
 */
export declare function PrimaryKey(options?: {
    type?: ColumnType;
    autoIncrement?: boolean;
}): PropertyDecorator;
/**
 * Mark a property as a database column.
 */
export declare function Column(options: Partial<ColumnDefinition> & {
    type: ColumnType;
}): PropertyDecorator;
/**
 * @CreatedAt - Automatically set to current timestamp on insert.
 */
export declare function CreatedAt(): PropertyDecorator;
/**
 * @UpdatedAt - Automatically updated to current timestamp on update.
 */
export declare function UpdatedAt(): PropertyDecorator;
/**
 * @DeletedAt - For soft deletes. NULL means not deleted.
 */
export declare function DeletedAt(): PropertyDecorator;
export { entityRegistry };
//# sourceMappingURL=entity.d.ts.map