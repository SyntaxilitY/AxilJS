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

import { ValidationError } from '@axil/common';

// ─── Schema Field Types ───────────────────────────────────────────────────────

// Supported field types
type FieldType = 'string' | 'number' | 'boolean' | 'json';

// Map field type to TypeScript type
type TypeMap = {
  string: string;
  number: number;
  boolean: boolean;
  json: unknown;
};

// ─── Field Definition ─────────────────────────────────────────────────────────

interface FieldDef<T extends FieldType> {
  // Data type - determines how the string value is parsed
  type: T;

  // If true, startup fails when this env var is missing
  required?: boolean;

  // Default value if the env var is not set
  default?: TypeMap[T];

  // Human-readable description (shown in error messages)
  description?: string;

  // Allowed values (enum validation)
  enum?: TypeMap[T][];

  // Minimum value (for numbers)
  min?: number;

  // Maximum value (for numbers)
  max?: number;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

// A schema is a map of env var names to field definitions
type Schema = Record<string, FieldDef<FieldType>>;

// Extract the TypeScript type from a schema
type InferConfig<S extends Schema> = {
  [K in keyof S]: S[K] extends FieldDef<infer T>
    ? S[K]['required'] extends true
      ? TypeMap[T]
      : S[K]['default'] extends TypeMap[T]
      ? TypeMap[T]
      : TypeMap[T] | undefined
    : never;
};

// ─── defineConfig ─────────────────────────────────────────────────────────────

/**
 * Define and validate application configuration from environment variables.
 * Throws ValidationError on startup if required vars are missing.
 *
 * @param schema  Configuration schema definition
 * @param source  Environment source (default: process.env)
 * @returns       Parsed and typed configuration object
 */
export function defineConfig<S extends Schema>(
  schema: S,
  source: Record<string, string | undefined> = process.env
): InferConfig<S> {
  const config: Record<string, unknown> = {};
  const errors: string[] = [];

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
      if (field.enum && !field.enum.includes(parsed as any)) {
        errors.push(
          `Invalid value for ${key}: '${rawValue}'. ` +
            `Allowed values: ${field.enum.join(', ')}`
        );
        continue;
      }

      // Run numeric range validation
      if (field.type === 'number') {
        const num = parsed as number;
        if (field.min !== undefined && num < field.min) {
          errors.push(
            `${key} must be >= ${field.min}, got ${num}`
          );
          continue;
        }
        if (field.max !== undefined && num > field.max) {
          errors.push(
            `${key} must be <= ${field.max}, got ${num}`
          );
          continue;
        }
      }

      config[key] = parsed;
    } catch (parseError) {
      errors.push((parseError as Error).message);
    }
  }

  // If any validation errors, throw them all at once
  if (errors.length > 0) {
    throw new ValidationError(
      'Configuration validation failed:\n' +
        errors.map(e => `  - ${e}`).join('\n'),
      errors
    );
  }

  return config as InferConfig<S>;
}

/**
 * Parse a string value into the specified type.
 */
function parseValue(raw: string, type: FieldType, key: string): unknown {
  switch (type) {
    case 'string':
      return raw;

    case 'number': {
      const num = Number(raw);
      if (isNaN(num)) {
        throw new Error(
          `Invalid value for ${key}: '${raw}' is not a valid number`
        );
      }
      return num;
    }

    case 'boolean': {
      const lower = raw.toLowerCase();
      if (['true', '1', 'yes', 'on'].includes(lower)) return true;
      if (['false', '0', 'no', 'off'].includes(lower)) return false;
      throw new Error(
        `Invalid value for ${key}: '${raw}' is not a valid boolean. ` +
          `Use true/false, 1/0, yes/no, on/off`
      );
    }

    case 'json': {
      try {
        return JSON.parse(raw);
      } catch {
        throw new Error(
          `Invalid value for ${key}: '${raw}' is not valid JSON`
        );
      }
    }

    default:
      return raw;
  }
}