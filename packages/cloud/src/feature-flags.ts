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
  rolloutPercentage?: number;   // 0-100
  allowedTenants?: string[];
  allowedUsers?: (string | number)[];
  expiresAt?: string;
}

export class FeatureFlagManager {
  private flags = new Map<string, FeatureFlag>();

  /**
   * Define or update a feature flag.
   */
  define(flag: FeatureFlag): void {
    this.flags.set(flag.name, { ...flag, rolloutPercentage: flag.rolloutPercentage ?? 100 });
  }

  /**
   * Check if a feature is enabled for this context.
   */
  isEnabled(
    name: string,
    context: {
      tenantId?: string;
      userId?: string | number;
      percentage?: number;   // for A/B testing simulation
    } = {}
  ): boolean {
    const flag = this.flags.get(name);
    if (!flag) return false;
    if (!flag.enabled) return false;

    // Check expiry
    if (flag.expiresAt && new Date(flag.expiresAt) < new Date()) {
      return false;
    }

    // Tenant @axiljsriction
    if (flag.allowedTenants && context.tenantId) {
      if (!flag.allowedTenants.includes(context.tenantId)) return false;
    }

    // User @axiljsriction
    if (flag.allowedUsers && context.userId) {
      if (!flag.allowedUsers.includes(context.userId)) return false;
    }

    // Percentage rollout
    if (flag.rolloutPercentage !== 100 && context.percentage !== undefined) {
      return context.percentage <= flag.rolloutPercentage!;
    }

    return true;
  }

  /**
   * Get all flags (for admin UI).
   */
  getAll(): FeatureFlag[] {
    return Array.from(this.flags.values());
  }
}

// Global singleton
export const featureFlags = new FeatureFlagManager();