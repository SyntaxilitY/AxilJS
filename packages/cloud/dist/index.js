"use strict";
/**
 * @axiljs/cloud — Public API
 *
 * Phase 1: Multi-tenancy, Audit, Feature Flags, Deployment, Dashboard
 * Phase 2: Rate Limiting, Secrets, Quotas, Cache, Correlation, Health Aggregation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthAggregator = exports.correlationId = exports.cache = exports.CloudCache = exports.quotas = exports.QuotaManager = exports.secrets = exports.SecretsManager = exports.tenantRateLimiter = exports.createDashboard = exports.generateDeployment = exports.featureFlags = exports.FeatureFlagManager = exports.auditMiddleware = exports.auditLog = exports.getTenantId = exports.getTenant = exports.multiTenancy = void 0;
// ─── Phase 1 ─────────────────────────────────────────────────────────────────
var multi_tenancy_1 = require("./multi-tenancy");
Object.defineProperty(exports, "multiTenancy", { enumerable: true, get: function () { return multi_tenancy_1.multiTenancy; } });
Object.defineProperty(exports, "getTenant", { enumerable: true, get: function () { return multi_tenancy_1.getTenant; } });
Object.defineProperty(exports, "getTenantId", { enumerable: true, get: function () { return multi_tenancy_1.getTenantId; } });
var audit_1 = require("./audit");
Object.defineProperty(exports, "auditLog", { enumerable: true, get: function () { return audit_1.auditLog; } });
Object.defineProperty(exports, "auditMiddleware", { enumerable: true, get: function () { return audit_1.auditMiddleware; } });
var feature_flags_1 = require("./feature-flags");
Object.defineProperty(exports, "FeatureFlagManager", { enumerable: true, get: function () { return feature_flags_1.FeatureFlagManager; } });
Object.defineProperty(exports, "featureFlags", { enumerable: true, get: function () { return feature_flags_1.featureFlags; } });
var deployment_1 = require("./deployment");
Object.defineProperty(exports, "generateDeployment", { enumerable: true, get: function () { return deployment_1.generateDeployment; } });
var dashboard_1 = require("./dashboard");
Object.defineProperty(exports, "createDashboard", { enumerable: true, get: function () { return dashboard_1.createDashboard; } });
// ─── Phase 2 ─────────────────────────────────────────────────────────────────
var rate_limiter_1 = require("./rate-limiter");
Object.defineProperty(exports, "tenantRateLimiter", { enumerable: true, get: function () { return rate_limiter_1.tenantRateLimiter; } });
var secrets_1 = require("./secrets");
Object.defineProperty(exports, "SecretsManager", { enumerable: true, get: function () { return secrets_1.SecretsManager; } });
Object.defineProperty(exports, "secrets", { enumerable: true, get: function () { return secrets_1.secrets; } });
var quota_1 = require("./quota");
Object.defineProperty(exports, "QuotaManager", { enumerable: true, get: function () { return quota_1.QuotaManager; } });
Object.defineProperty(exports, "quotas", { enumerable: true, get: function () { return quota_1.quotas; } });
var cache_1 = require("./cache");
Object.defineProperty(exports, "CloudCache", { enumerable: true, get: function () { return cache_1.CloudCache; } });
Object.defineProperty(exports, "cache", { enumerable: true, get: function () { return cache_1.cache; } });
var correlation_1 = require("./correlation");
Object.defineProperty(exports, "correlationId", { enumerable: true, get: function () { return correlation_1.correlationId; } });
var health_aggregator_1 = require("./health-aggregator");
Object.defineProperty(exports, "HealthAggregator", { enumerable: true, get: function () { return health_aggregator_1.HealthAggregator; } });
//# sourceMappingURL=index.js.map