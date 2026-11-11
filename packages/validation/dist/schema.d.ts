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
export declare abstract class BaseValidator<T> {
    protected _optional: boolean;
    protected _nullable: boolean;
    protected _defaultValue: T | undefined;
    protected rules: Array<(value: T, path: string) => ValidationError | null>;
    protected _transforms: Array<(value: any) => unknown>;
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
     * Transform the validated output value (applied after validation, in the
     * order added; not called for null/undefined). The result is what parse()
     * and validate() hand back - validation rules still see the input value.
     *
     *   v.string().transform(s => s.toUpperCase())
     *   v.string().transform(Number)   // BaseValidator<number>
     */
    transform<U>(fn: (value: T) => U): BaseValidator<U>;
    /**
     * Validate a value. Returns errors if invalid.
     * @internal Used by ObjectValidator
     */
    _validate(value: unknown, path: string): ValidationError[];
    /**
     * Parse and validate. Returns typed result.
     */
    parse(value: unknown): ValidationResult<T>;
    /**
     * Build the output value for already-validated input
     * (applies defaults and transforms, including on nested fields).
     * @internal Used by ObjectValidator / ArrayValidator
     */
    _output(value: unknown): unknown;
    /**
     * Type-specific output (before transforms). Subclasses extend this.
     * @internal
     */
    protected _build(value: unknown): unknown;
    /**
     * Convert an accepted alternate input form to the output type
     * (e.g. numeric query-string values). Unrecognised values pass through
     * unchanged and are rejected by validateType().
     * @internal
     */
    protected _coerce(value: unknown): unknown;
    protected abstract validateType(value: unknown, path: string): ValidationError[];
}
export declare class StringValidator extends BaseValidator<string> {
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
    /**
     * Validate the trimmed string, and return it trimmed.
     */
    trim(): this;
    protected _build(value: unknown): unknown;
    protected validateType(value: unknown, path: string): ValidationError[];
}
export declare class NumberValidator extends BaseValidator<number> {
    private _min?;
    private _max?;
    private _integer;
    private _positive;
    min(value: number): this;
    max(value: number): this;
    integer(): this;
    positive(): this;
    /** Numeric strings (from query params / form data) become numbers. */
    protected _coerce(value: unknown): unknown;
    protected validateType(value: unknown, path: string): ValidationError[];
}
export declare class BooleanValidator extends BaseValidator<boolean> {
    /** String booleans from query params / form data become booleans. */
    protected _coerce(value: unknown): unknown;
    protected validateType(value: unknown, path: string): ValidationError[];
}
export declare class ArrayValidator<T> extends BaseValidator<T[]> {
    private itemValidator;
    private _min?;
    private _max?;
    constructor(itemValidator: BaseValidator<T>);
    min(length: number): this;
    max(length: number): this;
    protected validateType(value: unknown, path: string): ValidationError[];
    protected _build(value: unknown): unknown;
}
export type SchemaShape = Record<string, BaseValidator<any>>;
export type InferShape<S extends SchemaShape> = {
    [K in keyof S]: S[K] extends BaseValidator<infer T> ? T : never;
};
export declare class ObjectValidator<S extends SchemaShape> extends BaseValidator<InferShape<S>> {
    private shape;
    private _strip;
    constructor(shape: S);
    /**
     * Remove fields not defined in the schema.
     */
    strip(): this;
    protected validateType(value: unknown, path: string): ValidationError[];
    parse(value: unknown): ValidationResult<InferShape<S>>;
    protected _build(value: unknown): unknown;
}
export declare class EnumValidator<T extends string> extends BaseValidator<T> {
    private values;
    constructor(values: T[]);
    protected validateType(value: unknown, path: string): ValidationError[];
}
export type Primitive = string | number | boolean | null;
export declare class LiteralValidator<T extends Primitive> extends BaseValidator<T> {
    private expected;
    constructor(expected: T);
    protected validateType(value: unknown, path: string): ValidationError[];
}
export type InferValidator<V> = V extends BaseValidator<infer U> ? U : never;
export declare class UnionValidator<T> extends BaseValidator<T> {
    private options;
    constructor(options: BaseValidator<any>[]);
    /** The first option that accepts value, or undefined. */
    private matching;
    protected validateType(value: unknown, path: string): ValidationError[];
    protected _build(value: unknown): unknown;
}
export declare class RecordValidator<T> extends BaseValidator<Record<string, T>> {
    private valueValidator;
    constructor(valueValidator: BaseValidator<T>);
    protected validateType(value: unknown, path: string): ValidationError[];
    protected _build(value: unknown): unknown;
}
/**
 * Validation schema builder.
 * Entry point for all schema definitions.
 *
 * Usage:
 *   import { v } from '@axiljs/validation'
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
    literal: <T extends Primitive>(value: T) => LiteralValidator<T>;
    union: <V extends BaseValidator<any>[]>(options: [...V]) => UnionValidator<InferValidator<V[number]>>;
    record: <T>(valueSchema: BaseValidator<T>) => RecordValidator<T>;
};
//# sourceMappingURL=schema.d.ts.map