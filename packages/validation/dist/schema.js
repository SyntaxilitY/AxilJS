"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.v = exports.RecordValidator = exports.UnionValidator = exports.LiteralValidator = exports.EnumValidator = exports.ObjectValidator = exports.ArrayValidator = exports.BooleanValidator = exports.NumberValidator = exports.StringValidator = exports.BaseValidator = void 0;
// ─── Base Validator ───────────────────────────────────────────────────────────
class BaseValidator {
    _optional = false;
    _nullable = false;
    _defaultValue = undefined;
    rules = [];
    _transforms = [];
    /**
     * Mark this field as optional (undefined is allowed).
     */
    optional() {
        this._optional = true;
        return this;
    }
    /**
     * Allow null values.
     */
    nullable() {
        this._nullable = true;
        return this;
    }
    /**
     * Set a default value when field is undefined.
     */
    default(value) {
        this._defaultValue = value;
        return this;
    }
    /**
     * Add a custom validation rule.
     */
    custom(fn, message) {
        this.rules.push((value, path) => {
            const result = fn(value);
            if (result === true)
                return null;
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
    transform(fn) {
        this._transforms.push(fn);
        return this;
    }
    /**
     * Validate a value. Returns errors if invalid.
     * @internal Used by ObjectValidator
     */
    _validate(value, path) {
        const errors = [];
        // Handle undefined
        if (value === undefined) {
            if (this._defaultValue !== undefined) {
                value = this._defaultValue;
            }
            else if (this._optional) {
                return []; // OK
            }
            else {
                return [{ path, message: `${path} is required`, code: 'REQUIRED' }];
            }
        }
        // Handle null
        if (value === null) {
            if (this._nullable)
                return [];
            return [{ path, message: `${path} cannot be null`, code: 'NULL_VALUE' }];
        }
        // Coerce accepted string forms (e.g. '5' -> 5) so type checks and
        // custom rules see the same value parse() returns
        value = this._coerce(value);
        // Type-specific validation
        const typeErrors = this.validateType(value, path);
        if (typeErrors.length > 0)
            return typeErrors;
        // Custom rules
        for (const rule of this.rules) {
            const error = rule(value, path);
            if (error)
                errors.push(error);
        }
        return errors;
    }
    /**
     * Parse and validate. Returns typed result.
     */
    parse(value) {
        const errors = this._validate(value, 'root');
        if (errors.length > 0) {
            return { success: false, errors };
        }
        return buildOutput(this, value);
    }
    /**
     * Build the output value for already-validated input
     * (applies defaults and transforms, including on nested fields).
     * @internal Used by ObjectValidator / ArrayValidator
     */
    _output(value) {
        let out = this._build(value);
        if (out === undefined || out === null)
            return out;
        for (const fn of this._transforms)
            out = fn(out);
        return out;
    }
    /**
     * Type-specific output (before transforms). Subclasses extend this.
     * @internal
     */
    _build(value) {
        const out = value === undefined ? this._defaultValue : value;
        return out === undefined || out === null ? out : this._coerce(out);
    }
    /**
     * Convert an accepted alternate input form to the output type
     * (e.g. numeric query-string values). Unrecognised values pass through
     * unchanged and are rejected by validateType().
     * @internal
     */
    _coerce(value) {
        return value;
    }
}
exports.BaseValidator = BaseValidator;
/** Build parse() output; a throwing transform becomes a validation error. */
function buildOutput(validator, value) {
    try {
        return { success: true, data: validator._output(value) };
    }
    catch (error) {
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
class StringValidator extends BaseValidator {
    _min;
    _max;
    _pattern;
    _emailMode = false;
    _urlMode = false;
    _trim = false;
    min(length) {
        this._min = length;
        return this;
    }
    max(length) {
        this._max = length;
        return this;
    }
    pattern(regex) {
        this._pattern = regex;
        return this;
    }
    email() {
        this._emailMode = true;
        return this;
    }
    url() {
        this._urlMode = true;
        return this;
    }
    /**
     * Validate the trimmed string, and return it trimmed.
     */
    trim() {
        this._trim = true;
        return this;
    }
    _build(value) {
        const out = super._build(value);
        return this._trim && typeof out === 'string' ? out.trim() : out;
    }
    validateType(value, path) {
        if (typeof value !== 'string') {
            return [{ path, message: `${path} must be a string`, code: 'TYPE_ERROR' }];
        }
        const str = this._trim ? value.trim() : value;
        const errors = [];
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
        if (this._pattern)
            this._pattern.lastIndex = 0;
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
            }
            catch {
                errors.push({ path, message: `${path} must be a valid URL`, code: 'URL' });
            }
        }
        return errors;
    }
}
exports.StringValidator = StringValidator;
// ─── Number Validator ─────────────────────────────────────────────────────────
class NumberValidator extends BaseValidator {
    _min;
    _max;
    _integer = false;
    _positive = false;
    min(value) { this._min = value; return this; }
    max(value) { this._max = value; return this; }
    integer() { this._integer = true; return this; }
    positive() { this._positive = true; return this; }
    /** Numeric strings (from query params / form data) become numbers. */
    _coerce(value) {
        if (typeof value !== 'string' || value.trim() === '')
            return value;
        const num = Number(value);
        return Number.isFinite(num) ? num : value;
    }
    validateType(value, path) {
        const num = value;
        // Strings that did not coerce are rejected here, as are NaN and
        // +/-Infinity (not usable numbers; also rejects 'Infinity') and +/-Infinity are not usable numbers (also rejects 'Infinity')
        if (typeof num !== 'number' || !Number.isFinite(num)) {
            return [{ path, message: `${path} must be a number`, code: 'TYPE_ERROR' }];
        }
        const errors = [];
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
exports.NumberValidator = NumberValidator;
// ─── Boolean Validator ────────────────────────────────────────────────────────
class BooleanValidator extends BaseValidator {
    /** String booleans from query params / form data become booleans. */
    _coerce(value) {
        if (value === 'true' || value === '1')
            return true;
        if (value === 'false' || value === '0')
            return false;
        return value;
    }
    validateType(value, path) {
        if (typeof value !== 'boolean') {
            return [{ path, message: `${path} must be a boolean`, code: 'TYPE_ERROR' }];
        }
        return [];
    }
}
exports.BooleanValidator = BooleanValidator;
// ─── Array Validator ──────────────────────────────────────────────────────────
class ArrayValidator extends BaseValidator {
    itemValidator;
    _min;
    _max;
    constructor(itemValidator) {
        super();
        this.itemValidator = itemValidator;
    }
    min(length) { this._min = length; return this; }
    max(length) { this._max = length; return this; }
    validateType(value, path) {
        if (!Array.isArray(value)) {
            return [{ path, message: `${path} must be an array`, code: 'TYPE_ERROR' }];
        }
        const errors = [];
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
    _build(value) {
        value = super._build(value);
        if (!Array.isArray(value))
            return value;
        return value.map(item => this.itemValidator._output(item));
    }
}
exports.ArrayValidator = ArrayValidator;
class ObjectValidator extends BaseValidator {
    shape;
    _strip = false; // Strip unknown fields
    constructor(shape) {
        super();
        this.shape = shape;
    }
    /**
     * Remove fields not defined in the schema.
     */
    strip() {
        this._strip = true;
        return this;
    }
    validateType(value, path) {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            return [{ path, message: `${path} must be an object`, code: 'TYPE_ERROR' }];
        }
        const errors = [];
        const obj = value;
        for (const [key, validator] of Object.entries(this.shape)) {
            const fieldPath = path === 'root' ? key : `${path}.${key}`;
            const fieldErrors = validator._validate(obj[key], fieldPath);
            errors.push(...fieldErrors);
        }
        return errors;
    }
    parse(value) {
        const errors = this._validate(value, 'root');
        if (errors.length > 0) {
            return { success: false, errors };
        }
        // Applies defaults, strip() and transforms recursively (incl. nested objects)
        return buildOutput(this, value);
    }
    _build(value) {
        value = super._build(value);
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            return value;
        }
        const src = value;
        // Strip unknown fields if configured, otherwise keep them
        const out = this._strip ? {} : { ...src };
        for (const [key, validator] of Object.entries(this.shape)) {
            const fieldValue = validator._output(src[key]);
            if (fieldValue !== undefined || key in src) {
                out[key] = fieldValue;
            }
        }
        return out;
    }
}
exports.ObjectValidator = ObjectValidator;
// ─── Enum Validator ───────────────────────────────────────────────────────────
class EnumValidator extends BaseValidator {
    values;
    constructor(values) {
        super();
        this.values = values;
    }
    validateType(value, path) {
        if (!this.values.includes(value)) {
            return [{
                    path,
                    message: `${path} must be one of: ${this.values.join(', ')}`,
                    code: 'ENUM'
                }];
        }
        return [];
    }
}
exports.EnumValidator = EnumValidator;
class LiteralValidator extends BaseValidator {
    expected;
    constructor(expected) {
        super();
        this.expected = expected;
        // v.literal(null) must accept null
        if (expected === null)
            this._nullable = true;
    }
    validateType(value, path) {
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
exports.LiteralValidator = LiteralValidator;
class UnionValidator extends BaseValidator {
    options;
    constructor(options) {
        super();
        this.options = options;
        // null is allowed if any option allows it (e.g. v.literal(null))
        if (options.some(option => option._validate(null, 'root').length === 0)) {
            this._nullable = true;
        }
    }
    /** The first option that accepts value, or undefined. */
    matching(value) {
        return this.options.find(option => option._validate(value, 'root').length === 0);
    }
    validateType(value, path) {
        if (this.matching(value))
            return [];
        return [{
                path,
                message: `${path} does not match any of the allowed types`,
                code: 'UNION'
            }];
    }
    _build(value) {
        value = super._build(value);
        if (value === undefined || value === null)
            return value;
        // Output (defaults, transforms, strip) of the option that matched
        const option = this.matching(value);
        return option ? option._output(value) : value;
    }
}
exports.UnionValidator = UnionValidator;
// ─── Record Validator ─────────────────────────────────────────────────────────
class RecordValidator extends BaseValidator {
    valueValidator;
    constructor(valueValidator) {
        super();
        this.valueValidator = valueValidator;
    }
    validateType(value, path) {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            return [{ path, message: `${path} must be an object`, code: 'TYPE_ERROR' }];
        }
        const errors = [];
        for (const [key, item] of Object.entries(value)) {
            const fieldPath = path === 'root' ? key : `${path}.${key}`;
            errors.push(...this.valueValidator._validate(item, fieldPath));
        }
        return errors;
    }
    _build(value) {
        value = super._build(value);
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
            return value;
        }
        const out = {};
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
exports.RecordValidator = RecordValidator;
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
exports.v = {
    string: () => new StringValidator(),
    number: () => new NumberValidator(),
    boolean: () => new BooleanValidator(),
    array: (item) => new ArrayValidator(item),
    object: (shape) => new ObjectValidator(shape),
    enum: (values) => new EnumValidator(values),
    literal: (value) => new LiteralValidator(value),
    union: (options) => new UnionValidator(options),
    record: (valueSchema) => new RecordValidator(valueSchema)
};
//# sourceMappingURL=schema.js.map