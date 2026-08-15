"use strict";
/**
 * Configuration schema and validation.
 * Define what env vars your app needs - get type-safe config back.
 *
 * Usage:
 *   const config = defineConfig({
 *     PORT: { type: 'number', default: 3000 },
 *     DATABASE_URL: { type: 'string', required: true },
 *     DEBUG: { type: 'boolean', default: false }
 *   })
 *
 *   config.PORT       // number
 *   config.DATABASE_URL // string
 *   config.DEBUG      // boolean
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.defineConfig = defineConfig;
const common_1 = require("@axil/common");
// ─── defineConfig ─────────────────────────────────────────────────────────────
/**
 * Define and validate application configuration from environment variables.
 * Throws ValidationError on startup if required vars are missing.
 *
 * @param schema  Configuration schema definition
 * @param source  Environment source (default: process.env)
 * @returns       Parsed and typed configuration object
 */
function defineConfig(schema, source = process.env) {
    const config = {};
    const errors = [];
    for (const [key, field] of Object.entries(schema)) {
        const rawValue = source[key];
        // Check if value is missing
        if (rawValue === undefined || rawValue === '') {
            if (field.required && field.default === undefined) {
                // Required and no default - validation error
                const desc = field.description ? ` (${field.description})` : '';
                errors.push(`Missing required environment variable: ${key}${desc}`);
                continue;
            }
            // Use default value
            config[key] = field.default;
            continue;
        }
        // Parse the string value into the correct type
        try {
            const parsed = parseValue(rawValue, field.type, key);
            // Run enum validation
            if (field.enum && !field.enum.includes(parsed)) {
                errors.push(`Invalid value for ${key}: '${rawValue}'. ` +
                    `Allowed values: ${field.enum.join(', ')}`);
                continue;
            }
            // Run numeric range validation
            if (field.type === 'number') {
                const num = parsed;
                if (field.min !== undefined && num < field.min) {
                    errors.push(`${key} must be >= ${field.min}, got ${num}`);
                    continue;
                }
                if (field.max !== undefined && num > field.max) {
                    errors.push(`${key} must be <= ${field.max}, got ${num}`);
                    continue;
                }
            }
            config[key] = parsed;
        }
        catch (parseError) {
            errors.push(parseError.message);
        }
    }
    // If any validation errors, throw them all at once
    if (errors.length > 0) {
        throw new common_1.ValidationError('Configuration validation failed:\n' +
            errors.map(e => `  - ${e}`).join('\n'), errors);
    }
    return config;
}
/**
 * Parse a string value into the specified type.
 */
function parseValue(raw, type, key) {
    switch (type) {
        case 'string':
            return raw;
        case 'number': {
            const num = Number(raw);
            if (isNaN(num)) {
                throw new Error(`Invalid value for ${key}: '${raw}' is not a valid number`);
            }
            return num;
        }
        case 'boolean': {
            const lower = raw.toLowerCase();
            if (['true', '1', 'yes', 'on'].includes(lower))
                return true;
            if (['false', '0', 'no', 'off'].includes(lower))
                return false;
            throw new Error(`Invalid value for ${key}: '${raw}' is not a valid boolean. ` +
                `Use true/false, 1/0, yes/no, on/off`);
        }
        case 'json': {
            try {
                return JSON.parse(raw);
            }
            catch {
                throw new Error(`Invalid value for ${key}: '${raw}' is not valid JSON`);
            }
        }
        default:
            return raw;
    }
}
//# sourceMappingURL=schema.js.map