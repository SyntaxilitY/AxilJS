/**
 * AxilORM — Schema Builder
 *
 * Fluent API for building CREATE TABLE statements inside migrations.
 *
 * Usage:
 *   import { Schema } from '@axiljs/orm'
 *
 *   export async function up(db: TransactionContext) {
 *     await Schema.create('users', (table) => {
 *       table.id()
 *       table.string('name', 255)
 *       table.string('email', 255).unique()
 *       table.boolean('is_active').default(true)
 *       table.timestamps()
 *     }, db, 'postgres')
 *   }
 *
 *   export async function down(db: TransactionContext) {
 *     await Schema.drop('users', db)
 *   }
 */
import { TransactionContext } from '../connection/base-driver';
type DriverType = 'postgres' | 'mysql' | 'sqlite';
interface ColumnDef {
    name: string;
    type: string;
    notNull: boolean;
    unique: boolean;
    defaultVal?: string;
    extra?: string;
}
export declare class TableBuilder {
    private readonly tableName;
    private readonly driver;
    private columns;
    private indexes;
    constructor(tableName: string, driver: DriverType);
    id(): this;
    uuid(name?: string): this;
    string(name: string, length?: number): ColumnBuilder;
    text(name: string): ColumnBuilder;
    integer(name: string): ColumnBuilder;
    bigint(name: string): ColumnBuilder;
    float(name: string): ColumnBuilder;
    decimal(name: string, precision?: number, scale?: number): ColumnBuilder;
    boolean(name: string): ColumnBuilder;
    date(name: string): ColumnBuilder;
    datetime(name: string): ColumnBuilder;
    timestamp(name: string): ColumnBuilder;
    json(name: string): ColumnBuilder;
    foreignKey(name: string, refTable: string, refCol?: string): this;
    timestamps(): this;
    softDeletes(): this;
    index(columns: string[], name?: string): this;
    uniqueIndex(columns: string[], name?: string): this;
    toSQL(): string[];
    private _col;
}
declare class ColumnBuilder {
    private readonly def;
    constructor(def: ColumnDef);
    nullable(): this;
    unique(): this;
    default(value: string | number | boolean): this;
}
export declare class Schema {
    static create(table: string, callback: (t: TableBuilder) => void, db: TransactionContext, driver?: DriverType): Promise<void>;
    static drop(table: string, db: TransactionContext): Promise<void>;
    static dropIfExists(table: string, db: TransactionContext): Promise<void>;
    static rename(from: string, to: string, db: TransactionContext): Promise<void>;
    static addColumn(table: string, name: string, type: string, db: TransactionContext): Promise<void>;
    static dropColumn(table: string, name: string, db: TransactionContext): Promise<void>;
}
export {};
//# sourceMappingURL=schema-builder.d.ts.map