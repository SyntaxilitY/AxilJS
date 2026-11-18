import { describe, it, expect } from 'vitest';
import {
  v,
  validate,
  toJSONSchema,
  JSON_SCHEMA_DIALECT,
  VALIDATION_SCHEMAS,
  BaseValidator
} from '../src/index';
import type { ValidationError, JSONSchema } from '../src/index';

describe('toJSONSchema: primitives', () => {
  it('string with length, pattern and formats', () => {
    expect(v.string().toJSONSchema()).toEqual({ type: 'string' });
    expect(v.string().min(2).max(10).pattern(/^[a-z]+$/i).toJSONSchema()).toEqual({
      type: 'string', minLength: 2, maxLength: 10, pattern: '^[a-z]+$'
    });
    expect(v.string().email().toJSONSchema()).toEqual({ type: 'string', format: 'email' });
    expect(v.string().url().toJSONSchema()).toEqual({ type: 'string', format: 'uri' });
  });

  it('number / integer with bounds and positive()', () => {
    expect(v.number().toJSONSchema()).toEqual({ type: 'number' });
    expect(v.number().integer().min(1).max(100).toJSONSchema()).toEqual({
      type: 'integer', minimum: 1, maximum: 100
    });
    expect(v.number().positive().toJSONSchema()).toEqual({ type: 'number', exclusiveMinimum: 0 });
  });

  it('keeps type number/boolean although numeric/boolean strings are accepted', () => {
    const n = v.number();
    expect(n.parse('5').data).toBe(5);
    expect(n.toJSONSchema().type).toBe('number');
    const b = v.boolean();
    expect(b.parse('true').data).toBe(true);
    expect(b.toJSONSchema()).toEqual({ type: 'boolean' });
  });

  it('enum and literal', () => {
    expect(v.enum(['admin', 'user']).toJSONSchema()).toEqual({ type: 'string', enum: ['admin', 'user'] });
    expect(v.literal('on').toJSONSchema()).toEqual({ type: 'string', const: 'on' });
    expect(v.literal(3).toJSONSchema()).toEqual({ type: 'integer', const: 3 });
    expect(v.literal(1.5).toJSONSchema()).toEqual({ type: 'number', const: 1.5 });
    expect(v.literal(true).toJSONSchema()).toEqual({ type: 'boolean', const: true });
    expect(v.literal(null).toJSONSchema()).toEqual({ type: 'null', const: null });
  });
});

describe('toJSONSchema: composites', () => {
  it('array with items and size limits', () => {
    expect(v.array(v.string().min(1)).min(1).max(5).toJSONSchema()).toEqual({
      type: 'array', items: { type: 'string', minLength: 1 }, minItems: 1, maxItems: 5
    });
  });

  it('object: optional and defaulted fields are not required', () => {
    const schema = v.object({
      name: v.string(),
      age: v.number().optional(),
      role: v.enum(['a', 'b']).default('a'),
      nick: v.string().nullable()
    });
    expect(schema.toJSONSchema()).toEqual({
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' },
        role: { type: 'string', enum: ['a', 'b'], default: 'a' },
        nick: { type: ['string', 'null'] }
      },
      required: ['name', 'nick']
    });
  });

  it('object: no required key when all fields are optional; additionalProperties unset', () => {
    const json = v.object({ q: v.string().optional() }).toJSONSchema();
    expect(json).toEqual({ type: 'object', properties: { q: { type: 'string' } } });
    expect('additionalProperties' in v.object({}).strip().toJSONSchema()).toBe(false);
  });

  it('nested objects and arrays of objects', () => {
    const json = v.object({
      address: v.object({ city: v.string() }),
      tags: v.array(v.object({ id: v.number().integer() }))
    }).toJSONSchema();
    expect(json.properties!.address).toEqual({
      type: 'object', properties: { city: { type: 'string' } }, required: ['city']
    });
    expect(json.properties!.tags.items).toEqual({
      type: 'object', properties: { id: { type: 'integer' } }, required: ['id']
    });
  });

  it('record -> additionalProperties', () => {
    expect(v.record(v.number()).toJSONSchema()).toEqual({
      type: 'object', additionalProperties: { type: 'number' }
    });
  });

  it('union -> anyOf (null option kept once)', () => {
    expect(v.union([v.string(), v.number()]).toJSONSchema()).toEqual({
      anyOf: [{ type: 'string' }, { type: 'number' }]
    });
    expect(v.union([v.string(), v.literal(null)]).toJSONSchema()).toEqual({
      anyOf: [{ type: 'string' }, { type: 'null', const: null }]
    });
    expect(v.union([v.string(), v.number()]).nullable().toJSONSchema()).toEqual({
      anyOf: [{ type: 'string' }, { type: 'number' }, { type: 'null' }]
    });
  });
});

