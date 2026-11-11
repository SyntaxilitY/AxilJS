import { describe, it, expect, afterEach } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  resolveScaling,
  planCapacity,
  hostChecks,
  summarize,
  scanSource,
  loadTest,
  calibrate,
  serve,
  fmtNum
} from '../src';
import type { SystemInfo, ScalingConfig } from '../src';

const linux8: SystemInfo = {
  cores: 8,
  cpuModel: 'test',
  memoryBytes: 32 * 2 ** 30,
  freeMemoryBytes: 16 * 2 ** 30,
  platform: 'linux',
  nodeVersion: 'v24.0.0',
  fdLimit: 1_048_576,
  cgroupCpus: null,
  cgroupMemoryBytes: null
};

const plan = (config: ScalingConfig, system = linux8, rpsPerWorker = 15_000, p99Ms?: number) =>
  planCapacity({
    scaling: resolveScaling(config, system),
    system,
    measurement: { rpsPerWorker, p99Ms, source: 'measured' }
  });

const titles = (r: { findings: { level: string; title: string }[] }, level: string) =>
  r.findings.filter(f => f.level === level).map(f => f.title);

afterEach(() => {
  delete process.env.AXIL_WORKERS;
});

// ─── config ───────────────────────────────────────────────────────────────────

describe('resolveScaling', () => {
  it('fills defaults from the machine', () => {
    const r = resolveScaling({}, linux8);
    expect(r.vertical).toMatchObject({ workers: 8, workersAuto: true, maxConnectionsPerWorker: 10000 });
    expect(r.horizontal).toMatchObject({ min: 1, max: 1, instanceSize: { cpus: 8, memoryGb: 32 }, instanceSizeDefaulted: true });
    expect(r.headroom).toBe(0.3);
  });

  it('accepts autoscaling bounds and AXIL_WORKERS override', () => {
    process.env.AXIL_WORKERS = '3';
    const r = resolveScaling({ vertical: { workers: 'auto' }, horizontal: { instances: { min: 2, max: 9 } } }, linux8);
    expect(r.vertical.workers).toBe(3);
    expect(r.vertical.workersAuto).toBe(false);
    expect([r.horizontal.min, r.horizontal.max]).toEqual([2, 9]);
  });

  it('rejects bad values with the field name', () => {
    expect(() => resolveScaling({ vertical: { workers: 0 } }, linux8)).toThrow('vertical.workers');
    expect(() => resolveScaling({ vertical: { workers: 2.5 } }, linux8)).toThrow('positive integer');
    expect(() => resolveScaling({ horizontal: { instances: { min: 5, max: 2 } } }, linux8)).toThrow('max must be >= min');
    expect(() => resolveScaling({ target: { rps: -1 } }, linux8)).toThrow('target.rps');
  });
});

// ─── planner ──────────────────────────────────────────────────────────────────

