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

// ─── Validation Result ────────────────────────────────────────────────────────

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: ValidationError[];
}

export interface ValidationError {
  // Dot-path to the failing field: 'user.address.street'
  path: string;

  // Human readable message
  message: string;

  // Machine readable code
  code: string;
}

// ─── Base Validator ───────────────────────────────────────────────────────────

export abstract class BaseValidator<T> {
  protected _optional: boolean = false;
  protected _nullable: boolean = false;
  protected _defaultValue: T | undefined = undefined;
  protected rules: Array<(value: T, path: string) => ValidationError | null> = [];
  protected _transforms: Array<(value: any) => unknown> = [];

  /**
   * Mark this field as optional (undefined is allowed).
   */
  optional(): this {
    this._optional = true;
    return this;
  }

  /**
   * Allow null values.
   */
  nullable(): this {
    this._nullable = true;
    return this;
  }

  /**
   * Set a default value when field is undefined.
   */
  default(value: T): this {
    this._defaultValue = value;
    return this;
  }

  /**
   * Add a custom validation rule.
   */
  custom(
    fn: (value: T) => boolean | string,
    message?: string
  ): this {
    this.rules.push((value, path) => {
      const result = fn(value);
      if (result === true) return null;
      return {
        path,
        message: typeof result === 'string' ? result : (message || 'Custom validation failed'),
        code: 'CUSTOM'
      };
    });
    return this;
  }

  /**
   * Transform the validated output value (applied after validation, in the
   * order added; not called for null/undefined). The result is what parse()
   * and validate() hand back - validation rules still see the input value.
   *
   *   v.string().transform(s => s.toUpperCase())
   *   v.string().transform(Number)   // BaseValidator<number>
   */
  transform<U>(fn: (value: T) => U): BaseValidator<U> {
    this._transforms.push(fn);
    return this as unknown as BaseValidator<U>;
  }

  /**
   * Validate a value. Returns errors if invalid.
   * @internal Used by ObjectValidator
   */
  _validate(value: unknown, path: string): ValidationError[] {
    const errors: ValidationError[] = [];

    // Handle undefined
    if (value === undefined) {
      if (this._defaultValue !== undefined) {
        value = this._defaultValue;
      } else if (this._optional) {
        return []; // OK
      } else {
        return [{ path, message: `${path} is required`, code: 'REQUIRED' }];
      }
    }

    // Handle null
    if (value === null) {
      if (this._nullable) return [];
      return [{ path, message: `${path} cannot be null`, code: 'NULL_VALUE' }];
    }

    // Coerce accepted string forms (e.g. '5' -> 5) so type checks and
    // custom rules see the same value parse() returns
    value = this._coerce(value);

    // Type-specific validation
    const typeErrors = this.validateType(value, path);
    if (typeErrors.length > 0) return typeErrors;

    // Custom rules
    for (const rule of this.rules) {
      const error = rule(value as T, path);
      if (error) errors.push(error);
    }

    return errors;
  }

  /**
   * Parse and validate. Returns typed result.
   */
  parse(value: unknown): ValidationResult<T> {
    const errors = this._validate(value, 'root');

    if (errors.length > 0) {
      return { success: false, errors };
    }

    return buildOutput<T>(this, value);
  }

  /**
   * Build the output value for already-validated input
   * (applies defaults and transforms, including on nested fields).
   * @internal Used by ObjectValidator / ArrayValidator
   */
  _output(value: unknown): unknown {
    let out = this._build(value);
    if (out === undefined || out === null) return out;
    for (const fn of this._transforms) out = fn(out);
    return out;
  }

  /**
   * Type-specific output (before transforms). Subclasses extend this.
   * @internal
   */
  protected _build(value: unknown): unknown {
    const out = value === undefined ? this._defaultValue : value;
    return out === undefined || out === null ? out : this._coerce(out);
  }

  /**
   * Convert an accepted alternate input form to the output type
   * (e.g. numeric query-string values). Unrecognised values pass through
   * unchanged and are rejected by validateType().
   * @internal
   */
  protected _coerce(value: unknown): unknown {
    return value;
  }

