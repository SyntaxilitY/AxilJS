import { describe, it, expect, beforeEach } from 'vitest';
import { FeatureFlagManager } from '../src/feature-flags';

describe('Feature Flag System', () => {
  let manager: FeatureFlagManager;

  beforeEach(() => {
    manager = new FeatureFlagManager();
  });

  it('validates rollout percentage bounds', () => {
    expect(() => {
      manager.define({ name: 'test_flag', enabled: true, rolloutPercentage: 105 });
    }).toThrow(RangeError);

    expect(() => {
      manager.define({ name: 'test_flag', enabled: true, rolloutPercentage: -5 });
    }).toThrow(RangeError);
  });

  it('determines rollout deterministically by identity hash', () => {
    manager.define({
      name: 'beta_checkout',
      enabled: true,
      rolloutPercentage: 50,
    });

    const user1 = 'usr_uuid_1001';
    const user2 = 'usr_uuid_9999';

    // Evaluating multiple times yields identical results
    const eval1 = manager.isEnabled('beta_checkout', { userId: user1 });
    const eval1Repeat = manager.isEnabled('beta_checkout', { userId: user1 });
    expect(eval1).toBe(eval1Repeat);

    const eval2 = manager.isEnabled('beta_checkout', { userId: user2 });
    const eval2Repeat = manager.isEnabled('beta_checkout', { userId: user2 });
    expect(eval2).toBe(eval2Repeat);
  });

  it('respects tenant and user allow-lists', () => {
    manager.define({
      name: 'enterprise_export',
      enabled: true,
      rolloutPercentage: 0, // 0% global rollout
      allowedTenants: ['acme-corp', 'globex'],
      allowedUsers: ['vip-1'],
    });

    // Whitelisted tenant allowed
    expect(manager.isEnabled('enterprise_export', { tenantId: 'acme-corp' })).toBe(true);

    // Non-whitelisted tenant rejected
    expect(manager.isEnabled('enterprise_export', { tenantId: 'other-corp' })).toBe(false);

    // Whitelisted user allowed
    expect(manager.isEnabled('enterprise_export', { userId: 'vip-1' })).toBe(true);

    // Non-whitelisted user rejected
    expect(manager.isEnabled('enterprise_export', { userId: 'regular-user' })).toBe(false);
  });

  it('respects startAt and endAt schedule windows', () => {
    const past = new Date(Date.now() - 10000).toISOString();
    const future = new Date(Date.now() + 10000).toISOString();

    manager.define({
      name: 'scheduled_promo',
      enabled: true,
      startAt: future,
    });
    expect(manager.isEnabled('scheduled_promo')).toBe(false);

    manager.define({
      name: 'expired_promo',
      enabled: true,
      endAt: past,
    });
    expect(manager.isEnabled('expired_promo')).toBe(false);
  });
});