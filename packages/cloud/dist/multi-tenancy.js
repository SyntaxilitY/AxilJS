"use strict";
/**
 * Multi-Tenancy Middleware.
 *
 * Resolves the current tenant from the incoming request via header,
 * subdomain, JWT claim, or a caller-supplied custom function.
 *
 * Guarantees:
 *   • Tenant ID is validated before any downstream lookup.
 *   • Unknown, suspended and archived tenants are rejected with 401
 *     (UnauthorizedError), before any route or auth middleware runs.
 *   • Tenant context is attached to `req.locals.tenant`.
 *   • Works safely in multi-instance deployments (no process state).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.multiTenancy = multiTenancy;
exports.getTenant = getTenant;
exports.getTenantId = getTenantId;
const common_1 = require("@axiljs/common");
// ─── Host helpers ────────────────────────────────────────────────────────────
/** Strip an optional :port (handles bracketed IPv6 like "[::1]:3000"). */
function stripPort(host) {
    const h = host.trim();
    if (h.startsWith('[')) {
        const end = h.indexOf(']');
        return end === -1 ? h : h.slice(0, end + 1);
    }
    const colon = h.indexOf(':');
    // More than one colon without brackets: bare IPv6, no port
    if (colon !== -1 && h.indexOf(':', colon + 1) === -1)
        return h.slice(0, colon);
    return h;
}
function isIpAddress(hostname) {
    if (hostname.startsWith('[') || hostname.includes(':'))
        return true; // IPv6
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
function defaultValidate(id) {
    return DEFAULT_TENANT_ID_RE.test(id);
}
// ─── Middleware ───────────────────────────────────────────────────────────────
function multiTenancy(options = {}) {
    const { strategy = 'header', headerName = 'x-tenant-id', resolveTenant = async (id) => ({
        id,
        name: `Tenant ${id}`,
        status: 'active',
    }), validateTenantId = defaultValidate, required = true, customResolver, } = options;
    return async (req, res, next) => {
        try {
            // ── 1. Extract raw tenant ID ────────────────────────────────────
            let tenantId = null;
            switch (strategy) {
                case 'header':
                    tenantId = req.headers[headerName.toLowerCase()] ?? null;
                    break;
                case 'subdomain': {
                    const hostHeader = req.headers['host'] ?? '';
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
                    return next(new common_1.UnauthorizedError(`Tenant identification required (strategy: ${strategy}).`));
                }
                return next();
            }
            // ── 3. Validate format ──────────────────────────────────────────
            if (!validateTenantId(tenantId)) {
                return next(new common_1.UnauthorizedError(`Malformed tenant identifier: "${tenantId}".`));
            }
            // ── 4. Resolve full tenant object ───────────────────────────────
            const tenant = await resolveTenant(tenantId);
            if (!tenant) {
                if (required) {
                    return next(new common_1.UnauthorizedError(`Unknown tenant: "${tenantId}".`));
                }
                return next();
            }
            // ── 5. Reject suspended / archived tenants ──────────────────────
            if (tenant.status === 'suspended') {
                return next(new common_1.UnauthorizedError(`Tenant "${tenantId}" is suspended.`));
            }
            if (tenant.status === 'archived') {
                return next(new common_1.UnauthorizedError(`Tenant "${tenantId}" has been archived.`));
            }
            // ── 6. Attach context ───────────────────────────────────────────
            if (!req.locals)
                req.locals = {};
            req.locals.tenant = tenant;
            req.locals.tenantContext = {
                tenant,
                resolvedBy: strategy,
            };
            next();
        }
        catch (err) {
            next(err instanceof Error ? err : new Error(String(err)));
        }
    };
}
// ─── Helpers ─────────────────────────────────────────────────────────────────
/**
 * Retrieve the full `Tenant` from request locals.
 * Throws if multi-tenancy middleware has not run.
 */
function getTenant(req) {
    const tenant = req.locals?.tenant;
    if (!tenant) {
        throw new common_1.UnauthorizedError('No tenant context — ensure multiTenancy() middleware is applied.');
    }
    return tenant;
}
/**
 * Shorthand: retrieve only the tenant ID string.
 */
function getTenantId(req) {
    return getTenant(req).id;
}
//# sourceMappingURL=multi-tenancy.js.map