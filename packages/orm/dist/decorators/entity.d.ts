/**
 * AxilORM — All Decorators
 * Trace ID: 992f2995fd8091f39f6f41f757fb766a
 */
export type ColumnType = 'string' | 'number' | 'integer' | 'bigint' | 'float' | 'decimal' | 'boolean' | 'date' | 'datetime' | 'timestamp' | 'text' | 'json' | 'jsonb' | 'uuid' | 'enum';
export interface ColumnOptions {
    type?: ColumnType;
    name?: string;
    nullable?: boolean;
    unique?: boolean;
    default?: unknown;
    length?: number;
    precision?: number;
    scale?: number;
}
export interface PrimaryKeyOptions {
    type?: 'integer' | 'bigint' | 'uuid' | 'string';
    generated?: boolean;
    autoIncrement?: boolean;
    name?: string;
}
export interface RelationOptions {
    foreignKey?: string;
    pivotTable?: string;
    eager?: boolean;
}
export interface IndexOptions {
    name?: string;
    unique?: boolean;
}
export interface ColumnMeta {
    propertyKey: string;
    columnName: string;
    type: ColumnType;
    nullable: boolean;
    unique: boolean;
    default?: unknown;
    length?: number;
    precision?: number;
    scale?: number;
    isPrimary: boolean;
    isGenerated: boolean;
}
export interface RelationMeta {
    type: 'hasOne' | 'hasMany' | 'belongsTo' | 'manyToMany';
    propertyKey: string;
    target: () => Function;
    foreignKey: string;
    pivotTable?: string;
    eager: boolean;
}
export interface IndexMeta {
    name: string;
    columns: string[];
    unique: boolean;
}
export interface EntityMeta {
    tableName: string;
    primaryKey: string;
    columns: Map<string, ColumnMeta>;
    relations: Map<string, RelationMeta>;
    indexes: IndexMeta[];
}
export type EntityMetadata = EntityMeta;
type PropDecorator = (target: any, propertyKey: string | symbol) => void;
type ClassDeco = (target: any) => void;
export declare const entityRegistry: Map<Function, EntityMeta>;
export declare function getOrCreateMeta(target: Function): EntityMeta;
export declare function getEntityMetadata(target: Function): EntityMeta | undefined;
export declare function getAllEntities(): Map<Function, EntityMeta>;
export declare function Entity(tableName?: string): ClassDeco;
export declare function PrimaryKey(options?: PrimaryKeyOptions): PropDecorator;
export declare function Column(options?: ColumnOptions): PropDecorator;
export declare function CreatedAt(): PropDecorator;
export declare function UpdatedAt(): PropDecorator;
export declare function DeletedAt(): PropDecorator;
export declare const HasOne: (targetFactory: () => Function, options?: RelationOptions) => PropDecorator;
export declare const HasMany: (targetFactory: () => Function, options?: RelationOptions) => PropDecorator;
export declare const BelongsTo: (targetFactory: () => Function, options?: RelationOptions) => PropDecorator;
export declare const ManyToMany: (targetFactory: () => Function, options?: RelationOptions) => PropDecorator;
export declare function Index(options?: IndexOptions): PropDecorator;
export declare function CompositeIndex(columns: string[], options?: IndexOptions): ClassDeco;
export {};
//# sourceMappingURL=entity.d.ts.map