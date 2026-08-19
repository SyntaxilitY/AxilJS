/**
 * AxilORM — Query Builder
 *
 * Fluent, chainable, driver-aware query builder.
 * Faster than Prisma/TypeORM because:
 *   - No reflection overhead
 *   - Zero-copy result mapping
 *   - Lazy SQL compilation
 *   - Direct driver pass-through
 */
import { BaseDriver } from '../connection/base-driver';
type Operator = '=' | '!=' | '>' | '<' | '>=' | '<=' | 'LIKE' | 'IN' | 'NOT IN' | 'IS NULL' | 'IS NOT NULL';
type OrderDir = 'ASC' | 'DESC';
type JoinType = 'INNER' | 'LEFT' | 'RIGHT' | 'FULL';
export declare class QueryBuilder<T = Record<string, unknown>> {
    private readonly driver;
    private readonly driverType;
    private _table;
    private _selects;
    private _wheres;
    private _joins;
    private _orders;
    private _groupBy;
    private _having;
    private _limit?;
    private _offset?;
    private _params;
    private _paramIdx;
    constructor(driver: BaseDriver, driverType: string);
    from(table: string): this;
    table(table: string): this;
    select(...columns: string[]): this;
    addSelect(...columns: string[]): this;
    where(column: string, operator: Operator, value?: unknown): this;
    orWhere(column: string, operator: Operator, value?: unknown): this;
    whereRaw(raw: string): this;
    whereIn(column: string, values: unknown[]): this;
    whereNull(column: string): this;
    whereNotNull(column: string): this;
    join(table: string, on: string, type?: JoinType): this;
    leftJoin(table: string, on: string): this;
    rightJoin(table: string, on: string): this;
    orderBy(column: string, direction?: OrderDir): this;
    groupBy(...columns: string[]): this;
    having(condition: string): this;
    limit(n: number): this;
    offset(n: number): this;
    paginate(page: number, perPage: number): this;
    private nextParam;
    private compileWheres;
    toSQL(): {
        sql: string;
        params: unknown[];
    };
    get(): Promise<T[]>;
    first(): Promise<T | null>;
    firstOrFail(): Promise<T>;
    count(): Promise<number>;
    exists(): Promise<boolean>;
    pluck<K extends keyof T>(column: K): Promise<T[K][]>;
    insert(data: Partial<T>): Promise<T>;
    insertMany(rows: Partial<T>[]): Promise<number>;
    update(data: Partial<T>): Promise<number>;
    delete(): Promise<number>;
    increment(column: string, by?: number): Promise<void>;
    decrement(column: string, by?: number): Promise<void>;
    sum(column: string): Promise<number>;
    avg(column: string): Promise<number>;
    max(column: string): Promise<number>;
    min(column: string): Promise<number>;
    raw<R = unknown>(sql: string, params?: unknown[]): Promise<R[]>;
}
export {};
//# sourceMappingURL=query-builder.d.ts.map