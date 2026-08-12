/**
 * @restjs/cloud - Public API
 * Enterprise cloud platform — deployment, multi-tenancy, audit, feature flags, dashboard.
 */
export { multiTenancy, getTenant } from './multi-tenancy';
export type { Tenant, MultiTenancyOptions, TenantResolutionStrategy } from './multi-tenancy';
export { auditLog, auditMiddleware } from './audit';
export type { AuditEvent } from './audit';
export { featureFlags, FeatureFlagManager } from './feature-flags';
export type { FeatureFlag } from './feature-flags';
export { generateDeployment } from './deployment';
export type { DeploymentConfig } from './deployment';
export { createDashboard } from './dashboard';
//# sourceMappingURL=index.d.ts.map