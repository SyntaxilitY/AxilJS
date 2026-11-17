import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  tPure, tReadOnly, tSideEffect, tTenantIsolated, tIdempotent, tSlo, tDeprecated, tDeadline
} from '@axiljs/decorator';
import { getGlobalEventBus } from '@axiljs/events';
import {
  wire,
  runWithContext,
  configureIntent,
  getIntentViolations,
  clearIntentViolations,
  reportSideEffect,
  installSideEffectProbes,
  getSloReport,
  resetSloReport,
  IntentViolationError,
  DeadlineExceededError,
  enforcedDecorators
} from '../src';

beforeEach(() => {
  configureIntent({ mode: 'enforce' });
  clearIntentViolations();
});

describe('tPure / tReadOnly / tSideEffect', () => {
  it('rejects a db write inside tReadOnly and allows reads', async () => {
    class Repo {
      @tReadOnly()
      async find() { reportSideEffect('db.read', 'SELECT 1'); return 1; }

      @tReadOnly()
      async sneaky() { reportSideEffect('db.write', 'UPDATE users'); return 2; }
    }
    wire(Repo);
    await expect(new Repo().find()).resolves.toBe(1);
    await expect(new Repo().sneaky()).rejects.toBeInstanceOf(IntentViolationError);
    expect(getIntentViolations()[0]).toMatchObject({ decorator: 'tReadOnly', target: 'Repo.sneaky' });
  });

  it('propagates through the call tree to tSideEffect methods', async () => {
    class Mailer {
      @tSideEffect('email')
      async send() { return 'sent'; }
    }
    class Report {
      constructor(private mailer: Mailer) {}
      @tPure()
      async compute(x: number) { await this.mailer.send(); return x * 2; }
    }
    wire(Mailer);
    wire(Report);
    await expect(new Report(new Mailer()).compute(2)).rejects.toThrow(/tPure.*email/);
    // Outside a pure scope the side effect is fine
    await expect(new Mailer().send()).resolves.toBe('sent');
  });

  it('tPure forbids even reads', async () => {
    class Calc {
      @tPure()
      async total() { reportSideEffect('db.read'); return 0; }
    }
    wire(Calc);
    await expect(new Calc().total()).rejects.toBeInstanceOf(IntentViolationError);
  });

  it('warn mode records and emits instead of throwing', async () => {
    configureIntent({ mode: 'warn' });
    const seen: any[] = [];
    const sub = getGlobalEventBus().on('runtime.intent.violation', (e: any) => { seen.push(e.payload); });
    try {
      class Repo {
        @tReadOnly()
        async sneaky() { reportSideEffect('db.write'); return 'done'; }
      }
      wire(Repo);
      await expect(new Repo().sneaky()).resolves.toBe('done');
      await new Promise(r => setImmediate(r));
      expect(seen).toHaveLength(1);
      expect(getIntentViolations()).toHaveLength(1);
    } finally {
      sub.unsubscribe();
    }
  });

  it('probes report fs writes inside a scope only', async () => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const file = path.join(os.tmpdir(), `axil-probe-${process.pid}.txt`);
    const uninstall = installSideEffectProbes({ fetch: false });
    try {
      class Svc {
        @tReadOnly()
        async write() { fs.writeFileSync(file, 'x'); }
      }
      wire(Svc);
      await expect(new Svc().write()).rejects.toThrow(/fs\.write/);
      expect(fs.existsSync(file)).toBe(false);
      fs.writeFileSync(file, 'ok'); // outside a scope: unaffected
      expect(fs.readFileSync(file, 'utf8')).toBe('ok');
    } finally {
      uninstall();
      fs.rmSync(file, { force: true });
    }
  });
});

