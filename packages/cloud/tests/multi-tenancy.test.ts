import { describe, it, expect, vi } from 'vitest';
import { multiTenancy, getTenant, getTenantId } from '../src/multi-tenancy';
import { UnauthorizedError, axilRequest, axilResponse } from '@axiljs/common';

function createMockReq(overrides: Partial<axilRequest> = {}): axilRequest {
  return {
    raw: {} as any,
    method: 'GET',
    url: '/',
    path: '/',
    params: {},
    query: {},
    headers: {},
    body: {},
    locals: {},
    ip: '127.0.0.1',
    ...overrides,
  } as unknown as axilRequest;
}

function createMockRes(overrides: Partial<axilResponse> = {}): axilResponse {
  return {
    raw: {} as any,
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    html: vi.fn().mockReturnThis(),
    ...overrides,
  } as unknown as axilResponse;
}

describe('Multi-Tenancy Middleware', () => {
  describe('Header Strategy (default)', () => {
    it('resolves tenant from default x-tenant-id header', async () => {
      const mw = multiTenancy();
      const req = createMockReq({ headers: { 'x-tenant-id': 'acme-corp' } });
      const res = createMockRes();
      const next = vi.fn();

      await mw(req, res, next);

      expect(next).toHaveBeenCalledWith();
      expect(getTenant(req)).toEqual({
        id: 'acme-corp',
        name: 'Tenant acme-corp',
        status: 'active',
      });
      expect(getTenantId(req)).toBe('acme-corp');
    });

    it('supports custom header name', async () => {
      const mw = multiTenancy({ headerName: 'x-org-id' });
      const req = createMockReq({ headers: { 'x-org-id': 'globex-intl' } });
      const next = vi.fn();

      await mw(req, createMockRes(), next);

      expect(next).toHaveBeenCalledWith();
      expect(getTenantId(req)).toBe('globex-intl');
    });

    it('rejects missing header when required: true', async () => {
      const mw = multiTenancy({ required: true });
      const req = createMockReq();
      const next = vi.fn();

      await mw(req, createMockRes(), next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it('passes through when tenant missing and required: false', async () => {
      const mw = multiTenancy({ required: false });
      const req = createMockReq();
      const next = vi.fn();

      await mw(req, createMockRes(), next);

      expect(next).toHaveBeenCalledWith();
      expect((req.locals as Record<string, unknown>)?.tenant).toBeUndefined();
      expect(() => getTenant(req)).toThrow(UnauthorizedError);
    });
  });

  describe('Subdomain Strategy', () => {
    it('extracts tenant subdomain from 3-segment host', async () => {
      const mw = multiTenancy({ strategy: 'subdomain' });
      const req = createMockReq({ headers: { host: 'tenant1.api.axiljs.io' } });
      const next = vi.fn();

      await mw(req, createMockRes(), next);

      expect(next).toHaveBeenCalledWith();
      expect(getTenantId(req)).toBe('tenant1');
    });

    it('rejects bare host with insufficient segments', async () => {
      const mw = multiTenancy({ strategy: 'subdomain', required: true });
      const req = createMockReq({ headers: { host: 'axiljs.io' } });
      const next = vi.fn();

      await mw(req, createMockRes(), next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });
  });

  describe('JWT Strategy', () => {
    it('extracts tenant from req.locals.user.tenantId', async () => {
      const mw = multiTenancy({ strategy: 'jwt' });
      const req = createMockReq({
        locals: { user: { id: 123, tenantId: 'enterprise-1' } },
      });
      const next = vi.fn();

      await mw(req, createMockRes(), next);

      expect(next).toHaveBeenCalledWith();
      expect(getTenantId(req)).toBe('enterprise-1');
    });
  });

  describe('Validation and Status Lifecycle', () => {
    it('rejects malformed tenant IDs', async () => {
      const mw = multiTenancy();
      const req = createMockReq({ headers: { 'x-tenant-id': 'INVALID/NAME!' } });
      const next = vi.fn();

      await mw(req, createMockRes(), next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it('blocks suspended tenants', async () => {
      const mw = multiTenancy({
        resolveTenant: async (id) => ({
          id,
          name: 'Suspended Org',
          status: 'suspended',
        }),
      });
      const req = createMockReq({ headers: { 'x-tenant-id': 'acme-corp' } });
      const next = vi.fn();

      await mw(req, createMockRes(), next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it('blocks archived tenants', async () => {
      const mw = multiTenancy({
        resolveTenant: async (id) => ({
          id,
          name: 'Archived Org',
          status: 'archived',
        }),
      });
      const req = createMockReq({ headers: { 'x-tenant-id': 'acme-corp' } });
      const next = vi.fn();

      await mw(req, createMockRes(), next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });
  });
});