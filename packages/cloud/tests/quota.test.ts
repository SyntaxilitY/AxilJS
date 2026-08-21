import { describe, it, expect, beforeEach } from 'vitest';
import { QuotaManager } from '../src/quota';

describe('Quota Manager', () => {
  let qm: QuotaManager;

  beforeEach(() => {
    qm = new QuotaManager();
    qm.configure({
      tenantId: 'acme-corp',
      limits: [
        { metric: 'api_calls', max: 5, period: 'daily' },
        { metric: 'users', max: 10, period: 'lifetime' },
      ],
    });
  });

  it('allows usage within quota', () => {
    const allowed = qm.increment('acme-corp', 'api_calls');
    expect(allowed).toBe(true);
  });

  it('blocks usage exceeding quota', () => {
    for (let i = 0; i < 5; i++) {
      qm.increment('acme-corp', 'api_calls');
    }
    const allowed = qm.increment('acme-corp', 'api_calls');
    expect(allowed).toBe(false);
  });

  it('returns usage report', () => {
    qm.increment('acme-corp', 'api_calls', 3);
    const usage = qm.getUsage('acme-corp');

    const apiUsage = usage.find(u => u.metric === 'api_calls')!;
    expect(apiUsage.current).toBe(3);
    expect(apiUsage.limit).toBe(5);
    expect(apiUsage.percentUsed).toBe(60);
  });

  it('allows unlimited when no config exists', () => {
    expect(qm.increment('unknown-tenant', 'api_calls')).toBe(true);
  });
});