  protected abstract validateType(value: unknown, path: string): ValidationError[];
}

/** Build parse() output; a throwing transform becomes a validation error. */
function buildOutput<T>(validator: BaseValidator<any>, value: unknown): ValidationResult<T> {
  try {
    return { success: true, data: validator._output(value) as T };
  } catch (error) {
    return {
      success: false,
      errors: [{
        path: 'root',
        message: error instanceof Error ? error.message : String(error),
        code: 'TRANSFORM_ERROR'
      }]
    };
  }
}

// ─── String Validator ─────────────────────────────────────────────────────────

export class StringValidator extends BaseValidator<string> {
  private _min?: number;
  private _max?: number;
  private _pattern?: RegExp;
  private _emailMode: boolean = false;
  private _urlMode: boolean = false;
  private _trim: boolean = false;

  min(length: number): this {
    this._min = length;
    return this;
  }

  max(length: number): this {
    this._max = length;
    return this;
  }

  pattern(regex: RegExp): this {
    this._pattern = regex;
    return this;
  }

  email(): this {
    this._emailMode = true;
    return this;
  }

  url(): this {
    this._urlMode = true;
    return this;
  }

  /**
   * Validate the trimmed string, and return it trimmed.
   */
  trim(): this {
    this._trim = true;
    return this;
  }

  protected _build(value: unknown): unknown {
    const out = super._build(value);
    return this._trim && typeof out === 'string' ? out.trim() : out;
  }

  protected validateType(value: unknown, path: string): ValidationError[] {
    if (typeof value !== 'string') {
      return [{ path, message: `${path} must be a string`, code: 'TYPE_ERROR' }];
    }

    const str = this._trim ? value.trim() : value;
    const errors: ValidationError[] = [];

    if (this._min !== undefined && str.length < this._min) {
      errors.push({
        path,
        message: `${path} must be at least ${this._min} characters`,
        code: 'MIN_LENGTH'
      });
    }

    if (this._max !== undefined && str.length > this._max) {
      errors.push({
        path,
        message: `${path} must be at most ${this._max} characters`,
        code: 'MAX_LENGTH'
      });
    }

    // Reset lastIndex so /g or /y regexes don't carry state between calls
    if (this._pattern) this._pattern.lastIndex = 0;
    if (this._pattern && !this._pattern.test(str)) {
      errors.push({
        path,
        message: `${path} does not match required pattern`,
        code: 'PATTERN'
      });
    }

    if (this._emailMode) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(str)) {
        errors.push({ path, message: `${path} must be a valid email address`, code: 'EMAIL' });
      }
    }

    if (this._urlMode) {
      try {
        new URL(str);
      } catch {
        errors.push({ path, message: `${path} must be a valid URL`, code: 'URL' });
      }
    }

    return errors;
  }
}

// ─── Number Validator ─────────────────────────────────────────────────────────

export class NumberValidator extends BaseValidator<number> {
  private _min?: number;
  private _max?: number;
  private _integer: boolean = false;
  private _positive: boolean = false;

  min(value: number): this { this._min = value; return this; }
  max(value: number): this { this._max = value; return this; }
  integer(): this { this._integer = true; return this; }
  positive(): this { this._positive = true; return this; }

  /** Numeric strings (from query params / form data) become numbers. */
  protected _coerce(value: unknown): unknown {
    if (typeof value !== 'string' || value.trim() === '') return value;
    const num = Number(value);
    return Number.isFinite(num) ? num : value;
  }

  protected validateType(value: unknown, path: string): ValidationError[] {
    const num = value;

    // Strings that did not coerce are rejected here, as are NaN and
    // +/-Infinity (not usable numbers; also rejects 'Infinity') and +/-Infinity are not usable numbers (also rejects 'Infinity')
    if (typeof num !== 'number' || !Number.isFinite(num)) {
      return [{ path, message: `${path} must be a number`, code: 'TYPE_ERROR' }];
    }

    const errors: ValidationError[] = [];

    if (this._integer && !Number.isInteger(num)) {
      errors.push({ path, message: `${path} must be an integer`, code: 'INTEGER' });
    }

    if (this._positive && num <= 0) {
      errors.push({ path, message: `${path} must be a positive number`, code: 'POSITIVE' });
    }

    if (this._min !== undefined && num < this._min) {
      errors.push({ path, message: `${path} must be >= ${this._min}`, code: 'MIN_VALUE' });
    }

    if (this._max !== undefined && num > this._max) {
      errors.push({ path, message: `${path} must be <= ${this._max}`, code: 'MAX_VALUE' });
    }

    return errors;
  }
}

