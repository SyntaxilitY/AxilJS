/**
 * Multi-Tenancy Middleware.
 * Isolates data and configuration per tenant.
 * Supports header, subdomain, or JWT-based tenant resolution.
 *
 * Usage:
 *   app.use(multiTenancy({ strategy: 'header' }))
 *   // req.locals.tenant = { id: 'acme-corp', name: 'Acme Corp' }
 */
import { MiddlewareFn } from '@axil/common';
export type TenantResolutionStrategy = 'header' | 'subdomain' | 'jwt';
export interface Tenant {
    id: string;
    name: string;
    plan?: 'free' | 'pro' | 'enterprise';
    [key: string]: unknown;
}
export interface MultiTenancyOptions {
    strategy?: TenantResolutionStrategy;
    headerName?: string;
    resolveTenant?: (tenantId: string) => Promise<Tenant | null>;
    required?: boolean;
}
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
export declare function multiTenancy(options?: MultiTenancyOptions): MiddlewareFn;
/**
 * Get current tenant from request locals.
 * Throws UnauthorizedError if no tenant is present.
 *
 * Usage:
 *   const tenant = getTenant(req)
 *   console.log(tenant.id)
 */
export declare function getTenant(req: any): Tenant;
//# sourceMappingURL=multi-tenancy.d.ts.map