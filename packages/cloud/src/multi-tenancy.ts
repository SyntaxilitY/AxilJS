/**
 * Multi-Tenancy Middleware.
 *
 * Resolves the current tenant from the incoming request via header,
 * subdomain, JWT claim, or a caller-supplied custom function.
 *
 * Guarantees:
 *   • Tenant ID is validated before any downstream lookup.
 *   • Suspended / archived tenants are rejected with 403.
 *   • Tenant context is attached to `req.locals.tenant`.
 *   • Works safely in multi-instance deployments (no process state).
 */

import { MiddlewareFn, UnauthorizedError } from '@axiljs/common';
import type {
  Tenant,
  TenantContext,
  MultiTenancyOptions,
  TenantResolutionStrategy,
} from './types';

// Re-export for convenience
export type { Tenant, TenantContext, MultiTenancyOptions, TenantResolutionStrategy };

// ─── Host helpers ────────────────────────────────────────────────────────────

/** Strip an optional :port (handles bracketed IPv6 like "[::1]:3000"). */
function stripPort(host: string): string {
  const h = host.trim();
  if (h.startsWith('[')) {
    const end = h.indexOf(']');
    return end === -1 ? h : h.slice(0, end + 1);
  }
  const colon = h.indexOf(':');
  // More than one colon without brackets: bare IPv6, no port
  if (colon !== -1 && h.indexOf(':', colon + 1) === -1) return h.slice(0, colon);
  return h;
}

function isIpAddress(hostname: string): boolean {
  if (hostname.startsWith('[') || hostname.includes(':')) return true; // IPv6
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Default tenant-ID validator.
 * Allows 2–64 chars: lowercase alphanumerics and hyphens,
 * must start and end with an alphanumeric.
 *
 * Override via `options.validateTenantId` for UUIDs or other formats.
 */
const DEFAULT_TENANT_ID_RE = /^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/;

function defaultValidate(id: string): boolean {
  return DEFAULT_TENANT_ID_RE.test(id);
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export function multiTenancy(options: MultiTenancyOptions = {}): MiddlewareFn {
  const {
    strategy       = 'header',
    headerName     = 'x-tenant-id',
    resolveTenant  = async (id: string): Promise<Tenant> => ({
      id,
      name: `Tenant ${id}`,
      status: 'active',
    }),
    validateTenantId = defaultValidate,
    required       = true,
    customResolver,
  } = options;

  return async (req: any, res: any, next: (err?: Error) => void) => {
    try {
      // ── 1. Extract raw tenant ID ────────────────────────────────────
      let tenantId: string | null = null;

      switch (strategy) {
        case 'header':
          tenantId = (req.headers[headerName.toLowerCase()] as string) ?? null;
          break;

        case 'subdomain': {
          const hostHeader = (req.headers['host'] as string) ?? '';
          const hostname = stripPort(hostHeader);
          // IP-address hosts (e.g. 10.0.0.5, [::1]) never carry a tenant
          if (isIpAddress(hostname)) {
            tenantId = null;
            break;
          }
          const segments = hostname.split('.');
          // Require at least "tenant.example.com" (3 segments) to avoid
          // treating "localhost" or "example.com" as a tenant.
          tenantId = segments.length >= 3 ? segments[0] : null;
          break;
        }

        case 'jwt':
          tenantId = req.locals?.user?.tenantId ?? null;
          break;

        case 'custom':
          if (!customResolver) {
            return next(new Error('customResolver is required when strategy is "custom"'));
          }
          tenantId = await customResolver(req);
          break;
      }

      // ── 2. Handle missing tenant ────────────────────────────────────
      if (!tenantId) {
        if (required) {
          return next(
            new UnauthorizedError(
              `Tenant identification required (strategy: ${strategy}).`
            )
          );
        }
        return next();
      }

      // ── 3. Validate format ──────────────────────────────────────────
      if (!validateTenantId(tenantId)) {
        return next(
          new UnauthorizedError(`Malformed tenant identifier: "${tenantId}".`)
        );
      }

      // ── 4. Resolve full tenant object ───────────────────────────────
      const tenant = await resolveTenant(tenantId);

      if (!tenant) {
        if (required) {
          return next(new UnauthorizedError(`Unknown tenant: "${tenantId}".`));
        }
        return next();
      }

      // ── 5. Reject suspended / archived tenants ──────────────────────
      if (tenant.status === 'suspended') {
        return next(
          new UnauthorizedError(`Tenant "${tenantId}" is suspended.`)
        );
      }
      if (tenant.status === 'archived') {
        return next(
          new UnauthorizedError(`Tenant "${tenantId}" has been archived.`)
        );
      }

      // ── 6. Attach context ───────────────────────────────────────────
      if (!req.locals) req.locals = {};
      (req.locals as any).tenant = tenant;
      (req.locals as any).tenantContext = {
        tenant,
        resolvedBy: strategy,
      } satisfies TenantContext;

      next();
    } catch (err) {
      next(err instanceof Error ? err : new Error(String(err)));
    }
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Retrieve the full `Tenant` from request locals.
 * Throws if multi-tenancy middleware has not run.
 */
export function getTenant(req: any): Tenant {
  const tenant = req.locals?.tenant as Tenant | undefined;
  if (!tenant) {
    throw new UnauthorizedError(
      'No tenant context — ensure multiTenancy() middleware is applied.'
    );
  }
  return tenant;
}

/**
 * Shorthand: retrieve only the tenant ID string.
 */
export function getTenantId(req: any): string {
  return getTenant(req).id;
}