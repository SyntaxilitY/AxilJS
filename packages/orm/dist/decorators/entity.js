"use strict";
/**
 * AxilORM — All Decorators
 * Trace ID: 992f2995fd8091f39f6f41f757fb766a
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ManyToMany = exports.BelongsTo = exports.HasMany = exports.HasOne = exports.entityRegistry = void 0;
exports.getOrCreateMeta = getOrCreateMeta;
exports.getEntityMetadata = getEntityMetadata;
exports.getAllEntities = getAllEntities;
exports.Entity = Entity;
exports.PrimaryKey = PrimaryKey;
exports.Column = Column;
exports.CreatedAt = CreatedAt;
exports.UpdatedAt = UpdatedAt;
exports.DeletedAt = DeletedAt;
exports.Index = Index;
exports.CompositeIndex = CompositeIndex;
// ── Registry ─────────────────────────────────────────────────────────────
exports.entityRegistry = new Map();
function getOrCreateMeta(target) {
    if (!exports.entityRegistry.has(target)) {
        exports.entityRegistry.set(target, {
            tableName: '',
            primaryKey: 'id',
            columns: new Map(),
            relations: new Map(),
            indexes: []
        });
    }
    return exports.entityRegistry.get(target);
}
function getEntityMetadata(target) {
    return exports.entityRegistry.get(target);
}
function getAllEntities() {
    return exports.entityRegistry;
}
// ── @Entity ───────────────────────────────────────────────────────────────
function Entity(tableName) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (target) => {
        const meta = getOrCreateMeta(target);
        meta.tableName = tableName ?? target.name.toLowerCase() + 's';
    };
}
// ── @PrimaryKey ───────────────────────────────────────────────────────────
function PrimaryKey(options = {}) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (target, propertyKey) => {
        const key = String(propertyKey);
        const ctor = (typeof target === 'function' ? target : target?.constructor);
        const meta = getOrCreateMeta(ctor);
        const isGenerated = options.generated ?? options.autoIncrement ?? true;
        meta.primaryKey = key;
        meta.columns.set(key, {
            propertyKey: key,
            columnName: options.name ?? key,
            type: options.type ?? 'integer',
            nullable: false,
            unique: true,
            isPrimary: true,
            isGenerated
        });
    };
}
// ── @Column ───────────────────────────────────────────────────────────────
function Column(options = {}) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (target, propertyKey) => {
        const key = String(propertyKey);
        const ctor = (typeof target === 'function' ? target : target?.constructor);
        const meta = getOrCreateMeta(ctor);
        meta.columns.set(key, {
            propertyKey: key,
            columnName: options.name ?? key,
            type: options.type ?? 'string',
            nullable: options.nullable ?? false,
            unique: options.unique ?? false,
            default: options.default,
            length: options.length,
            precision: options.precision,
            scale: options.scale,
            isPrimary: false,
            isGenerated: false
        });
    };
}
// ── Timestamp shortcuts ───────────────────────────────────────────────────
function CreatedAt() {
    return Column({
        type: 'timestamp',
        name: 'created_at',
        nullable: false,
        default: 'CURRENT_TIMESTAMP'
    });
}
function UpdatedAt() {
    return Column({
        type: 'timestamp',
        name: 'updated_at',
        nullable: true
    });
}
function DeletedAt() {
    const column = Column({
        type: 'timestamp',
        name: 'deleted_at',
        nullable: true
    });
    // Also mark the entity as soft-deletable (see BaseModel / BaseRepository)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (target, propertyKey) => {
        column(target, propertyKey);
        const ctor = (typeof target === 'function' ? target : target?.constructor);
        getOrCreateMeta(ctor).softDelete = { propertyKey: String(propertyKey), columnName: 'deleted_at' };
    };
}
// ── Relations ─────────────────────────────────────────────────────────────
function makeRelation(relationType) {
    return function (targetFactory, options = {}) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return (instance, propertyKey) => {
            const key = String(propertyKey);
            const ctor = (typeof instance === 'function'
                ? instance
                : instance?.constructor);
            const meta = getOrCreateMeta(ctor);
            meta.relations.set(key, {
                type: relationType,
                propertyKey: key,
                target: targetFactory,
                foreignKey: options.foreignKey ?? '',
                pivotTable: options.pivotTable,
                relatedKey: options.relatedKey,
                eager: options.eager ?? false
            });
        };
    };
}
exports.HasOne = makeRelation('hasOne');
exports.HasMany = makeRelation('hasMany');
exports.BelongsTo = makeRelation('belongsTo');
exports.ManyToMany = makeRelation('manyToMany');
// ── @Index ────────────────────────────────────────────────────────────────
function Index(options = {}) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (target, propertyKey) => {
        const key = String(propertyKey);
        const ctor = (typeof target === 'function'
            ? target
            : target?.constructor);
        const meta = getOrCreateMeta(ctor);
        meta.indexes.push({
            name: options.name ?? `idx_${key}`,
            columns: [key],
            unique: options.unique ?? false
        });
    };
}
// ── @CompositeIndex ───────────────────────────────────────────────────────
function CompositeIndex(columns, options = {}) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (target) => {
        const meta = getOrCreateMeta(target);
        meta.indexes.push({
            name: options.name ?? `idx_${columns.join('_')}`,
            columns,
            unique: options.unique ?? false
        });
    };
}
//# sourceMappingURL=entity.js.map