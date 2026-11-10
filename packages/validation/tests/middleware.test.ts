import { describe, it, expect } from 'vitest';
import { ValidationError } from '@axiljs/common';
import type { axilRequest, axilResponse } from '@axiljs/common';
import { validate, v } from '../src/index';

function req(overrides: Partial<axilRequest> = {}): axilRequest {
  return {
    raw: {} as any,
    method: 'POST',
    url: '/',
    path: '/',
    params: {},
    query: {},
    headers: {},
    body: null,
    ip: '127.0.0.1',
    locals: {},
    ...overrides
  } as axilRequest;
}

function run(mw: any, r: axilRequest): Error | undefined {
  let error: Error | undefined;
  mw(r, {} as axilResponse, (e?: Error) => {
    error = e;
  });
  return error;
}

describe('validate middleware', () => {
  it('replaces body/params/query with the validated (transformed) data', () => {
    const r = req({
      body: { name: '  Ann ', extra: 1 },
      params: { id: '7' },
      query: { page: '2' }
    });
    const err = run(
      validate({
        body: v.object({ name: v.string().trim(), role: v.string().default('user') }).strip(),
        params: v.object({ id: v.string().transform(Number) }),
        query: v.object({ page: v.string().transform(Number), size: v.number().default(20) })
      }),
      r
    );
    expect(err).toBeUndefined();
    expect(r.body).toEqual({ name: 'Ann', role: 'user' });
    expect(r.params).toEqual({ id: 7 });
    expect(r.query).toEqual({ page: 2, size: 20 });
  });

  it('collects errors from every source into one 422 ValidationError', () => {
    const r = req({ body: {}, params: { id: 'x' }, query: {} });
    const err = run(
      validate({
        body: v.object({ name: v.string() }),
        params: v.object({ id: v.number() }),
        query: v.object({ q: v.string() })
      }),
      r
    ) as ValidationError;
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.statusCode).toBe(422);
    expect((err.details as any[]).map(d => `${d.source}:${d.path}`)).toEqual([
      'body:name',
      'params:id',
      'query:q'
    ]);
  });

  it('reports a failing transform as a validation error', () => {
    const r = req({ body: { json: '{bad' } });
    const err = run(validate({ body: v.object({ json: v.string().transform(s => JSON.parse(s)) }) }), r);
    expect(err).toBeInstanceOf(ValidationError);
  });
});