describe('tTenantIsolated', () => {
  class Orders {
    rows = [{ id: 1, tenantId: 't1' }, { id: 2, tenantId: 't2' }];
    @tTenantIsolated()
    async mine() { return this.rows.filter(r => r.tenantId === 't1'); }
    @tTenantIsolated()
    async leaky() { return { data: this.rows }; }
  }
  wire(Orders);

  it('passes rows of the current tenant', async () => {
    await expect(runWithContext({ tenantId: 't1' }, () => new Orders().mine())).resolves.toHaveLength(1);
  });

  it('rejects rows of another tenant', async () => {
    await expect(runWithContext({ tenantId: 't1' }, () => new Orders().leaky())).rejects.toThrow(/tenant 't2'/);
  });

  it('rejects calls without a tenant', async () => {
    await expect(new Orders().mine()).rejects.toThrow(/without a tenant/);
  });
});

describe('tIdempotent', () => {
  it('runs once per key and replays the result (concurrent and later calls)', async () => {
    class Payments {
      charges = 0;
      @tIdempotent({ key: 'order:{0}' })
      async charge(orderId: string) {
        this.charges++;
        await new Promise(r => setTimeout(r, 5));
        return `charged-${orderId}-${this.charges}`;
      }
    }
    wire(Payments);
    const p = new Payments();
    const [a, b] = await Promise.all([p.charge('o1'), p.charge('o1')]);
    const c = await p.charge('o1');
    expect(a).toBe('charged-o1-1');
    expect(b).toBe(a);
    expect(c).toBe(a);
    expect(p.charges).toBe(1);
    await p.charge('o2');
    expect(p.charges).toBe(2);
  });

  it('does not store failures', async () => {
    class Job {
      runs = 0;
      @tIdempotent({ key: 'args.0' })
      async run(_k: string) { if (++this.runs === 1) throw new Error('fail'); return 'ok'; }
    }
    wire(Job);
    const j = new Job();
    await expect(j.run('k')).rejects.toThrow('fail');
    await expect(j.run('k')).resolves.toBe('ok');
  });

  it('flags a missing key', async () => {
    class Job {
      @tIdempotent({ key: 'header:idempotency-key' })
      async run() { return 1; }
    }
    wire(Job);
    await expect(new Job().run()).rejects.toThrow(/no idempotency key/);
  });
});

describe('tSlo', () => {
  afterEach(() => resetSloReport());

  it('reports percentiles and emits a breach event', async () => {
    const breaches: any[] = [];
    const sub = getGlobalEventBus().on('runtime.slo.breach', (e: any) => { breaches.push(e.payload); });
    try {
      class Api {
        @tSlo({ latency: 1, percentile: 95 })
        async slow() { await new Promise(r => setTimeout(r, 3)); }
      }
      wire(Api);
      const api = new Api();
      for (let i = 0; i < 50; i++) await api.slow();
      await new Promise(r => setImmediate(r));
      const [report] = getSloReport();
      expect(report.target).toBe('Api.slow');
      expect(report.samples).toBe(50);
      expect(report.meetsLatency).toBe(false);
      expect(breaches).toHaveLength(1);
    } finally {
      sub.unsubscribe();
    }
  });
});

describe('tDeprecated / tDeadline', () => {
  it('fails after removeAfter', async () => {
    class Old {
      @tDeprecated({ removeAfter: '2000-01-01' })
      async legacy() { return 1; }
      @tDeprecated({ replacement: 'v2' })
      async current() { return 2; }
    }
    wire(Old);
    await expect(new Old().legacy()).rejects.toThrow(/removal date/);
    await expect(new Old().current()).resolves.toBe(2);
  });

  it('rejects after an absolute deadline', async () => {
    class Promo {
      @tDeadline('2000-01-01T00:00:00Z')
      async expired() { return 1; }
      @tDeadline('2999-01-01T00:00:00Z')
      async active() { return 2; }
    }
    wire(Promo);
    await expect(new Promo().expired()).rejects.toBeInstanceOf(DeadlineExceededError);
    await expect(new Promo().active()).resolves.toBe(2);
  });
});

describe('enforcedDecorators', () => {
  it('lists the built-in interceptors', () => {
    const names = enforcedDecorators().map(d => d.decorator);
    for (const n of ['tAudit', 'tRetry', 'tTimeout', 'tPure', 'tReadOnly', 'tIdempotent', 'tCircuitBreaker', 'tCache', 'tLock']) {
      expect(names).toContain(n);
    }
  });
});
