/**
 * Feature Flags System.
 *
 * Runtime feature toggles with deterministic, identity-based rollout.
 */

import type { FeatureFlag, FeatureFlagContext } from './types';

export type { FeatureFlag, FeatureFlagContext };

// ─── Deterministic Hash ──────────────────────────────────────────────────────

function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function bucket(flagName: string, identity: string): number {
  return fnv1a(`${flagName}:${identity}`) % 100;
}

// ─── Manager ─────────────────────────────────────────────────────────────────

export class FeatureFlagManager {
  private flags = new Map<string, FeatureFlag>();

  /**
   * Create or update a feature flag.
   */
  define(flag: Omit<FeatureFlag, 'rolloutPercentage'> & {
    rolloutPercentage?: number;
  }): void {
    const pct = flag.rolloutPercentage ?? 100;

    if (!Number.isInteger(pct) || pct < 0 || pct > 100) {
      throw new RangeError(
        `rolloutPercentage must be an integer 0–100 (got ${pct}).`
      );
    }

    this.flags.set(flag.name, { ...flag, rolloutPercentage: pct });
  }

  /**
   * Evaluate whether a flag is active for the given context.
   */
  isEnabled(name: string, context: FeatureFlagContext = {}): boolean {
    const flag = this.flags.get(name);
    if (!flag || !flag.enabled) return false;

    const now = Date.now();

    // Schedule check
    if (flag.startAt && new Date(flag.startAt).getTime() > now) return false;
    if (flag.endAt   && new Date(flag.endAt).getTime()   < now) return false;

    // Check Whitelists First
    let tenantMatched = false;
    if (flag.allowedTenants && flag.allowedTenants.length > 0) {
      if (context.tenantId && flag.allowedTenants.includes(context.tenantId)) {
        tenantMatched = true;
      }
    }

    let userMatched = false;
    if (flag.allowedUsers && flag.allowedUsers.length > 0) {
      if (context.userId && flag.allowedUsers.includes(context.userId)) {
        userMatched = true;
      }
    }

    // If explicitly whitelisted, grant access immediately (bypasses rollout percentage)
    if (tenantMatched || userMatched) {
      return true;
    }

    // If whitelists are set but the request didn't match, reject it
    if (flag.allowedTenants && flag.allowedTenants.length > 0 && !tenantMatched) {
      return false;
    }
    if (flag.allowedUsers && flag.allowedUsers.length > 0 && !userMatched) {
      return false;
    }

    // Fallback to deterministic rollout percentage
    if (flag.rolloutPercentage < 100) {
      const identity = String(context.userId ?? context.tenantId ?? 'anonymous');
      if (bucket(name, identity) >= flag.rolloutPercentage) return false;
    }

    return true;
  }

  get(name: string): FeatureFlag | undefined {
    return this.flags.get(name);
  }

  getAll(): FeatureFlag[] {
    return Array.from(this.flags.values());
  }

  remove(name: string): boolean {
    return this.flags.delete(name);
  }
}

export const featureFlags = new FeatureFlagManager();