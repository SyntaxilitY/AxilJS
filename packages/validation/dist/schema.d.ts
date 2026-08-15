/**
 * Schema-based validation.
 * Define schemas, validate data, get typed results and detailed errors.
 * Zero external dependencies.
 *
 * Usage:
 *   const schema = v.object({
 *     name:  v.string().min(2).max(100),
 *     email: v.string().email(),
 *     age:   v.number().min(0).max(150).optional(),
 *     role:  v.enum(['admin', 'user', 'guest'])
 *   })
 *
 *   const result = schema.parse(req.body)
 *   if (!result.success) {
 *     res.status(422).json({ errors: result.errors })
 *   }
 */
export interface ValidationResult<T> {
    success: boolean;
    data?: T;
    errors?: ValidationError[];
}
export interface ValidationError {
    path: string;
    message: string;
    code: string;
}
declare abstract class BaseValidator<T> {
    protected _optional: boolean;
    protected _nullable: boolean;
    protected _defaultValue: T | undefined;
    protected rules: Array<(value: T, path: string) => ValidationError | null>;
    /**
     * Mark this field as optional (undefined is allowed).
     */
    optional(): this;
    /**
     * Allow null values.
     */
    nullable(): this;
    /**
     * Set a default value when field is undefined.
     */
    default(value: T): this;
    /**
     * Add a custom validation rule.
     */
    custom(fn: (value: T) => boolean | string, message?: string): this;
    /**
     * Validate a value. Returns errors if invalid.
     * @internal Used by ObjectValidator
     */
    _validate(value: unknown, path: string): ValidationError[];
    /**
     * Parse and validate. Returns typed result.
     */
    parse(value: unknown): ValidationResult<T>;
    protected abstract validateType(value: unknown, path: string): ValidationError[];
}
declare class StringValidator extends BaseValidator<string> {
    private _min?;
    private _max?;
    private _pattern?;
    private _emailMode;
    private _urlMode;
    private _trim;
    min(length: number): this;
    max(length: number): this;
    pattern(regex: RegExp): this;
    email(): this;
    url(): this;
    trim(): this;
    protected validateType(value: unknown, path: string): ValidationError[];
}
declare class NumberValidator extends BaseValidator<number> {
    private _min?;
    private _max?;
    private _integer;
    private _positive;
    min(value: number): this;
    max(value: number): this;
    integer(): this;
    positive(): this;
    protected validateType(value: unknown, path: string): ValidationError[];
}
declare class BooleanValidator extends BaseValidator<boolean> {
    protected validateType(value: unknown, path: string): ValidationError[];
}
declare class ArrayValidator<T> extends BaseValidator<T[]> {
    private itemValidator;
    private _min?;
    private _max?;
    constructor(itemValidator: BaseValidator<T>);
    min(length: number): this;
    max(length: number): this;
    protected validateType(value: unknown, path: string): ValidationError[];
}
type SchemaShape = Record<string, BaseValidator<any>>;
type InferShape<S extends SchemaShape> = {
    [K in keyof S]: S[K] extends BaseValidator<infer T> ? T : never;
};
declare class ObjectValidator<S extends SchemaShape> extends BaseValidator<InferShape<S>> {
    private shape;
    private _strip;
    constructor(shape: S);
    /**
     * Remove fields not defined in the schema.
     */
    strip(): this;
    protected validateType(value: unknown, path: string): ValidationError[];
    parse(value: unknown): ValidationResult<InferShape<S>>;
}
declare class EnumValidator<T extends string> extends BaseValidator<T> {
    private values;
    constructor(values: T[]);
    protected validateType(value: unknown, path: string): ValidationError[];
}
/**
 * Validation schema builder.
 * Entry point for all schema definitions.
 *
 * Usage:
 *   import { v } from '@axil/validation'
 *
 *   const schema = v.object({ name: v.string().min(1) })
 */
export declare const v: {
    string: () => StringValidator;
    number: () => NumberValidator;
    boolean: () => BooleanValidator;
    array: <T>(item: BaseValidator<T>) => ArrayValidator<T>;
    object: <S extends SchemaShape>(shape: S) => ObjectValidator<S>;
    enum: <T extends string>(values: T[]) => EnumValidator<T>;
};
export type { BaseValidator };
//# sourceMappingURL=schema.d.ts.map