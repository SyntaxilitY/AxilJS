import { describe, it, expect } from 'vitest';
import { v } from '../src/index';

const codes = (r: { errors?: { code: string }[] }) => (r.errors || []).map(e => e.code);

describe('v.string', () => {
  it('validates type, length, pattern, email and url', () => {
    expect(v.string().parse('hi')).toEqual({ success: true, data: 'hi' });
    expect(codes(v.string().parse(1))).toEqual(['TYPE_ERROR']);
    expect(codes(v.string().min(3).parse('ab'))).toEqual(['MIN_LENGTH']);
    expect(codes(v.string().max(1).parse('ab'))).toEqual(['MAX_LENGTH']);
    expect(codes(v.string().pattern(/^\d+$/).parse('12a'))).toEqual(['PATTERN']);
    expect(codes(v.string().email().parse('nope'))).toEqual(['EMAIL']);
    expect(v.string().email().parse('a@b.co').success).toBe(true);
    expect(codes(v.string().url().parse('not a url'))).toEqual(['URL']);
    expect(v.string().url().parse('https://x.dev').success).toBe(true);
  });

  it('does not carry /g regex state between calls', () => {
    const s = v.string().pattern(/a/g);
    expect(s.parse('a').success).toBe(true);
    expect(s.parse('a').success).toBe(true);
  });

  it('trim() validates and returns the trimmed value', () => {
    expect(v.string().trim().min(2).parse('  a  ').success).toBe(false);
    expect(v.string().trim().parse('  hi  ')).toEqual({ success: true, data: 'hi' });
    // Without trim() the value is untouched
    expect(v.string().parse('  hi  ').data).toBe('  hi  ');
  });
});

describe('v.number', () => {
  it('validates numbers and numeric strings', () => {
    expect(v.number().parse(5).data).toBe(5);
    expect(v.number().parse('5').success).toBe(true);
    expect(codes(v.number().parse('abc'))).toEqual(['TYPE_ERROR']);
    expect(codes(v.number().integer().parse(1.5))).toEqual(['INTEGER']);
    expect(codes(v.number().positive().parse(0))).toEqual(['POSITIVE']);
    expect(codes(v.number().min(2).parse(1))).toEqual(['MIN_VALUE']);
    expect(codes(v.number().max(2).parse(3))).toEqual(['MAX_VALUE']);
  });

  it('rejects NaN and Infinity (bug fix)', () => {
    for (const bad of [NaN, Infinity, -Infinity, 'Infinity', '-Infinity', 'NaN']) {
      expect(codes(v.number().parse(bad))).toEqual(['TYPE_ERROR']);
    }
  });
});

describe('v.boolean / v.enum', () => {
  it('accepts booleans and boolean-ish strings', () => {
    for (const ok of [true, false, 'true', 'false', '1', '0']) {
      expect(v.boolean().parse(ok).success).toBe(true);
    }
    expect(codes(v.boolean().parse('yes'))).toEqual(['TYPE_ERROR']);
  });

  it('checks enum membership', () => {
    expect(v.enum(['a', 'b']).parse('a').success).toBe(true);
    expect(codes(v.enum(['a', 'b']).parse('c'))).toEqual(['ENUM']);
  });
});

describe('modifiers', () => {
  it('required by default; optional, nullable and default', () => {
    expect(codes(v.string().parse(undefined))).toEqual(['REQUIRED']);
    expect(v.string().optional().parse(undefined)).toEqual({ success: true, data: undefined });
    expect(codes(v.string().parse(null))).toEqual(['NULL_VALUE']);
    expect(v.string().nullable().parse(null)).toEqual({ success: true, data: null });
    expect(v.string().default('x').parse(undefined)).toEqual({ success: true, data: 'x' });
  });

  it('custom() rules with boolean or string results', () => {
    const even = v.number().custom(n => n % 2 === 0, 'must be even');
    expect(even.parse(2).success).toBe(true);
    expect(even.parse(3).errors?.[0]).toEqual({ path: 'root', message: 'must be even', code: 'CUSTOM' });
    const msg = v.string().custom(s => s === 'ok' || `got ${s}`);
    expect(msg.parse('no').errors?.[0].message).toBe('got no');
  });
});

describe('v.array / v.object', () => {
  it('validates array items with indexed paths', () => {
    const r = v.array(v.number()).min(1).parse([1, 'x']);
    expect(r.errors).toEqual([{ path: 'root[1]', message: 'root[1] must be a number', code: 'TYPE_ERROR' }]);
    expect(codes(v.array(v.number()).min(1).parse([]))).toEqual(['MIN_ITEMS']);
    expect(codes(v.array(v.number()).max(1).parse([1, 2]))).toEqual(['MAX_ITEMS']);
    expect(codes(v.array(v.number()).parse('x'))).toEqual(['TYPE_ERROR']);
  });

  it('validates objects with nested dot paths and collects all errors', () => {
    const schema = v.object({
      name: v.string(),
      address: v.object({ city: v.string(), zip: v.number() })
    });
    const r = schema.parse({ address: { city: 1, zip: 'x' } });
    expect(r.errors?.map(e => e.path)).toEqual(['name', 'address.city', 'address.zip']);
    expect(codes(schema.parse([]))).toEqual(['TYPE_ERROR']);
  });

  it('applies nested defaults and keeps unknown keys unless strip()', () => {
    const schema = v.object({
      role: v.string().default('user'),
      tags: v.array(v.object({ n: v.number().default(1) }))
    });
    expect(schema.parse({ extra: true, tags: [{}] }).data).toEqual({ extra: true, role: 'user', tags: [{ n: 1 }] });

    const stripped = v.object({ a: v.string() }).strip();
    expect(stripped.parse({ a: 'x', b: 'y' }).data).toEqual({ a: 'x' });
  });
});