describe('toJSONSchema: modifiers', () => {
  it('nullable widens type, enum and const', () => {
    expect(v.number().integer().nullable().toJSONSchema()).toEqual({ type: ['integer', 'null'] });
    expect(v.object({}).nullable().toJSONSchema().type).toEqual(['object', 'null']);
    expect(v.enum(['x']).nullable().toJSONSchema()).toEqual({ type: ['string', 'null'], enum: ['x', null] });
    expect(v.literal('x').nullable().toJSONSchema()).toEqual({
      anyOf: [{ type: 'string', const: 'x' }, { type: 'null' }]
    });
  });

  it('default -> default', () => {
    expect(v.number().default(10).toJSONSchema()).toEqual({ type: 'number', default: 10 });
    expect(v.array(v.string()).default([]).toJSONSchema()).toEqual({
      type: 'array', items: { type: 'string' }, default: []
    });
  });

  it('custom() and transform() add no constraint', () => {
    const schema = v.string().min(1).custom(s => s !== 'x').transform(s => s.length);
    expect(schema.toJSONSchema()).toEqual({ type: 'string', minLength: 1 });
  });

  it('a user-defined subclass without _jsonSchema emits {}', () => {
    class AnyValidator extends BaseValidator<unknown> {
      protected validateType(): ValidationError[] { return []; }
    }
    expect(new AnyValidator().toJSONSchema()).toEqual({});
    expect(new AnyValidator().nullable().toJSONSchema()).toEqual({});
  });

  it('is a fresh object on every call', () => {
    const s = v.object({ a: v.string() });
    const a = s.toJSONSchema();
    (a.properties as Record<string, JSONSchema>).a.type = 'number';
    expect(s.toJSONSchema().properties!.a.type).toBe('string');
  });
});

describe('toJSONSchema() function', () => {
  it('matches the method and can add the $schema dialect', () => {
    const s = v.object({ id: v.string() });
    expect(toJSONSchema(s)).toEqual(s.toJSONSchema());
    const withDialect = toJSONSchema(s, { $schema: true });
    expect(withDialect.$schema).toBe(JSON_SCHEMA_DIALECT);
    expect(JSON_SCHEMA_DIALECT).toBe('https://json-schema.org/draft/2020-12/schema');
  });
});

describe('validate() exposes its schemas', () => {
  it('as .schemas and under Symbol.for("axiljs.validation.schemas")', () => {
    const body = v.object({ name: v.string() });
    const query = v.object({ page: v.number().optional() });
    const mw = validate({ body, query });

    expect(mw.schemas.body).toBe(body);
    expect(mw.schemas.query).toBe(query);
    expect('params' in mw.schemas).toBe(false);
    expect(VALIDATION_SCHEMAS).toBe(Symbol.for('axiljs.validation.schemas'));
    expect((mw as any)[Symbol.for('axiljs.validation.schemas')]).toBe(mw.schemas);
    expect(mw.schemas.body!.toJSONSchema().required).toEqual(['name']);
  });

  it('is read-only and non-enumerable, and the middleware still validates', () => {
    const mw = validate({ body: v.object({ n: v.number() }) });
    expect(Object.keys(mw)).toEqual([]);
    expect(Object.isFrozen(mw.schemas)).toBe(true);
    expect(() => { (mw as any).schemas = {}; }).toThrow();

    const req: any = { body: { n: '3' }, params: {}, query: {} };
    let err: unknown = 'not-called';
    mw(req, {} as any, (e?: Error) => { err = e; });
    expect(err).toBeUndefined();
    expect(req.body).toEqual({ n: 3 });
  });
});
