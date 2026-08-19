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
export interface FeatureFlag {
    name: string;
    enabled: boolean;
    description?: string;
    rolloutPercentage?: number;
    allowedTenants?: string[];
    allowedUsers?: (string | number)[];
    expiresAt?: string;
}
export declare class FeatureFlagManager {
    private flags;
    /**
     * Define or update a feature flag.
     */
    define(flag: FeatureFlag): void;
    /**
     * Check if a feature is enabled for this context.
     */
    isEnabled(name: string, context?: {
        tenantId?: string;
        userId?: string | number;
        percentage?: number;
    }): boolean;
    /**
     * Get all flags (for admin UI).
     */
    getAll(): FeatureFlag[];
}
export declare const featureFlags: FeatureFlagManager;
//# sourceMappingURL=feature-flags.d.ts.map