describe('transform()', () => {
  it('maps the output value', () => {
    expect(v.string().transform(s => s.toUpperCase()).parse('abc')).toEqual({ success: true, data: 'ABC' });
    const toNum = v.string().pattern(/^\d+$/).transform(Number);
    expect(toNum.parse('42').data).toBe(42);
    expect(toNum.parse('4x').success).toBe(false);
  });

  it('chains transforms in order and runs after trim/defaults', () => {
    const s = v.string().trim().default(' d ').transform(x => `[${x}]`).transform(x => x + '!');
    expect(s.parse('  a ').data).toBe('[a]!');
    expect(s.parse(undefined).data).toBe('[d]!');
  });

  it('is not called for null/undefined', () => {
    let calls = 0;
    const s = v.string().optional().nullable().transform(x => {
      calls++;
      return x;
    });
    expect(s.parse(undefined).data).toBeUndefined();
    expect(s.parse(null).data).toBeNull();
    expect(calls).toBe(0);
  });

  it('applies inside objects and arrays, and on objects themselves', () => {
    const schema = v
      .object({
        email: v.string().trim().transform(e => e.toLowerCase()),
        ids: v.array(v.string().transform(Number))
      })
      .transform(o => ({ ...o, ok: true }));
    expect(schema.parse({ email: ' A@B.CO ', ids: ['1', '2'] }).data).toEqual({
      email: 'a@b.co',
      ids: [1, 2],
      ok: true
    });
  });

  it('turns a throwing transform into a TRANSFORM_ERROR result', () => {
    const s = v.string().transform(x => JSON.parse(x));
    expect(s.parse('{bad').success).toBe(false);
    expect(codes(s.parse('{bad'))).toEqual(['TRANSFORM_ERROR']);
    const o = v.object({ x: v.string().transform(() => { throw new Error('nope'); }) });
    expect(o.parse({ x: 'a' }).errors?.[0]).toMatchObject({ code: 'TRANSFORM_ERROR', message: 'nope' });
  });
});

describe('v.literal', () => {
  it('matches exactly one value', () => {
    expect(v.literal('admin').parse('admin')).toEqual({ success: true, data: 'admin' });
    expect(v.literal(1).parse(1).success).toBe(true);
    expect(v.literal(true).parse(true).success).toBe(true);
    expect(v.literal(1).parse('1').errors?.[0]).toEqual({ path: 'root', message: 'root must be 1', code: 'LITERAL' });
    expect(codes(v.literal('a').parse('b'))).toEqual(['LITERAL']);
  });

  it('literal(null) accepts null', () => {
    expect(v.literal(null).parse(null)).toEqual({ success: true, data: null });
    expect(v.literal(null).parse(0).success).toBe(false);
  });
});

describe('v.union', () => {
  it('accepts a value matching any option', () => {
    const id = v.union([v.string().min(1), v.number().integer()]);
    expect(id.parse('abc').success).toBe(true);
    expect(id.parse(5).success).toBe(true);
    expect(codes(id.parse(1.5))).toEqual(['UNION']);
    expect(codes(id.parse(undefined))).toEqual(['REQUIRED']);
  });

  it('returns the output of the first matching option', () => {
    const u = v.union([
      v.literal('none'),
      v.object({ n: v.number().default(1) }),
      v.string().transform(s => s.length)
    ]);
    expect(u.parse('none').data).toBe('none');
    expect(u.parse({}).data).toEqual({ n: 1 });
    expect(u.parse('four').data).toBe(4);
  });

  it('allows null when an option does', () => {
    const u = v.union([v.string(), v.literal(null)]);
    expect(u.parse(null)).toEqual({ success: true, data: null });
    expect(codes(v.union([v.string()]).parse(null))).toEqual(['NULL_VALUE']);
  });

  it('works inside objects (discriminated shapes)', () => {
    const shape = v.object({
      event: v.union([
        v.object({ type: v.literal('click'), x: v.number() }),
        v.object({ type: v.literal('key'), key: v.string() })
      ])
    });
    expect(shape.parse({ event: { type: 'key', key: 'a' } }).success).toBe(true);
    expect(shape.parse({ event: { type: 'key', x: 1 } }).errors?.[0]).toMatchObject({ path: 'event', code: 'UNION' });
  });
});

describe('v.record', () => {
  it('validates every value with key paths', () => {
    const scores = v.record(v.number().min(0));
    expect(scores.parse({ a: 1, b: 2 })).toEqual({ success: true, data: { a: 1, b: 2 } });
    expect(scores.parse({ a: 1, b: -1 }).errors).toEqual([
      { path: 'b', message: 'b must be >= 0', code: 'MIN_VALUE' }
    ]);
    expect(codes(scores.parse([1]))).toEqual(['TYPE_ERROR']);
    expect(codes(scores.parse('x'))).toEqual(['TYPE_ERROR']);
  });

  it('applies value outputs and nests under objects', () => {
    const schema = v.object({ headers: v.record(v.string().trim()) });
    expect(schema.parse({ headers: { a: ' x ' } }).data).toEqual({ headers: { a: 'x' } });
    expect(schema.parse({ headers: { a: 1 } }).errors?.[0].path).toBe('headers.a');
  });

  it('keeps a "__proto__" key as data instead of a prototype', () => {
    const out = v.record(v.string()).parse(JSON.parse('{"__proto__":"x","a":"y"}')).data as any;
    expect(Object.getPrototypeOf(out)).toBe(Object.prototype);
    expect(Object.keys(out)).toEqual(['__proto__', 'a']);
  });
});
