/**
 * @axiljs/cloud — Centralized Type Contracts
 *
 * Single source of truth for every cloud-layer type.
 * All modules import from here; nothing is duplicated.
 */

// ─── Tenant ──────────────────────────────────────────────────────────────────

export type TenantStatus = 'active' | 'suspended' | 'archived';
export type TenantPlan   = 'free' | 'pro' | 'enterprise';

export interface Tenant {
  id:     string;
  name:   string;
  status: TenantStatus;
  plan?:  TenantPlan;
  metadata?: Record<string, unknown>;
}

export interface TenantContext {
  tenant:    Tenant;
  resolvedBy: TenantResolutionStrategy;
}

export type TenantResolutionStrategy =
  | 'header'
  | 'subdomain'
  | 'jwt'
  | 'custom';

export interface MultiTenancyOptions {
  strategy?:       TenantResolutionStrategy;
  headerName?:     string;
  resolveTenant?:  (tenantId: string) => Promise<Tenant | null>;
  validateTenantId?: (tenantId: string) => boolean;
  required?:       boolean;
  /** Used only when strategy === 'custom'. */
  customResolver?: (req: any) => string | null | Promise<string | null>;
}

// ─── Audit ───────────────────────────────────────────────────────────────────

export interface AuditActor {
  id:   string | number;
  type: 'user' | 'system' | 'api' | 'service';
}

export interface AuditTarget {
  type: string;
  id:   string | number;
}

export interface AuditEvent {
  action:    string;
  actor:     AuditActor;
  tenantId?: string;
  target?:   AuditTarget;
  metadata:  Record<string, unknown>;
  ip?:       string;
  userAgent?: string;
  requestId?: string;
  success:   boolean;
  error?:    string;
  timestamp: string;
}

export interface AuditMiddlewareOptions {
  /** Emit coloured log lines to stdout (default: true in dev). */
  logToConsole?: boolean;
}

// ─── Feature Flags ───────────────────────────────────────────────────────────

export interface FeatureFlag {
  name:              string;
  enabled:           boolean;
  description?:      string;
  /** 0–100.  Deterministic hash bucket is compared against this. */
  rolloutPercentage: number;
  allowedTenants?:   string[];
  allowedUsers?:     (string | number)[];
  /** ISO-8601.  Flag is inert before this time. */
  startAt?:          string;
  /** ISO-8601.  Flag is inert after this time. */
  endAt?:            string;
}

export interface FeatureFlagContext {
  tenantId?: string;
  userId?:   string | number;
}

// ─── Deployment ──────────────────────────────────────────────────────────────

export type CloudProvider = 'aws' | 'azure' | 'gcp' | 'k8s' | 'docker';

export interface KubernetesResources {
  cpuRequest?:    string;   // e.g. '100m'
  cpuLimit?:      string;   // e.g. '500m'
  memoryRequest?: string;   // e.g. '128Mi'
  memoryLimit?:   string;   // e.g. '512Mi'
}

export interface DeploymentConfig {
  appName:    string;
  version:    string;
  port:       number;
  replicas?:  number;
  domain?:    string;
  env?:       Record<string, string>;
  /** Container image registry (no trailing slash). Omit for local builds. */
  registry?:  string;
  resources?: KubernetesResources;
  minReplicas?: number;
  maxReplicas?: number;
  targetCPU?:   number;     // HPA target CPU % (default 70)
  healthPath?:  string;     // default '/health'
}

export interface GeneratedManifest {
  filename: string;
  content:  string;
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

export interface DashboardOptions {
  /** Path the dashboard fetches for Prometheus metrics (default '/metrics'). */
  metricsEndpoint?: string;
  /** Path the dashboard fetches for health JSON (default '/health'). */
  healthEndpoint?:  string;
  /** Auto-refresh interval in ms (default 5 000). */
  refreshMs?:       number;
  /** Page title (default 'AxilJS Cloud Dashboard'). */
  title?:           string;
}


// ─── Rate Limiter ────────────────────────────────────────────────────────────

export interface RateLimitRule {
  /** Max requests allowed in the window. */
  max: number;
  /** Window duration in milliseconds. */
  windowMs: number;
  /** Optional per-endpoint path pattern (e.g. '/api/*'). */
  pathPattern?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  limit: number;
}

export interface TenantRateLimiterOptions {
  /** Default rule applied when no tenant-specific rule exists. */
  defaultRule: RateLimitRule;
  /** Per-tenant overrides keyed by tenant ID. */
  tenantRules?: Record<string, RateLimitRule>;
  /** Custom key extractor. Default: `${tenantId}:${method}:${path}`. */
  keyExtractor?: (req: any) => string;
}

// ─── Secrets Manager ─────────────────────────────────────────────────────────

export interface SecretsManagerOptions {
  /** 32-byte hex-encoded AES-256 key. Generated automatically if omitted. */
  encryptionKey?: string;
}

export interface StoredSecret {
  name: string;
  encryptedValue: string;
  iv: string;
  authTag: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Quota Manager ───────────────────────────────────────────────────────────

export type QuotaMetric = 'api_calls' | 'storage_bytes' | 'users' | 'projects' | 'custom';

export interface QuotaLimit {
  metric: QuotaMetric;
  max: number;
  period?: 'daily' | 'monthly' | 'lifetime';
}

export interface QuotaUsage {
  metric: QuotaMetric;
  current: number;
  limit: number;
  period: string;
  resetAt?: string;
  percentUsed: number;
}

export interface TenantQuotaConfig {
  tenantId: string;
  limits: QuotaLimit[];
}

// ─── Cache ───────────────────────────────────────────────────────────────────

export interface CacheEntry<T = unknown> {
  value: T;
  expiresAt: number;
  tags: string[];
}

export interface CacheOptions {
  /** Default TTL in milliseconds (default: 60000). */
  defaultTtlMs?: number;
  /** Max entries before LRU eviction (default: 10000). */
  maxEntries?: number;
}

// ─── Correlation ─────────────────────────────────────────────────────────────

export interface CorrelationOptions {
  /** Header name for incoming correlation ID (default: 'x-correlation-id'). */
  headerName?: string;
  /** Header name for request ID (default: 'x-request-id'). */
  requestIdHeader?: string;
  /** Whether to generate IDs if missing (default: true). */
  generateIfMissing?: boolean;
}

// ─── Health Aggregator ───────────────────────────────────────────────────────

export interface ServiceHealthCheck {
  name: string;
  url: string;
  timeoutMs?: number;
  headers?: Record<string, string>;
}

export interface AggregatedHealthResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  services: Array<{
    name: string;
    status: 'up' | 'down' | 'timeout';
    latencyMs: number;
    error?: string;
  }>;
  timestamp: string;
}