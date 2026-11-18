import { describe, it, expect } from 'vitest';
import { JWT, authenticate, requireRole, requirePermission, requireOwnership, AUTH_MIDDLEWARE } from '../src';

describe('auth middleware marker', () => {
  it('tags every auth factory result with Symbol.for("axiljs.auth")', () => {
    const jwt = new JWT('a-test-secret-that-is-long-enough-123456');
    expect(AUTH_MIDDLEWARE).toBe(Symbol.for('axiljs.auth'));
    expect((authenticate(jwt) as any)[AUTH_MIDDLEWARE]).toBe('authenticate');
    expect((requireRole('admin') as any)[AUTH_MIDDLEWARE]).toBe('requireRole');
    expect((requirePermission('posts:write') as any)[AUTH_MIDDLEWARE]).toBe('requirePermission');
    expect((requireOwnership() as any)[AUTH_MIDDLEWARE]).toBe('requireOwnership');
  });

  it('keeps the marker out of enumeration', () => {
    expect(Object.keys(requireRole('admin'))).toEqual([]);
  });
});
