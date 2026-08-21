/**
 * @axiljs/cloud — Public API
 *
 * Phase 1: Multi-tenancy, Audit, Feature Flags, Deployment, Dashboard
 * Phase 2: Rate Limiting, Secrets, Quotas, Cache, Correlation, Health Aggregation
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type {
  Tenant, TenantStatus, TenantPlan, TenantContext,
  TenantResolutionStrategy, MultiTenancyOptions,
  AuditEvent, AuditActor, AuditTarget, AuditMiddlewareOptions,
  FeatureFlag, FeatureFlagContext,
  DeploymentConfig, GeneratedManifest, KubernetesResources, CloudProvider,
  DashboardOptions,
  RateLimitRule, RateLimitResult, TenantRateLimiterOptions,
  SecretsManagerOptions, StoredSecret,
  QuotaMetric, QuotaLimit, QuotaUsage, TenantQuotaConfig,
  CacheEntry, CacheOptions,
  CorrelationOptions,
  ServiceHealthCheck, AggregatedHealthResult,
} from './types';

// ─── Phase 1 ─────────────────────────────────────────────────────────────────

export { multiTenancy, getTenant, getTenantId } from './multi-tenancy';
export { auditLog, auditMiddleware } from './audit';
export { FeatureFlagManager, featureFlags } from './feature-flags';
export { generateDeployment } from './deployment';
export { createDashboard } from './dashboard';

// ─── Phase 2 ─────────────────────────────────────────────────────────────────

export { tenantRateLimiter } from './rate-limiter';
export { SecretsManager, secrets } from './secrets';
export { QuotaManager, quotas } from './quota';
export { CloudCache, cache } from './cache';
export { correlationId } from './correlation';
export { HealthAggregator } from './health-aggregator';