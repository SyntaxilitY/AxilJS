/**
 * AxilORM — Base Model
 * Trace ID: 992f2995fd8091f39f6f41f757fb766a
 *
 * Uses polymorphic `this` typing so that:
 *   User.create({ name: 'x' })  →  Promise<User>   (not Promise<BaseModel>)
 *   User.find(1)                →  Promise<User | null>
 *   user.save()                 →  Promise<User>
 */
import { QueryBuilder } from '../query/query-builder';
import type { BaseDriver } from '../connection/base-driver';
type ModelClass<T extends BaseModel = BaseModel> = (new (...args: any[]) => T) & typeof BaseModel;
export declare class BaseModel {
    static setDriver(driver: BaseDriver, driverType: string): void;
    static getDriver(): BaseDriver;
    static getDriverType(): string;
    static getTableName(): string;
    static query<TThis extends ModelClass>(this: TThis): QueryBuilder<Record<string, unknown>>;
    static all<TThis extends ModelClass>(this: TThis): Promise<InstanceType<TThis>[]>;
    static find<TThis extends ModelClass>(this: TThis, id: number | string): Promise<InstanceType<TThis> | null>;
    static findOrFail<TThis extends ModelClass>(this: TThis, id: number | string): Promise<InstanceType<TThis>>;
    static where<TThis extends ModelClass>(this: TThis, column: string, operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE', value: unknown): QueryBuilder<Record<string, unknown>>;
    static create<TThis extends ModelClass>(this: TThis, data: Partial<InstanceType<TThis>>): Promise<InstanceType<TThis>>;
    static updateWhere<TThis extends ModelClass>(this: TThis, conditions: Partial<InstanceType<TThis>>, data: Partial<InstanceType<TThis>>): Promise<number>;
    static deleteWhere<TThis extends ModelClass>(this: TThis, conditions: Partial<InstanceType<TThis>>): Promise<number>;
    static count<TThis extends ModelClass>(this: TThis): Promise<number>;
    static paginate<TThis extends ModelClass>(this: TThis, page: number, perPage?: number): Promise<{
        data: InstanceType<TThis>[];
        total: number;
        page: number;
        perPage: number;
        lastPage: number;
    }>;
    /** @internal */ private _isNew;
    /** @internal */ private _original;
    /** @internal */ private _dirty;
    save(): Promise<this>;
    delete(): Promise<void>;
    refresh(): Promise<this>;
    isDirty(column?: string): boolean;
    isNew(): boolean;
    toJSON(): Record<string, unknown>;
    private _toColumnMap;
    static _hydrate<TThis extends ModelClass>(ctor: TThis, row: Record<string, unknown>): InstanceType<TThis>;
}
export {};
//# sourceMappingURL=base-model.d.ts.map