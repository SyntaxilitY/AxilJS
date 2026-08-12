"use strict";
/**
 * @restjs/cloud - Public API
 * Enterprise cloud platform — deployment, multi-tenancy, audit, feature flags, dashboard.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDashboard = exports.generateDeployment = exports.FeatureFlagManager = exports.featureFlags = exports.auditMiddleware = exports.auditLog = exports.getTenant = exports.multiTenancy = void 0;
// Multi-tenancy
var multi_tenancy_1 = require("./multi-tenancy");
Object.defineProperty(exports, "multiTenancy", { enumerable: true, get: function () { return multi_tenancy_1.multiTenancy; } });
Object.defineProperty(exports, "getTenant", { enumerable: true, get: function () { return multi_tenancy_1.getTenant; } });
// Audit logging
var audit_1 = require("./audit");
Object.defineProperty(exports, "auditLog", { enumerable: true, get: function () { return audit_1.auditLog; } });
Object.defineProperty(exports, "auditMiddleware", { enumerable: true, get: function () { return audit_1.auditMiddleware; } });
// Feature flags
var feature_flags_1 = require("./feature-flags");
Object.defineProperty(exports, "featureFlags", { enumerable: true, get: function () { return feature_flags_1.featureFlags; } });
Object.defineProperty(exports, "FeatureFlagManager", { enumerable: true, get: function () { return feature_flags_1.FeatureFlagManager; } });
// Deployment toolkit
var deployment_1 = require("./deployment");
Object.defineProperty(exports, "generateDeployment", { enumerable: true, get: function () { return deployment_1.generateDeployment; } });
// Dashboard
var dashboard_1 = require("./dashboard");
Object.defineProperty(exports, "createDashboard", { enumerable: true, get: function () { return dashboard_1.createDashboard; } });
//# sourceMappingURL=index.js.map