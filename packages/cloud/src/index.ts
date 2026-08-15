/**
 * @axiljs/cloud - Public API
 * Enterprise cloud platform — deployment, multi-tenancy, audit, feature flags, dashboard.
 */

// Multi-tenancy
export { multiTenancy, getTenant }    from './multi-tenancy';
export type { Tenant, MultiTenancyOptions,
              TenantResolutionStrategy } from './multi-tenancy';

// Audit logging
export { auditLog, auditMiddleware }  from './audit';
export type { AuditEvent }            from './audit';

// Feature flags
export { featureFlags, FeatureFlagManager } from './feature-flags';
export type { FeatureFlag }                 from './feature-flags';

// Deployment toolkit
export { generateDeployment }         from './deployment';
export type { DeploymentConfig }      from './deployment';

// Dashboard
export { createDashboard }            from './dashboard';