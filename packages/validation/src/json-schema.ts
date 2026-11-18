/**
 * JSON Schema export for v.* schemas.
 *
 * Converts a validator into JSON Schema 2020-12, the dialect used by
 * OpenAPI 3.1, so request schemas can be published (OpenAPI documents,
 * typed client generation, form builders) without describing them twice.
 *
 * Usage:
 *   import { v, toJSONSchema } from '@axiljs/validation'
 *
 *   const user = v.object({ name: v.string().min(2), age: v.number().optional() })
 *   toJSONSchema(user)
 *   // {
 *   //   type: 'object',
 *   //   properties: { name: { type: 'string', minLength: 2 }, age: { type: 'number' } },
 *   //   required: ['name']
 *   // }
 *
 * The schema describes the INPUT a validator accepts, not its output:
 *   - custom() rules and transform() functions cannot be expressed and are
 *     not represented (no constraint is emitted for them).
 *   - v.number() / v.boolean() also accept numeric / boolean strings
 *     ('5', 'true') because query strings and form fields are always text.
 *     The schema keeps type 'number' / 'boolean': that is the type clients
 *     should send, and how a query parameter is documented in OpenAPI.
 *   - trim(): length limits apply to the trimmed string, which JSON Schema
 *     cannot express; minLength / maxLength are emitted as-is.
 *   - pattern() emits the regex source; flags (i, m, u…) are dropped.
 */

/** JSON Schema 2020-12 dialect URI (also OpenAPI 3.1's default dialect). */
export const JSON_SCHEMA_DIALECT = 'https://json-schema.org/draft/2020-12/schema';

export type JSONSchemaType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'object'
  | 'array'
  | 'null';

/**
 * A JSON Schema 2020-12 document (the subset emitted by toJSONSchema(),
 * open to any other keyword).
 */
export interface JSONSchema {
  $schema?: string;
  type?: JSONSchemaType | JSONSchemaType[];
  const?: unknown;
  enum?: unknown[];
  default?: unknown;
  format?: string;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  items?: JSONSchema;
  minItems?: number;
  maxItems?: number;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  additionalProperties?: boolean | JSONSchema;
  anyOf?: JSONSchema[];
  [keyword: string]: unknown;
}

export interface ToJSONSchemaOptions {
  /** Add `$schema: JSON_SCHEMA_DIALECT` to the root (default false). */
  $schema?: boolean;
}

/** Anything with a toJSONSchema() method (every v.* validator). */
export interface JSONSchemaConvertible {
  toJSONSchema(): JSONSchema;
}

/**
 * Convert a validator (v.string(), v.object({...}), …) to JSON Schema 2020-12.
 * Equivalent to `schema.toJSONSchema()`, optionally with the `$schema` URI.
 */
export function toJSONSchema(
  schema: JSONSchemaConvertible,
  options: ToJSONSchemaOptions = {}
): JSONSchema {
  const json = schema.toJSONSchema();
  return options.$schema ? { $schema: JSON_SCHEMA_DIALECT, ...json } : json;
}

/** True if the schema already accepts null. @internal */
export function allowsNull(schema: JSONSchema): boolean {
  if (schema.type === 'null') return true;
  if (Array.isArray(schema.type) && schema.type.includes('null')) return true;
  if (schema.const === null) return true;
  if (Array.isArray(schema.enum) && schema.enum.includes(null)) return true;
  if (Array.isArray(schema.anyOf)) return schema.anyOf.some(allowsNull);
  // No type keyword at all (e.g. a bare custom validator) accepts anything
  return schema.type === undefined && schema.const === undefined &&
    schema.enum === undefined && schema.anyOf === undefined;
}

/**
 * Widen a schema to also accept null (`.nullable()`):
 *   { type: 'string' }            -> { type: ['string', 'null'] }
 *   { type: 'string', enum: [a] } -> { type: ['string', 'null'], enum: [a, null] }
 *   { const: 'x' } / { anyOf }    -> { anyOf: [..., { type: 'null' }] }
 * @internal
 */
export function makeNullable(schema: JSONSchema): JSONSchema {
  if (allowsNull(schema)) return schema;

  if (schema.const !== undefined) {
    return { anyOf: [schema, { type: 'null' }] };
  }

  if (Array.isArray(schema.anyOf)) {
    return { ...schema, anyOf: [...schema.anyOf, { type: 'null' }] };
  }

  const out: JSONSchema = { ...schema };
  if (typeof out.type === 'string') out.type = [out.type, 'null'];
  else if (Array.isArray(out.type)) out.type = [...out.type, 'null'];
  if (Array.isArray(out.enum)) out.enum = [...out.enum, null];
  return out;
}