// ─── Boolean Validator ────────────────────────────────────────────────────────

export class BooleanValidator extends BaseValidator<boolean> {
  /** String booleans from query params / form data become booleans. */
  protected _coerce(value: unknown): unknown {
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
    return value;
  }

  protected validateType(value: unknown, path: string): ValidationError[] {
    if (typeof value !== 'boolean') {
      return [{ path, message: `${path} must be a boolean`, code: 'TYPE_ERROR' }];
    }
    return [];
  }
}

// ─── Array Validator ──────────────────────────────────────────────────────────

export class ArrayValidator<T> extends BaseValidator<T[]> {
  private _min?: number;
  private _max?: number;

  constructor(private itemValidator: BaseValidator<T>) {
    super();
  }

  min(length: number): this { this._min = length; return this; }
  max(length: number): this { this._max = length; return this; }

  protected validateType(value: unknown, path: string): ValidationError[] {
    if (!Array.isArray(value)) {
      return [{ path, message: `${path} must be an array`, code: 'TYPE_ERROR' }];
    }

    const errors: ValidationError[] = [];

    if (this._min !== undefined && value.length < this._min) {
      errors.push({
        path,
        message: `${path} must have at least ${this._min} items`,
        code: 'MIN_ITEMS'
      });
    }

    if (this._max !== undefined && value.length > this._max) {
      errors.push({
        path,
        message: `${path} must have at most ${this._max} items`,
        code: 'MAX_ITEMS'
      });
    }

    // Validate each item
    value.forEach((item, index) => {
      const itemErrors = this.itemValidator._validate(item, `${path}[${index}]`);
      errors.push(...itemErrors);
    });

    return errors;
  }

  protected _build(value: unknown): unknown {
    value = super._build(value);
    if (!Array.isArray(value)) return value;
    return value.map(item => this.itemValidator._output(item));
  }
}

// ─── Object Validator ─────────────────────────────────────────────────────────

export type SchemaShape = Record<string, BaseValidator<any>>;
export type InferShape<S extends SchemaShape> = {
  [K in keyof S]: S[K] extends BaseValidator<infer T> ? T : never;
};

export class ObjectValidator<S extends SchemaShape> extends BaseValidator<InferShape<S>> {
  private _strip: boolean = false; // Strip unknown fields

  constructor(private shape: S) {
    super();
  }

  /**
   * Remove fields not defined in the schema.
   */
  strip(): this {
    this._strip = true;
    return this;
  }

  protected validateType(value: unknown, path: string): ValidationError[] {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return [{ path, message: `${path} must be an object`, code: 'TYPE_ERROR' }];
    }

    const errors: ValidationError[] = [];
    const obj = value as Record<string, unknown>;

    for (const [key, validator] of Object.entries(this.shape)) {
      const fieldPath = path === 'root' ? key : `${path}.${key}`;
      const fieldErrors = validator._validate(obj[key], fieldPath);
      errors.push(...fieldErrors);
    }

    return errors;
  }

  parse(value: unknown): ValidationResult<InferShape<S>> {
    const errors = this._validate(value, 'root');

    if (errors.length > 0) {
      return { success: false, errors };
    }

    // Applies defaults, strip() and transforms recursively (incl. nested objects)
    return buildOutput<InferShape<S>>(this, value);
  }

  protected _build(value: unknown): unknown {
    value = super._build(value);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return value;
    }

    const src = value as Record<string, unknown>;

    // Strip unknown fields if configured, otherwise keep them
    const out: Record<string, unknown> = this._strip ? {} : { ...src };

    for (const [key, validator] of Object.entries(this.shape)) {
      const fieldValue = validator._output(src[key]);
      if (fieldValue !== undefined || key in src) {
        out[key] = fieldValue;
      }
    }

    return out;
  }
}

