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

abstract class BaseValidator<T> {
  protected _optional: boolean = false;
  protected _nullable: boolean = false;
  protected _defaultValue: T | undefined = undefined;
  protected rules: Array<(value: T, path: string) => ValidationError | null> = [];

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

    return {
      success: true,
      data: (value === undefined ? this._defaultValue : value) as T
    };
  }

  protected abstract validateType(value: unknown, path: string): ValidationError[];
}

// ─── String Validator ─────────────────────────────────────────────────────────

class StringValidator extends BaseValidator<string> {
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

  trim(): this {
    this._trim = true;
    return this;
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

class NumberValidator extends BaseValidator<number> {
  private _min?: number;
  private _max?: number;
  private _integer: boolean = false;
  private _positive: boolean = false;

  min(value: number): this { this._min = value; return this; }
  max(value: number): this { this._max = value; return this; }
  integer(): this { this._integer = true; return this; }
  positive(): this { this._positive = true; return this; }

  protected validateType(value: unknown, path: string): ValidationError[] {
    // Accept string numbers too (from query params)
    const num = typeof value === 'string' ? Number(value) : value;

    if (typeof num !== 'number' || isNaN(num)) {
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

class BooleanValidator extends BaseValidator<boolean> {
  protected validateType(value: unknown, path: string): ValidationError[] {
    // Accept string booleans from query params / form data
    if (value === 'true' || value === '1') return [];
    if (value === 'false' || value === '0') return [];

    if (typeof value !== 'boolean') {
      return [{ path, message: `${path} must be a boolean`, code: 'TYPE_ERROR' }];
    }
    return [];
  }
}

// ─── Array Validator ──────────────────────────────────────────────────────────

class ArrayValidator<T> extends BaseValidator<T[]> {
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
}

// ─── Object Validator ─────────────────────────────────────────────────────────

type SchemaShape = Record<string, BaseValidator<any>>;
type InferShape<S extends SchemaShape> = {
  [K in keyof S]: S[K] extends BaseValidator<infer T> ? T : never;
};

class ObjectValidator<S extends SchemaShape> extends BaseValidator<InferShape<S>> {
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

    let data = value as InferShape<S>;

    // Strip unknown fields if configured
    if (this._strip && data) {
      const stripped: Record<string, unknown> = {};
      for (const key of Object.keys(this.shape)) {
        if (key in (data as object)) {
          stripped[key] = (data as any)[key];
        }
      }
      data = stripped as InferShape<S>;
    }

    return { success: true, data };
  }
}

// ─── Enum Validator ───────────────────────────────────────────────────────────

class EnumValidator<T extends string> extends BaseValidator<T> {
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

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Validation schema builder.
 * Entry point for all schema definitions.
 *
 * Usage:
 *   import { v } from '@axil/validation'
 *
 *   const schema = v.object({ name: v.string().min(1) })
 */
export const v = {
  string: () => new StringValidator(),
  number: () => new NumberValidator(),
  boolean: () => new BooleanValidator(),
  array: <T>(item: BaseValidator<T>) => new ArrayValidator(item),
  object: <S extends SchemaShape>(shape: S) => new ObjectValidator(shape),
  enum: <T extends string>(values: T[]) => new EnumValidator(values)
};

export type { BaseValidator };