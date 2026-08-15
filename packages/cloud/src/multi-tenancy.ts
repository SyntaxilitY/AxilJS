/**
 * Multi-Tenancy Middleware.
 * Isolates data and configuration per tenant.
 * Supports header, subdomain, or JWT-based tenant resolution.
 *
 * Usage:
 *   app.use(multiTenancy({ strategy: 'header' }))
 *   // req.locals.tenant = { id: 'acme-corp', name: 'Acme Corp' }
 */

import { MiddlewareFn, UnauthorizedError } from '@axil/common';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TenantResolutionStrategy = 'header' | 'subdomain' | 'jwt';

export interface Tenant {
  id:    string;
  name:  string;
  plan?: 'free' | 'pro' | 'enterprise';
  [key: string]: unknown;
}

export interface MultiTenancyOptions {
  // Strategy to determine tenant (default: 'header')
  strategy?: TenantResolutionStrategy;

  // Header name when using 'header' strategy (default: 'x-tenant-id')
  headerName?: string;

  // Resolve tenant from ID — database lookup, cache, etc.
  // Default: returns a simple object with the ID
  resolveTenant?: (tenantId: string) => Promise<Tenant | null>;

  // Whether a tenant is required (default: true)
  required?: boolean;
}

// ─── multiTenancy ─────────────────────────────────────────────────────────────

/**
 * Create multi-tenancy middleware.
 *
 * Usage:
 *   app.use(multiTenancy({ strategy: 'header' }))
 *   app.use(multiTenancy({ strategy: 'subdomain' }))
 *   app.use(multiTenancy({
 *     strategy: 'header',
 *     resolveTenant: async (id) => await db.findTenant(id)
 *   }))
 */
export function multiTenancy(options: MultiTenancyOptions = {}): MiddlewareFn {
  const {
    strategy       = 'header',
    headerName     = 'x-tenant-id',
    resolveTenant  = async (id: string) => ({ id, name: `Tenant ${id}` }),
    required       = true
  } = options;

  return async (req, res, next) => {
    let tenantId: string | null = null;

    switch (strategy) {

      case 'header':
        // Read tenant ID from a request header
        tenantId = (req.headers[headerName] as string) || null;
        break;

      case 'subdomain': {
        // Extract first subdomain segment from Host header
        const host = req.headers['host'] as string || '';
        const parts = host.split('.');
        // Only treat it as a subdomain if host has at least 2 segments
        tenantId = parts.length >= 2 ? (parts[0] || null) : null;
        break;
      }

      case 'jwt':
        // Extract tenantId from JWT payload (already decoded by authenticate())
        tenantId = (req.locals as any)?.user?.tenantId || null;
        break;
    }

    // No tenant identified
    if (!tenantId) {
      if (required) {
        return next(
          new UnauthorizedError(
            `Tenant identification required. ` +
            `Send the ${headerName} header.`
          )
        );
      }
      return next();
    }

    // Resolve tenant object
    try {
      const tenant = await resolveTenant(tenantId);

      if (!tenant && required) {
        return next(new UnauthorizedError(`Invalid tenant: ${tenantId}`));
      }

      // Attach to request locals
      (req.locals as any).tenant = tenant || { id: tenantId, name: 'Unknown' };

      next();
    } catch (error) {
      next(error instanceof Error ? error : new Error(String(error)));
    }
  };
}

// ─── getTenant ────────────────────────────────────────────────────────────────

/**
 * Get current tenant from request locals.
 * Throws UnauthorizedError if no tenant is present.
 *
 * Usage:
 *   const tenant = getTenant(req)
 *   console.log(tenant.id)
 */
export function getTenant(req: any): Tenant {
  const tenant = (req.locals as any)?.tenant as Tenant | undefined;

  if (!tenant) {
    throw new UnauthorizedError(
      'No tenant context. ' +
      'Make sure multiTenancy() middleware is applied.'
    );
  }

  return tenant;
}