// ─── Enum Validator ───────────────────────────────────────────────────────────

export class EnumValidator<T extends string> extends BaseValidator<T> {
  constructor(private values: T[]) {
    super();
  }

  protected validateType(value: unknown, path: string): ValidationError[] {
    if (!this.values.includes(value as T)) {
      return [{
        path,
        message: `${path} must be one of: ${this.values.join(', ')}`,
        code: 'ENUM'
      }];
    }
    return [];
  }
}

// ─── Literal Validator ────────────────────────────────────────────────────────

export type Primitive = string | number | boolean | null;

export class LiteralValidator<T extends Primitive> extends BaseValidator<T> {
  constructor(private expected: T) {
    super();
    // v.literal(null) must accept null
    if (expected === null) this._nullable = true;
  }

  protected validateType(value: unknown, path: string): ValidationError[] {
    if (value !== this.expected) {
      return [{
        path,
        message: `${path} must be ${JSON.stringify(this.expected)}`,
        code: 'LITERAL'
      }];
    }
    return [];
  }
}

// ─── Union Validator ──────────────────────────────────────────────────────────

export type InferValidator<V> = V extends BaseValidator<infer U> ? U : never;

export class UnionValidator<T> extends BaseValidator<T> {
  constructor(private options: BaseValidator<any>[]) {
    super();
    // null is allowed if any option allows it (e.g. v.literal(null))
    if (options.some(option => option._validate(null, 'root').length === 0)) {
      this._nullable = true;
    }
  }

  /** The first option that accepts value, or undefined. */
  private matching(value: unknown): BaseValidator<any> | undefined {
    return this.options.find(option => option._validate(value, 'root').length === 0);
  }

  protected validateType(value: unknown, path: string): ValidationError[] {
    if (this.matching(value)) return [];
    return [{
      path,
      message: `${path} does not match any of the allowed types`,
      code: 'UNION'
    }];
  }

  protected _build(value: unknown): unknown {
    value = super._build(value);
    if (value === undefined || value === null) return value;
    // Output (defaults, transforms, strip) of the option that matched
    const option = this.matching(value);
    return option ? option._output(value) : value;
  }
}

// ─── Record Validator ─────────────────────────────────────────────────────────

export class RecordValidator<T> extends BaseValidator<Record<string, T>> {
  constructor(private valueValidator: BaseValidator<T>) {
    super();
  }

  protected validateType(value: unknown, path: string): ValidationError[] {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return [{ path, message: `${path} must be an object`, code: 'TYPE_ERROR' }];
    }

    const errors: ValidationError[] = [];
    for (const [key, item] of Object.entries(value)) {
      const fieldPath = path === 'root' ? key : `${path}.${key}`;
      errors.push(...this.valueValidator._validate(item, fieldPath));
    }
    return errors;
  }

  protected _build(value: unknown): unknown {
    value = super._build(value);
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return value;
    }

    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      // defineProperty so a "__proto__" key can't replace the prototype
      Object.defineProperty(out, key, {
        value: this.valueValidator._output(item),
        enumerable: true,
        writable: true,
        configurable: true
      });
    }
    return out;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Validation schema builder.
 * Entry point for all schema definitions.
 *
 * Usage:
 *   import { v } from '@axiljs/validation'
 *
 *   const schema = v.object({ name: v.string().min(1) })
 */
export const v = {
  string: () => new StringValidator(),
  number: () => new NumberValidator(),
  boolean: () => new BooleanValidator(),
  array: <T>(item: BaseValidator<T>) => new ArrayValidator(item),
  object: <S extends SchemaShape>(shape: S) => new ObjectValidator(shape),
  enum: <T extends string>(values: T[]) => new EnumValidator(values),
  literal: <T extends Primitive>(value: T) => new LiteralValidator(value),
  union: <V extends BaseValidator<any>[]>(options: [...V]) =>
    new UnionValidator<InferValidator<V[number]>>(options),
  record: <T>(valueSchema: BaseValidator<T>) => new RecordValidator(valueSchema)
};
