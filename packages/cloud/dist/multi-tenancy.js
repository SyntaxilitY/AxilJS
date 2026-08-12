"use strict";
/**
 * Multi-Tenancy Middleware.
 * Isolates data and configuration per tenant.
 * Supports header, subdomain, or JWT-based tenant resolution.
 *
 * Usage:
 *   app.use(multiTenancy({ strategy: 'header' }))
 *   // req.locals.tenant = { id: 'acme-corp', name: 'Acme Corp' }
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.multiTenancy = multiTenancy;
exports.getTenant = getTenant;
const common_1 = require("@restjs/common");
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
function multiTenancy(options = {}) {
    const { strategy = 'header', headerName = 'x-tenant-id', resolveTenant = async (id) => ({ id, name: `Tenant ${id}` }), required = true } = options;
    return async (req, res, next) => {
        let tenantId = null;
        switch (strategy) {
            case 'header':
                // Read tenant ID from a request header
                tenantId = req.headers[headerName] || null;
                break;
            case 'subdomain': {
                // Extract first subdomain segment from Host header
                const host = req.headers['host'] || '';
                const parts = host.split('.');
                // Only treat it as a subdomain if host has at least 2 segments
                tenantId = parts.length >= 2 ? (parts[0] || null) : null;
                break;
            }
            case 'jwt':
                // Extract tenantId from JWT payload (already decoded by authenticate())
                tenantId = req.locals?.user?.tenantId || null;
                break;
        }
        // No tenant identified
        if (!tenantId) {
            if (required) {
                return next(new common_1.UnauthorizedError(`Tenant identification required. ` +
                    `Send the ${headerName} header.`));
            }
            return next();
        }
        // Resolve tenant object
        try {
            const tenant = await resolveTenant(tenantId);
            if (!tenant && required) {
                return next(new common_1.UnauthorizedError(`Invalid tenant: ${tenantId}`));
            }
            // Attach to request locals
            req.locals.tenant = tenant || { id: tenantId, name: 'Unknown' };
            next();
        }
        catch (error) {
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
function getTenant(req) {
    const tenant = req.locals?.tenant;
    if (!tenant) {
        throw new common_1.UnauthorizedError('No tenant context. ' +
            'Make sure multiTenancy() middleware is applied.');
    }
    return tenant;
}
//# sourceMappingURL=multi-tenancy.js.map