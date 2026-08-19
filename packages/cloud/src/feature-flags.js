"use strict";
/**
 * Feature Flags System.
 * Runtime feature toggles with tenant/user scoping.
 *
 * Supports:
 *   - Global flags
 *   - Tenant-specific overrides
 *   - User-specific overrides
 *   - Percentage rollouts
 *   - Scheduled activation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.featureFlags = exports.FeatureFlagManager = void 0;
class FeatureFlagManager {
    flags = new Map();
    /**
     * Define or update a feature flag.
     */
    define(flag) {
        this.flags.set(flag.name, { ...flag, rolloutPercentage: flag.rolloutPercentage ?? 100 });
    }
    /**
     * Check if a feature is enabled for this context.
     */
    isEnabled(name, context = {}) {
        const flag = this.flags.get(name);
        if (!flag)
            return false;
        if (!flag.enabled)
            return false;
        // Check expiry
        if (flag.expiresAt && new Date(flag.expiresAt) < new Date()) {
            return false;
        }
        // Tenant @axiljsriction
        if (flag.allowedTenants && context.tenantId) {
            if (!flag.allowedTenants.includes(context.tenantId))
                return false;
        }
        // User @axiljsriction
        if (flag.allowedUsers && context.userId) {
            if (!flag.allowedUsers.includes(context.userId))
                return false;
        }
        // Percentage rollout
        if (flag.rolloutPercentage !== 100 && context.percentage !== undefined) {
            return context.percentage <= flag.rolloutPercentage;
        }
        return true;
    }
    /**
     * Get all flags (for admin UI).
     */
    getAll() {
        return Array.from(this.flags.values());
    }
}
exports.FeatureFlagManager = FeatureFlagManager;
// Global singleton
exports.featureFlags = new FeatureFlagManager();
//# sourceMappingURL=feature-flags.js.map