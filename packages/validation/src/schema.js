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
exports.v = void 0;
// ─── Base Validator ───────────────────────────────────────────────────────────
class BaseValidator {
    _optional = false;
    _nullable = false;
    _defaultValue = undefined;
    rules = [];
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
        return {
            success: true,
            data: (value === undefined ? this._defaultValue : value)
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
    trim() {
        this._trim = true;
        return this;
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
    validateType(value, path) {
        // Accept string numbers too (from query params)
        const num = typeof value === 'string' ? Number(value) : value;
        if (typeof num !== 'number' || isNaN(num)) {
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
// ─── Boolean Validator ────────────────────────────────────────────────────────
class BooleanValidator extends BaseValidator {
    validateType(value, path) {
        // Accept string booleans from query params / form data
        if (value === 'true' || value === '1')
            return [];
        if (value === 'false' || value === '0')
            return [];
        if (typeof value !== 'boolean') {
            return [{ path, message: `${path} must be a boolean`, code: 'TYPE_ERROR' }];
        }
        return [];
    }
}
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
}
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
        let data = value;
        // Strip unknown fields if configured
        if (this._strip && data) {
            const stripped = {};
            for (const key of Object.keys(this.shape)) {
                if (key in data) {
                    stripped[key] = data[key];
                }
            }
            data = stripped;
        }
        return { success: true, data };
    }
}
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
exports.v = {
    string: () => new StringValidator(),
    number: () => new NumberValidator(),
    boolean: () => new BooleanValidator(),
    array: (item) => new ArrayValidator(item),
    object: (shape) => new ObjectValidator(shape),
    enum: (values) => new EnumValidator(values)
};
//# sourceMappingURL=schema.js.map