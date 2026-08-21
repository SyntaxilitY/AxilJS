/**
 * Feature Flags System.
 *
 * Runtime feature toggles with deterministic, identity-based rollout.
 */
import type { FeatureFlag, FeatureFlagContext } from './types';
export type { FeatureFlag, FeatureFlagContext };
export declare class FeatureFlagManager {
    private flags;
    /**
     * Create or update a feature flag.
     */
    define(flag: Omit<FeatureFlag, 'rolloutPercentage'> & {
        rolloutPercentage?: number;
    }): void;
    /**
     * Evaluate whether a flag is active for the given context.
     */
    isEnabled(name: string, context?: FeatureFlagContext): boolean;
    get(name: string): FeatureFlag | undefined;
    getAll(): FeatureFlag[];
    remove(name: string): boolean;
}
export declare const featureFlags: FeatureFlagManager;
//# sourceMappingURL=feature-flags.d.ts.map