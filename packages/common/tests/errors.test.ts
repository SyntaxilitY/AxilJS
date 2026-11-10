import { describe, it, expect } from 'vitest';
import {
  axilError,
  NotFoundError,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  ValidationError,
  InternalError
} from '../src/index';
import type { ServerConfig, TrustProxy } from '../src/index';

describe('axilError', () => {
  it('defaults to 500 INTERNAL_ERROR and keeps details', () => {
    const e = new axilError('boom');
    expect(e).toBeInstanceOf(Error);
    expect(e.statusCode).toBe(500);
    expect(e.code).toBe('INTERNAL_ERROR');
    expect(e.name).toBe('axilError');
    expect(new axilError('x', 418, 'TEAPOT', { a: 1 }).details).toEqual({ a: 1 });
  });
});

describe('HTTP error classes', () => {
  it.each([
    [NotFoundError, 404, 'NOT_FOUND', 'Resource not found'],
    [BadRequestError, 400, 'BAD_REQUEST', 'Bad request'],
    [UnauthorizedError, 401, 'UNAUTHORIZED', 'Unauthorized'],
    [ForbiddenError, 403, 'FORBIDDEN', 'Forbidden'],
    [ValidationError, 422, 'VALIDATION_ERROR', 'Validation failed'],
    [InternalError, 500, 'INTERNAL_ERROR', 'Internal server error']
  ] as const)('%o maps to %i %s', (Cls, status, code, message) => {
    const e = new Cls();
    expect(e).toBeInstanceOf(axilError);
    expect(e).toBeInstanceOf(Error);
    expect(e.statusCode).toBe(status);
    expect(e.code).toBe(code);
    expect(e.message).toBe(message);
    expect(e.name).toBe(Cls.name);
  });

  it('accepts custom messages and details', () => {
    expect(new NotFoundError('no user').message).toBe('no user');
    expect(new BadRequestError('bad', ['x']).details).toEqual(['x']);
    expect(new ValidationError('invalid', [{ path: 'a' }]).details).toEqual([{ path: 'a' }]);
  });
});

describe('ServerConfig types', () => {
  it('accepts the new server options', () => {
    const fn: TrustProxy = (addr, hop) => addr === '10.0.0.1' && hop === 0;
    const config: ServerConfig = {
      port: 0,
      bodyLimit: '2mb',
      timeout: 5000,
      headFallback: false,
      methodNotAllowed: true,
      trustProxy: fn
    };
    expect(config.trustProxy).toBe(fn);
    const hops: ServerConfig = { trustProxy: 2 };
    expect(hops.trustProxy).toBe(2);
  });
});
