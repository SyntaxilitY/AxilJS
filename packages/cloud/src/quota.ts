/**
 * Tenant Quota Manager.
 *
 * Tracks per-tenant resource usage (API calls, storage, users, etc.)
 * and enforces configurable limits.  Emits events when tenants
 * approach or exceed their quotas.
 *
 * Integrates with @axiljs/cloud multi-tenancy and audit systems.
 *
 * Usage:
 *   const quotas = new QuotaManager()
 *   quotas.configure({ tenantId: 'acme-corp', limits: [
 *     { metric: 'api_calls', max: 100000, period: 'monthly' },
 *     { metric: 'users', max: 500, period: 'lifetime' }
 *   ]})
 *
 *   // In middleware:
 *   quotas.increment('acme-corp', 'api_calls')
 *   if (!quotas.check('acme-corp', 'api_calls')) {
 *     // reject request — quota exceeded
 *   }
 */

import { getGlobalEventBus } from '@axiljs/events';
import type { QuotaLimit, QuotaUsage, QuotaMetric, TenantQuotaConfig } from './types';

export type { QuotaLimit, QuotaUsage, QuotaMetric, TenantQuotaConfig };

interface UsageRecord {
  current: number;
  periodStart: number;
}

export class QuotaManager {
  private configs = new Map<string, QuotaLimit[]>();
  private usage = new Map<string, Map<string, UsageRecord>>();

  /**
   * Set quota limits for a tenant.
   */
  configure(config: TenantQuotaConfig): void {
    this.configs.set(config.tenantId, config.limits);
    if (!this.usage.has(config.tenantId)) {
      this.usage.set(config.tenantId, new Map());
    }
  }

  /**
   * Increment usage for a metric.
   * Returns `true` if within quota, `false` if exceeded.
   */
  increment(tenantId: string, metric: QuotaMetric, amount = 1): boolean {
    const limits = this.configs.get(tenantId);
    if (!limits) return true; // No limits configured = unlimited

    const limit = limits.find(l => l.metric === metric);
    if (!limit) return true; // No limit for this metric

    const usageMap = this.usage.get(tenantId)!;
    const key = `${metric}:${limit.period ?? 'lifetime'}`;
    const now = Date.now();

    let record = usageMap.get(key);

    // Reset counter if period has elapsed
    if (record && limit.period && this.isPeriodExpired(record.periodStart, limit.period)) {
      record = undefined;
    }

    if (!record) {
      record = { current: 0, periodStart: now };
      usageMap.set(key, record);
    }

    record.current += amount;

    const exceeded = record.current > limit.max;

    if (exceeded) {
      getGlobalEventBus().emit('quota.exceeded', {
        tenantId,
        metric,
        current: record.current,
        limit: limit.max,
        period: limit.period,
      });
    } else if (record.current >= limit.max * 0.9) {
      getGlobalEventBus().emit('quota.warning', {
        tenantId,
        metric,
        current: record.current,
        limit: limit.max,
        percentUsed: Math.round((record.current / limit.max) * 100),
      });
    }

    return !exceeded;
  }

  /**
   * Check if a tenant is within quota (without incrementing).
   */
  check(tenantId: string, metric: QuotaMetric): boolean {
    const limits = this.configs.get(tenantId);
    if (!limits) return true;

    const limit = limits.find(l => l.metric === metric);
    if (!limit) return true;

    const usageMap = this.usage.get(tenantId);
    if (!usageMap) return true;

    const key = `${metric}:${limit.period ?? 'lifetime'}`;
    const record = usageMap.get(key);
    if (!record) return true;

    if (limit.period && this.isPeriodExpired(record.periodStart, limit.period)) {
      return true; // Period expired, counter would reset
    }

    return record.current < limit.max;
  }

  /**
   * Get full usage report for a tenant.
   */
  getUsage(tenantId: string): QuotaUsage[] {
    const limits = this.configs.get(tenantId);
    if (!limits) return [];

    const usageMap = this.usage.get(tenantId);

    return limits.map(limit => {
      const key = `${limit.metric}:${limit.period ?? 'lifetime'}`;
      const record = usageMap?.get(key);
      const current = (record && !(limit.period && this.isPeriodExpired(record.periodStart, limit.period)))
        ? record.current
        : 0;

      return {
        metric: limit.metric,
        current,
        limit: limit.max,
        period: limit.period ?? 'lifetime',
        resetAt: record && limit.period
          ? new Date(this.getNextReset(record.periodStart, limit.period)).toISOString()
          : undefined,
        percentUsed: Math.round((current / limit.max) * 100),
      };
    });
  }

  // ─── Internal ────────────────────────────────────────────────────────────

  private isPeriodExpired(start: number, period: string): boolean {
    const now = Date.now();
    if (period === 'daily') return now - start > 86_400_000;
    if (period === 'monthly') return now - start > 2_592_000_000;
    return false; // lifetime never expires
  }

  private getNextReset(start: number, period: string): number {
    if (period === 'daily') return start + 86_400_000;
    if (period === 'monthly') return start + 2_592_000_000;
    return 0;
  }
}

/** Global singleton. */
export const quotas = new QuotaManager();