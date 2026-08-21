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
import { MiddlewareFn } from '@axiljs/common';
import type { Tenant, TenantContext, MultiTenancyOptions, TenantResolutionStrategy } from './types';
export type { Tenant, TenantContext, MultiTenancyOptions, TenantResolutionStrategy };
export declare function multiTenancy(options?: MultiTenancyOptions): MiddlewareFn;
/**
 * Retrieve the full `Tenant` from request locals.
 * Throws if multi-tenancy middleware has not run.
 */
export declare function getTenant(req: any): Tenant;
/**
 * Shorthand: retrieve only the tenant ID string.
 */
export declare function getTenantId(req: any): string;
//# sourceMappingURL=multi-tenancy.d.ts.map