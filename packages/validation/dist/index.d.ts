/**
 * @axiljs/validation - Public API
 */
export { v, BaseValidator, StringValidator, NumberValidator, BooleanValidator, ArrayValidator, ObjectValidator, EnumValidator, LiteralValidator, UnionValidator, RecordValidator } from './schema';
export type { ValidationResult, ValidationError, SchemaShape, InferShape, InferValidator, Primitive } from './schema';
export { validate, VALIDATION_SCHEMAS } from './middleware';
export type { ValidateOptions, ValidationSchemas, ValidatedMiddleware } from './middleware';
export { toJSONSchema, JSON_SCHEMA_DIALECT } from './json-schema';
export type { JSONSchema, JSONSchemaType, ToJSONSchemaOptions, JSONSchemaConvertible } from './json-schema';
//# sourceMappingURL=index.d.ts.map