describe('planCapacity', () => {
  const million = {
    target: { rps: 1_500_000 },
    horizontal: { instances: { min: 4, max: 10 }, instanceSize: { cpus: 8, memoryGb: 16 } }
  };

  it('fails when max instances cannot carry target + headroom, and says how many are needed', () => {
    const r = plan(million);
    // 15k × 8 × 0.85 = 102k per instance; 1.5M × 1.3 = 1.95M → 20 instances
    expect(r.instance.rps).toBe(102_000);
    expect(r.required).toEqual({ rps: 1_950_000, instances: 20 });
    expect(r.verdict).toBe('fail');
    expect(titles(r, 'fail')[0]).toBe('Target 1.5M req/s needs 20 instances; config allows 10');
    expect(r.recommended).toEqual({ workers: 8, instances: { min: 7, max: 20 } });
  });

  it('passes once the autoscaler may reach the required count', () => {
    const r = plan({ ...million, horizontal: { ...million.horizontal, instances: { min: 4, max: 20 } } });
    expect(r.verdict).toBe('ok');
    expect(titles(r, 'ok')).toContain('Target 1.5M req/s fits: 20 of max 20 instances needed');
    expect(titles(r, 'info').some(t => t.includes('the autoscaler must reach 20'))).toBe(true);
  });

  it('explains that one server cannot reach millions', () => {
    const r = plan({ target: { rps: 1_000_000 } });
    expect(r.verdict).toBe('fail');
    expect(titles(r, 'info')).toContain('One server cannot reach this target; horizontal scaling is required');
  });

  it('checks connections per worker and instance memory', () => {
    const r = plan({
      target: { rps: 10_000, concurrentConnections: 2_000_000 },
      vertical: { maxConnectionsPerWorker: 10_000, memoryPerWorkerMb: 512 },
      horizontal: { instances: 10, instanceSize: { cpus: 8, memoryGb: 8 } }
    });
    // 2M / 10 instances / 8 workers = 25k per worker > 10k
    expect(titles(r, 'fail').some(t => t.startsWith('2M connections → 25k per worker'))).toBe(true);
    // 8 × 512 MB + 200k × 48 KB ≈ 13.2 GB > 8 GB × 0.85
    expect(titles(r, 'fail').some(t => t.startsWith('Each instance needs ~13.2 GB'))).toBe(true);
  });

  it('warns when measured p99 exceeds the target', () => {
    const r = plan({ target: { rps: 1000, p99Ms: 20 } }, linux8, 15_000, 45);
    expect(titles(r, 'warn')).toContain('p99 at full load was 45 ms; target is 20 ms');
  });

  it('labels calibrated numbers as a framework ceiling', () => {
    const r = planCapacity({
      scaling: resolveScaling({}, linux8),
      system: linux8,
      measurement: { rpsPerWorker: 20_000, source: 'calibrated', label: '@axiljs/core 0.3.2' }
    });
    expect(titles(r, 'info')).toContain('Based on a hello-world calibration (@axiljs/core 0.3.2)');
  });
});

describe('hostChecks', () => {
  it('flags a container CPU quota smaller than the visible cores', () => {
    const f = hostChecks(resolveScaling({}, linux8), { ...linux8, cgroupCpus: 2 });
    expect(f[0]).toMatchObject({ level: 'warn', area: 'vertical' });
    expect(f[0].fix).toContain('Set vertical.workers to 2');
  });

  it('flags oversubscription, low fd limits and host memory', () => {
    const scaling = resolveScaling({ vertical: { workers: 16, memoryPerWorkerMb: 4096, maxConnectionsPerWorker: 50_000 } }, linux8);
    const f = hostChecks(scaling, { ...linux8, fdLimit: 1024 });
    expect(f.map(x => x.title)).toEqual([
      '16 workers on 8 CPUs: oversubscribed',
      'This machine: 16 workers × 4096 MB = 64.0 GB, more than the 32.0 GB available',
      'Open-file limit is 1k; each worker may need 50k sockets'
    ]);
    expect(f[2].fix).toContain('ulimit -n 65536');
  });
});

describe('fmtNum', () => {
  it('formats rates', () => {
    expect([fmtNum(950), fmtNum(1500), fmtNum(15_000), fmtNum(1_950_000), fmtNum(25_000_000)])
      .toEqual(['950', '1.5k', '15k', '1.95M', '25M']);
  });
});

// ─── histogram ────────────────────────────────────────────────────────────────

describe('summarize', () => {
  it('computes percentiles from 50 µs buckets', () => {
    const h = new Uint32Array(100_000);
    h[19] = 90;   // ~0.98 ms
    h[199] = 9;   // ~9.98 ms
    h[1999] = 1;  // ~100 ms
    const s = summarize(h);
    expect(s.p50).toBeCloseTo(0.98, 2);
    expect(s.p90).toBeCloseTo(0.98, 2);
    expect(s.p99).toBeCloseTo(9.98, 2);
    expect(s.max).toBeCloseTo(99.98, 2);
  });

  it('is all zeros for an empty histogram', () => {
    expect(summarize(new Uint32Array(10))).toEqual({ p50: 0, p90: 0, p99: 0, max: 0, mean: 0 });
  });
});

