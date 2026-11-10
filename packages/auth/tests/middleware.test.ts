import { describe, it, expect } from 'vitest';
import { ForbiddenError, UnauthorizedError } from '@axiljs/common';
import type { axilRequest, axilResponse } from '@axiljs/common';
import {
  JWT,
  authenticate,
  getUser,
  requireRole,
  requirePermission,
  requireOwnership,
  hashPassword,
  verifyPassword,
  isHashed
} from '../src/index';

const jwt = new JWT('s'.repeat(40));

function req(overrides: Partial<axilRequest> = {}): axilRequest {
  return {
    raw: {} as any,
    method: 'GET',
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

const res = {} as axilResponse;

function run(mw: any, r: axilRequest): Error | undefined | 'not-called' {
  let result: Error | undefined | 'not-called' = 'not-called';
  mw(r, res, (e?: Error) => {
    result = e;
  });
  return result;
}

describe('authenticate', () => {
  it('reads a Bearer token (case-insensitive scheme) and sets req.locals.user', () => {
    const token = jwt.sign({ sub: 7, role: 'admin' });
    const r = req({ headers: { authorization: `bearer ${token}` } });
    expect(run(authenticate(jwt), r)).toBeUndefined();
    expect(r.locals.user).toMatchObject({ id: 7, sub: 7, role: 'admin' });
    expect(getUser(r).id).toBe(7);
  });

  it('requires a token by default, optional with required:false', () => {
    expect(run(authenticate(jwt), req())).toBeInstanceOf(UnauthorizedError);
    const r = req();
    expect(run(authenticate(jwt, { required: false }), r)).toBeUndefined();
    expect(r.locals.user).toBeUndefined();
    expect(() => getUser(r)).toThrow(UnauthorizedError);
  });

  it('rejects invalid tokens even when auth is optional', () => {
    const r = req({ headers: { authorization: 'Bearer nope.nope.nope' } });
    expect(run(authenticate(jwt, { required: false }), r)).toBeInstanceOf(UnauthorizedError);
  });

  it('reads cookie and query sources (default name "token")', () => {
    const token = jwt.sign({ sub: 1 });
    const cookie = req({ headers: { cookie: `a=b; token=${token}` } });
    expect(run(authenticate(jwt, { source: 'cookie' }), cookie)).toBeUndefined();

    const query = req({ query: { token } });
    expect(run(authenticate(jwt, { source: 'query' }), query)).toBeUndefined();

    const both = req({ query: { token: [token, token] } });
    expect(run(authenticate(jwt, { source: 'query' }), both)).toBeInstanceOf(UnauthorizedError);

    const multi = req({ query: { token } });
    expect(run(authenticate(jwt, { source: ['header', 'query'] }), multi)).toBeUndefined();
  });

  it('supports custom cookieName and queryParam', () => {
    const token = jwt.sign({ sub: 2 });
    const cookie = req({ headers: { cookie: `session=${token}` } });
    expect(run(authenticate(jwt, { source: 'cookie', cookieName: 'session' }), cookie)).toBeUndefined();
    expect(run(authenticate(jwt, { source: 'cookie' }), req({ headers: { cookie: `session=${token}` } }))).toBeInstanceOf(
      UnauthorizedError
    );

    const query = req({ query: { access_token: token } });
    expect(run(authenticate(jwt, { source: 'query', queryParam: 'access_token' }), query)).toBeUndefined();
  });

  it('does not treat inherited names as cookies/query params', () => {
    const r = req({ headers: { cookie: 'a=b' } });
    expect(run(authenticate(jwt, { source: 'cookie', cookieName: 'constructor' }), r)).toBeInstanceOf(
      UnauthorizedError
    );
    expect(run(authenticate(jwt, { source: 'query', queryParam: 'toString' }), req())).toBeInstanceOf(
      UnauthorizedError
    );
  });

  it('passes audience and issuer through to verify', () => {
    const token = jwt.sign({ sub: 1 }, { audience: ['api', 'web'], issuer: 'me' });
    const header = { authorization: `Bearer ${token}` };
    expect(run(authenticate(jwt, { audience: 'api', issuer: 'me' }), req({ headers: header }))).toBeUndefined();
    const wrongAud = run(authenticate(jwt, { audience: 'cli' }), req({ headers: header }));
    expect((wrongAud as Error).message).toBe('Invalid token audience');
    const wrongIss = run(authenticate(jwt, { issuer: 'other' }), req({ headers: header }));
    expect((wrongIss as Error).message).toBe('Invalid token issuer');
  });
});

describe('RBAC', () => {
  const withUser = (user: unknown, extra: Partial<axilRequest> = {}) => req({ locals: { user }, ...extra });

  it('requireRole checks role or roles', () => {
    expect(run(requireRole('admin'), withUser({ role: 'admin' }))).toBeUndefined();
    expect(run(requireRole(['admin', 'editor']), withUser({ roles: ['viewer', 'editor'] }))).toBeUndefined();
    expect(run(requireRole('admin'), withUser({ role: 'user' }))).toBeInstanceOf(ForbiddenError);
    expect(run(requireRole('admin'), withUser({}))).toBeInstanceOf(ForbiddenError);
    expect(run(requireRole('admin'), req())).toBeInstanceOf(UnauthorizedError);
  });

  it('requirePermission supports exact, namespace and global wildcards', () => {
    expect(run(requirePermission('posts:create'), withUser({ permissions: ['posts:create'] }))).toBeUndefined();
    expect(run(requirePermission('posts:delete'), withUser({ permissions: ['posts:*'] }))).toBeUndefined();
    expect(run(requirePermission('anything'), withUser({ permissions: ['*'] }))).toBeUndefined();
    expect(run(requirePermission('users:read'), withUser({ permissions: ['posts:*'] }))).toBeInstanceOf(ForbiddenError);
    expect(run(requirePermission('x'), withUser({}))).toBeInstanceOf(ForbiddenError);
    expect(run(requirePermission('x'), req())).toBeInstanceOf(UnauthorizedError);
  });

  it('requireOwnership compares the user id to a route param; admins bypass', () => {
    expect(run(requireOwnership(), withUser({ id: 5 }, { params: { id: '5' } }))).toBeUndefined();
    expect(run(requireOwnership('userId'), withUser({ sub: 'a' }, { params: { userId: 'a' } }))).toBeUndefined();
    expect(run(requireOwnership(), withUser({ id: 5 }, { params: { id: '6' } }))).toBeInstanceOf(ForbiddenError);
    expect(run(requireOwnership(), withUser({ role: 'admin', id: 1 }, { params: { id: '9' } }))).toBeUndefined();
    expect(run(requireOwnership(), withUser({}, { params: { id: 'undefined' } }))).toBeInstanceOf(ForbiddenError);
    expect(run(requireOwnership(), req())).toBeInstanceOf(UnauthorizedError);
  });
});

describe('passwords', () => {
  it('hashes with a random salt and verifies', async () => {
    const a = await hashPassword('hunter2');
    const b = await hashPassword('hunter2');
    expect(a).not.toBe(b);
    expect(isHashed(a)).toBe(true);
    expect(await verifyPassword('hunter2', a)).toBe(true);
    expect(await verifyPassword('hunter3', a)).toBe(false);
  });

  it('handles bad input', async () => {
    await expect(hashPassword('')).rejects.toThrow('Password cannot be empty');
    expect(await verifyPassword('x', 'garbage')).toBe(false);
    expect(await verifyPassword('x', 'ab:cd')).toBe(false);
    expect(isHashed('plain')).toBe(false);
  });
});
