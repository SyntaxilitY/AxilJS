"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.entityRegistry = void 0;
exports.getEntityMetadata = getEntityMetadata;
exports.Entity = Entity;
exports.PrimaryKey = PrimaryKey;
exports.Column = Column;
exports.CreatedAt = CreatedAt;
exports.UpdatedAt = UpdatedAt;
exports.DeletedAt = DeletedAt;
// ─── Metadata Storage ──────────────────────────────────────────────────────────
// Store entity metadata keyed by class constructor
// This is our own metadata registry - no reflect-metadata required
const entityRegistry = new Map();
exports.entityRegistry = entityRegistry;
/**
 * Get entity metadata for a class.
 */
function getEntityMetadata(target) {
    return entityRegistry.get(target);
}
/**
 * Get or create entity metadata (used internally by decorators).
 */
function getOrCreateMetadata(target) {
    if (!entityRegistry.has(target)) {
        entityRegistry.set(target, {
            tableName: target.name.toLowerCase() + 's', // Default: ClassName → classnames
            columns: new Map(),
            primaryKey: 'id'
        });
    }
    return entityRegistry.get(target);
}
// ─── @Entity Decorator ────────────────────────────────────────────────────────
/**
 * Mark a class as a database entity.
 * The tableName maps this class to a database table.
 *
 * @param tableName  Database table name (default: lowercase class name + 's')
 */
function Entity(tableName) {
    return (target) => {
        const metadata = getOrCreateMetadata(target);
        if (tableName) {
            metadata.tableName = tableName;
        }
        entityRegistry.set(target, metadata);
    };
}
// ─── @PrimaryKey Decorator ────────────────────────────────────────────────────
/**
 * Mark a property as the primary key.
 * Defaults to auto-incrementing integer.
 */
function PrimaryKey(options = {}) {
    return (target, propertyKey) => {
        const metadata = getOrCreateMetadata(target.constructor);
        const name = String(propertyKey);
        metadata.primaryKey = name;
        metadata.columns.set(name, {
            name,
            type: options.type || 'integer',
            primary: true,
            autoIncrement: options.autoIncrement ?? true,
            nullable: false
        });
    };
}
// ─── @Column Decorator ────────────────────────────────────────────────────────
/**
 * Mark a property as a database column.
 */
function Column(options) {
    return (target, propertyKey) => {
        const metadata = getOrCreateMetadata(target.constructor);
        const name = String(propertyKey);
        metadata.columns.set(name, {
            name,
            nullable: true, // Default: allow null
            ...options
        });
    };
}
// ─── Common Column Shortcuts ──────────────────────────────────────────────────
/**
 * @CreatedAt - Automatically set to current timestamp on insert.
 */
function CreatedAt() {
    return Column({
        type: 'timestamp',
        nullable: false,
        default: 'CURRENT_TIMESTAMP'
    });
}
/**
 * @UpdatedAt - Automatically updated to current timestamp on update.
 */
function UpdatedAt() {
    return Column({
        type: 'timestamp',
        nullable: true
    });
}
/**
 * @DeletedAt - For soft deletes. NULL means not deleted.
 */
function DeletedAt() {
    return Column({
        type: 'timestamp',
        nullable: true
    });
}
//# sourceMappingURL=entity.js.map