// ─── readiness ────────────────────────────────────────────────────────────────

describe('scanSource', () => {
  it('finds in-memory state that breaks across processes', () => {
    const src = [
      `app.use(rateLimit({ windowMs: 60000, max: 100 }))`,
      `app.use(rateLimit({ max: 100, store: redisStore }))`,
      `const cron = new Scheduler()`,
      `// const q = new Queue('x')`,
      `const db = await createConnection({ type: 'sqlite', database: 'app.db' })`,
      `const bus = getGlobalEventBus()`
    ].join('\n');
    const f = scanSource('src/main.ts', src);
    expect(f.map(x => [x.component, x.line, x.level])).toEqual([
      ['@axiljs/security rateLimit', 1, 'warn'],
      ['@axiljs/queue Scheduler', 3, 'fail'],
      ['@axiljs/events', 6, 'warn'],
      ['SQLite', 5, 'fail']
    ]);
  });
});

// ─── load generator ───────────────────────────────────────────────────────────

describe('loadTest', () => {
  it('measures a real server', async () => {
    let n = 0;
    const server = createServer((req, res) => {
      n++;
      res.writeHead(n % 10 === 0 ? 500 : 200).end('ok');
    });
    await new Promise<void>(r => server.listen(0, '127.0.0.1', () => r()));
    const { port } = server.address() as AddressInfo;
    try {
      const r = await loadTest({ url: `http://127.0.0.1:${port}/`, durationMs: 600, warmupMs: 100, connections: 8, threads: 2 });
      expect(r.requests).toBeGreaterThan(100);
      expect(r.rps).toBe(Math.round(r.requests / 0.6));
      expect(r.non2xx).toBeGreaterThan(0);
      expect(r.errors).toBe(0);
      expect(r.latency.p99).toBeGreaterThan(0);
      expect(r.latency.p50).toBeLessThanOrEqual(r.latency.p99);
    } finally {
      server.close();
    }
  });

  it('counts refused connections as errors', async () => {
    const r = await loadTest({ url: 'http://127.0.0.1:1/', durationMs: 300, warmupMs: 0, connections: 2, threads: 1 });
    expect(r.requests).toBe(0);
    expect(r.errors).toBeGreaterThan(0);
  });
});

describe('calibrate', () => {
  it('measures one @axiljs/core worker', async () => {
    const r = await calibrate({ coreEntry: require.resolve('@axiljs/core'), durationMs: 800, warmupMs: 200, connections: 16 });
    expect(r.server).toMatch(/^@axiljs\/core \d+\.\d+\.\d+$/);
    expect(r.rpsPerWorker).toBeGreaterThan(500);
    expect(r.result.non2xx).toBe(0);
  }, 20_000);
});

// ─── serve (single process) ───────────────────────────────────────────────────

describe('serve', () => {
  it('runs one worker in-process, applies connection limits and drains', async () => {
    const { Application } = await import('@axiljs/core');
    const app = new Application({ logging: false, env: 'test' });
    app.get('/', (_req, res) => res.success({ ok: true }));

    const handle = await serve(() => app, {
      port: 0,
      host: '127.0.0.1',
      scaling: { vertical: { workers: 1, maxConnectionsPerWorker: 321, keepAliveTimeoutMs: 65_000 } },
      checkOnStart: false
    });
    const server = app.getServer()!;
    try {
      expect(handle.role).toBe('single');
      expect(server.maxConnections).toBe(321);
      expect(server.keepAliveTimeout).toBe(65_000);
      expect(server.headersTimeout).toBeGreaterThan(65_000);
      const { port } = server.address() as AddressInfo;
      const res = await fetch(`http://127.0.0.1:${port}/`);
      expect(res.status).toBe(200);
    } finally {
      process.removeAllListeners('SIGTERM');
      process.removeAllListeners('SIGINT');
      await handle.shutdown();
    }
    expect(server.listening).toBe(false);
  });
});
