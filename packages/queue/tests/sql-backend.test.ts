import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createConnection, ConnectionManager } from '../../orm/src';
import { Queue, QueueOptions } from '../src/queue';
import { Job, createJob } from '../src/job';
import { QueueBackend, InMemoryQueueBackend, STALLED_MESSAGE } from '../src/backend';
import { SqlQueueBackend, SqlExecutor, SqlDialect } from '../src/sql-backend';

const PG_URL = process.env.AXIL_TEST_PG_URL;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function waitFor(cond: () => boolean | Promise<boolean>, timeoutMs = 10000): Promise<void> {
  const start = Date.now();
  while (!(await cond())) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor: timed out');
    await sleep(5);
  }
}

// The README recipe: an @axiljs/orm connection as a SqlExecutor
function executorFrom(conn: ConnectionManager, dialect: SqlDialect): SqlExecutor {
  const driver = conn.getDriver();
  return {
    dialect,
    query: (sql, params) => driver.query(sql, params),
    transaction: (fn) => driver.transaction((trx) => fn(trx))
  };
}

let tableSeq = 0;
const uniqueTable = () => `axq_${process.pid}_${Date.now() % 100000}_${++tableSeq}`;

/**
 * A "server": something that hands out a backend bound to a shared table.
 * `backend(table, server)` returns the backend server #server uses.
 */
interface Env {
  backend(table: string, server: number): QueueBackend;
}

let queues: Queue[] = [];

function makeQueue(backend: QueueBackend, opts: QueueOptions = {}): Queue {
  const q = new Queue('jobs', {
    backend,
    pollIntervalMs: 10,
    backoff: { type: 'fixed', delay: 50 },
    logger: false,
    ...opts
  });
  queues.push(q);
  return q;
}

afterEach(async () => {
  await Promise.all(queues.map(q => q.stop()));
  queues = [];
});

// ─── Shared behaviour suite (runs on every backend) ───────────────────────────

function backendSuite(name: string, getEnv: () => Env) {
  describe(`Queue with ${name}`, () => {
    let table: string;
    let env: Env;
    const server = (n: number) => env.backend(table, n);

    beforeAll(() => { env = getEnv(); });
    afterEach(() => { table = ''; });
    const fresh = () => { table = uniqueTable(); };

    it('two servers on one table process every job exactly once', async () => {
      fresh();
      const seen = new Map<number, string[]>();
      const handler = (worker: string) => async (job: Job<{ n: number }>) => {
        const list = seen.get(job.data.n) ?? [];
        list.push(worker);
        seen.set(job.data.n, list);
        await sleep(Math.random() * 4);
        return job.data.n;
      };
      const a = makeQueue(server(1), { concurrency: 5, workerId: 'A' });
      const b = makeQueue(server(2), { concurrency: 5, workerId: 'B' });
      a.process('work', handler('A'));
      b.process('work', handler('B'));

      const total = 100;
      await a.addMany('work', Array.from({ length: total }, (_, n) => ({ n })));
      a.start();
      b.start();

      await waitFor(async () => (await a.getStatsAsync()).completed === total, 30000);

      expect(seen.size).toBe(total);
      for (const [, workers] of seen) expect(workers).toHaveLength(1);
      const byA = [...seen.values()].filter(w => w[0] === 'A').length;
      expect(byA).toBeGreaterThan(0);
      expect(byA).toBeLessThan(total);

      const stats = await b.getStatsAsync();
      expect(stats).toEqual({ pending: 0, active: 0, completed: total, failed: 0, delayed: 0, cancelled: 0 });
      const done = await a.getJobsAsync('completed');
      expect(done.every(j => j.attempts === 1 && j.result === (j.data as { n: number }).n)).toBe(true);
    }, 40000);

    it('claims by priority, FIFO within a priority', async () => {
      fresh();
      const q = makeQueue(server(1), { concurrency: 1 });
      const order: string[] = [];
      q.process('p', async (job: Job<string>) => { order.push(job.data); });
      await q.add('p', 'low-1', { priority: 1 });
      await q.add('p', 'high', { priority: 10 });
      await q.add('p', 'low-2', { priority: 1 });
      await q.add('p', 'mid', { priority: 5 });
      await q.add('p', 'low-3', { priority: 1 });
      q.start();
      await waitFor(() => order.length === 5);
      expect(order).toEqual(['high', 'mid', 'low-1', 'low-2', 'low-3']);
    });

    it('holds delayed jobs until runAt', async () => {
      fresh();
      const q = makeQueue(server(1));
      const ran: { data: string; at: number }[] = [];
      q.process('d', async (job: Job<string>) => { ran.push({ data: job.data, at: Date.now() }); });
      const delayed = await q.add('d', 'later', { delay: 200 });
      const at = await q.add('d', 'at', { runAt: new Date(Date.now() + 100) });
      await q.add('d', 'now');
      expect((await q.getJobAsync(delayed.id))!.status).toBe('delayed');
      q.start();
      await waitFor(() => ran.length === 3);
      expect(ran.map(r => r.data)).toEqual(['now', 'at', 'later']);
      expect(ran[1].at).toBeGreaterThanOrEqual(at.runAt.getTime());
      expect(ran[2].at).toBeGreaterThanOrEqual(delayed.runAt.getTime());
    });

    it('retries with backoff and keeps the attempt count', async () => {
      fresh();
      const q = makeQueue(server(1));
      const times: number[] = [];
      const retries: string[] = [];
      q.on('retry', (_job: Job, err: Error) => retries.push(err.message));
      q.process('flaky', async () => {
        times.push(Date.now());
        if (times.length < 3) throw new Error(`boom ${times.length}`);
        return 'ok';
      });
      const job = await q.add('flaky', { x: 1 }, { maxAttempts: 5 });
      q.start();
      await waitFor(async () => (await q.getJobAsync(job.id))!.status === 'completed');
      const done = (await q.getJobAsync(job.id))!;
      expect(done.attempts).toBe(3);
      expect(done.result).toBe('ok');
      expect(done.error).toBe('boom 2'); // same as the in-memory queue: last error kept
      expect(retries).toEqual(['boom 1', 'boom 2']);
      expect(times[1] - times[0]).toBeGreaterThanOrEqual(45);
      expect(times[2] - times[1]).toBeGreaterThanOrEqual(45);
    });

    it('fails after maxAttempts and emits failed once', async () => {
      fresh();
      const q = makeQueue(server(1), { backoff: { type: 'fixed', delay: 5 } });
      const failed: Job[] = [];
      q.on('failed', (job: Job) => failed.push(job));
      let calls = 0;
      q.process('bad', async () => { calls++; throw new Error('nope'); });
      const job = await q.add('bad', null, { maxAttempts: 3 });
      q.start();
      await waitFor(() => failed.length === 1);
      await sleep(50);
      const final = (await q.getJobAsync(job.id))!;
      expect(calls).toBe(3);
      expect(failed).toHaveLength(1);
      expect(final).toMatchObject({ status: 'failed', attempts: 3, error: 'nope' });
      expect(final.stack).toContain('nope');
      expect(final.finishedAt).toBeInstanceOf(Date);
    });

    it('times out an attempt with JobTimeoutError', async () => {
      fresh();
      const q = makeQueue(server(1));
      let aborted = false;
      q.process('slow', (_job, ctx) => new Promise(resolve => {
        ctx!.signal.addEventListener('abort', () => { aborted = true; resolve(undefined); });
      }));
      const job = await q.add('slow', null, { maxAttempts: 1, timeoutMs: 30 });
      q.start();
      await waitFor(async () => (await q.getJobAsync(job.id))!.status === 'failed');
      expect((await q.getJobAsync(job.id))!.error).toMatch(/timed out after 30ms/);
      expect(aborted).toBe(true);
    });

    it('recovers jobs abandoned by a crashed worker (attempt count kept)', async () => {
      fresh();
      const backend = server(1);
      const old = new Date(Date.now() - 60000);
      const lost = createJob('jobs', 'r', 'lost', { maxAttempts: 3 });
      const exhausted = createJob('jobs', 'r', 'exhausted', { maxAttempts: 1 });
      await backend.enqueue(lost);
      await backend.enqueue(exhausted);
      // A worker claims both, then dies: its last lock renewal was a minute ago
      expect(await backend.claim('jobs', 'dead-worker', 10, new Date())).toHaveLength(2);
      expect(await backend.heartbeat('dead-worker', [lost.id, exhausted.id], old)).toHaveLength(2);

      const q = makeQueue(server(2), { visibilityTimeoutMs: 1000 });
      const ran: string[] = [];
      q.process('r', async (job: Job<string>) => { ran.push(job.data); });
      q.start();
      await waitFor(async () => (await q.getJobAsync(lost.id))!.status === 'completed');

      expect(ran).toEqual(['lost']);
      expect((await q.getJobAsync(lost.id))!.attempts).toBe(2);
      expect(await q.getJobAsync(exhausted.id)).toMatchObject({ status: 'failed', attempts: 1, error: STALLED_MESSAGE });
    });

    it('renews the lock of long jobs so they are not recovered while running', async () => {
      fresh();
      const runs: string[] = [];
      const slow = (w: string) => async () => { runs.push(w); await sleep(300); };
      const a = makeQueue(server(1), { visibilityTimeoutMs: 80, workerId: 'A' });
      const b = makeQueue(server(2), { visibilityTimeoutMs: 80, workerId: 'B' });
      a.process('long', slow('A'));
      b.process('long', slow('B'));
      const job = await a.add('long', null);
      a.start();
      await waitFor(() => runs.length === 1);
      b.start();
      await waitFor(async () => (await a.getJobAsync(job.id))!.status === 'completed');
      expect(runs).toEqual(['A']);
      expect((await a.getJobAsync(job.id))!.attempts).toBe(1);
    });

    it('cancels a job running on another server', async () => {
      fresh();
      const a = makeQueue(server(1), { workerId: 'A' });
      const b = makeQueue(server(2), { workerId: 'B' });
      let aborted = false;
      const completed: Job[] = [];
      a.on('completed', (job: Job) => completed.push(job));
      a.process('c', (_job, ctx) => new Promise(resolve => {
        ctx!.signal.addEventListener('abort', () => { aborted = true; resolve('late'); });
      }));
      const job = await a.add('c', null);
      a.start();
      await waitFor(async () => (await a.getJobAsync(job.id))!.status === 'active');

      const cancelled: Job[] = [];
      b.on('cancelled', (j: Job) => cancelled.push(j));
      expect(await b.cancelAsync(job.id)).toBe(true);
      expect(cancelled.map(j => j.id)).toEqual([job.id]);
      await waitFor(() => aborted);
      await sleep(30);
      expect((await a.getJobAsync(job.id))!.status).toBe('cancelled');
      expect(completed).toHaveLength(0);
      expect(await b.cancelAsync(job.id)).toBe(false);
    });

    it('cancels pending jobs and purges finished ones', async () => {
      fresh();
      const q = makeQueue(server(1));
      q.process('x', async () => 1);
      const keep = await q.add('x', null, { delay: 60000 });
      const drop = await q.add('x', null, { delay: 60000 });
      const done = await q.add('x', null);
      q.start();
      await waitFor(async () => (await q.getJobAsync(done.id))!.status === 'completed');
      expect(await q.cancelAsync(drop.id)).toBe(true);
      expect(await q.getStatsAsync()).toMatchObject({ delayed: 1, completed: 1, cancelled: 1 });
      await q.purgeAsync();
      expect((await q.getJobsAsync()).map(j => j.id)).toEqual([keep.id]);
    });

    it('fails jobs without a handler, like the in-memory queue', async () => {
      fresh();
      const q = makeQueue(server(1));
      const failed: Job[] = [];
      q.on('failed', (job: Job) => failed.push(job));
      const job = await q.add('unknown', null);
      q.start();
      await waitFor(() => failed.length === 1);
      expect(await q.getJobAsync(job.id)).toMatchObject({
        status: 'failed', attempts: 0, error: "No handler registered for job 'unknown'"
      });
    });

    it('round-trips job data, results and options', async () => {
      fresh();
      const q = makeQueue(server(1));
      q.process('echo', async (job) => ({ got: job.data }));
      const data = { s: 'x', n: 1.5, arr: [1, null, 'z'], nested: { ok: true } };
      const job = await q.add('echo', data, { priority: 2.5, timeoutMs: 5000, maxAttempts: 7 });
      q.start();
      await waitFor(async () => (await q.getJobAsync(job.id))!.status === 'completed');
      const stored = (await q.getJobAsync(job.id))!;
      expect(stored).toMatchObject({
        id: job.id, queue: 'jobs', name: 'echo', data, priority: 2.5, timeoutMs: 5000,
        maxAttempts: 7, attempts: 1, result: { got: data }
      });
      expect(stored.createdAt.getTime()).toBe(job.createdAt.getTime());
      expect(stored.startedAt).toBeInstanceOf(Date);
      expect(await q.getJobAsync('missing')).toBeUndefined();
    });

    it('rejects the sync query API with a pointer to the async one', () => {
      fresh();
      const q = makeQueue(server(1));
      expect(() => q.getJobs()).toThrow(/getJobsAsync/);
      expect(() => q.getStats()).toThrow(/getStatsAsync/);
      expect(() => q.cancel('x')).toThrow(/cancelAsync/);
      expect(() => q.purge()).toThrow(/purgeAsync/);
      expect(() => q.getJob('x')).toThrow(/getJobAsync/);
    });

    it('never hands one job to two concurrent claimers', async () => {
      fresh();
      const b1 = server(1);
      const b2 = server(2);
      const total = 200;
      for (let i = 0; i < total; i++) await b1.enqueue(createJob('jobs', 'z', i));
      const claimed: string[] = [];
      const loop = async (backend: QueueBackend, w: string) => {
        for (;;) {
          const jobs = await backend.claim('jobs', w, 3, new Date());
          if (jobs.length === 0) return;
          claimed.push(...jobs.map(j => j.id));
        }
      };
      await Promise.all([
        ...Array.from({ length: 8 }, (_, i) => loop(b1, `a${i}`)),
        ...Array.from({ length: 8 }, (_, i) => loop(b2, `b${i}`))
      ]);
      expect(claimed).toHaveLength(total);
      expect(new Set(claimed).size).toBe(total);
    }, 30000);
  });
}

// ─── Backends ─────────────────────────────────────────────────────────────────

describe('InMemoryQueueBackend', () => {
  const shared = new Map<string, InMemoryQueueBackend>();
  backendSuite('InMemoryQueueBackend', () => ({
    backend(table) {
      if (!shared.has(table)) shared.set(table, new InMemoryQueueBackend());
      return shared.get(table)!;
    }
  }));
});

describe('SqlQueueBackend (SQLite in memory)', () => {
  let conn: ConnectionManager;
  beforeAll(async () => {
    conn = await createConnection({ driver: 'sqlite', filename: ':memory:', logging: false }, `queue-sqlite-${process.pid}`);
  });
  afterAll(async () => { await conn.disconnect(); });

  // Both "servers" share the single in-memory database (separate backend objects)
  backendSuite('SqlQueueBackend/sqlite', () => ({
    backend: (table) => new SqlQueueBackend({ executor: executorFrom(conn, 'sqlite'), table })
  }));

  it('validates the table name and dialect', () => {
    const executor = executorFrom(conn, 'sqlite');
    expect(() => new SqlQueueBackend({ executor, table: 'jobs; DROP TABLE x' })).toThrow(/invalid table name/);
    expect(() => new SqlQueueBackend({ executor, table: '1jobs' })).toThrow(/invalid table name/);
    expect(new SqlQueueBackend({ executor, table: 'main.jobs_1' }).table).toBe('main.jobs_1');
    expect(new SqlQueueBackend({ executor }).table).toBe('axil_jobs');
    expect(() => new SqlQueueBackend({ executor: { ...executor, dialect: 'oracle' as SqlDialect } })).toThrow(/dialect/);
  });

  it('creates the schema once and only when first used', async () => {
    const seen: string[] = [];
    const base = executorFrom(conn, 'sqlite');
    const backend = new SqlQueueBackend({
      table: uniqueTable(),
      executor: { ...base, query: (sql, params) => { seen.push(sql); return base.query(sql, params); } }
    });
    expect(seen).toHaveLength(0);
    await Promise.all([backend.list(), backend.list(), backend.counts('q')]);
    expect(seen.filter(s => s.startsWith('CREATE TABLE'))).toHaveLength(1);
    expect(seen.filter(s => s.startsWith('CREATE INDEX'))).toHaveLength(2);
  });

  it('routes its queries around @axiljs/runtime intent reporting', async () => {
    const key = Symbol.for('axiljs.intent.unreported');
    const g = globalThis as any;
    const previous = g[key];
    let wrapped = 0;
    g[key] = (fn: () => unknown) => { wrapped++; return fn(); };
    try {
      const backend = new SqlQueueBackend({ executor: executorFrom(conn, 'sqlite'), table: uniqueTable() });
      await backend.enqueue(createJob('q', 'n', null));
      expect(wrapped).toBe(4); // 3 schema statements + INSERT
    } finally {
      g[key] = previous;
    }
  });
});

describe.skipIf(!PG_URL)('SqlQueueBackend (PostgreSQL)', () => {
  // One connection pool per simulated server
  const conns: ConnectionManager[] = [];
  const tables = new Set<string>();

  beforeAll(async () => {
    for (const n of [1, 2]) {
      conns.push(await createConnection(
        { driver: 'postgres', url: PG_URL, logging: false, pool: { max: 8 } },
        `queue-pg-${process.pid}-${n}`
      ));
    }
  });

  afterAll(async () => {
    for (const t of tables) await conns[0].getDriver().query(`DROP TABLE IF EXISTS ${t}`);
    for (const c of conns) await c.disconnect();
  });

  backendSuite('SqlQueueBackend/postgres', () => ({
    backend(table, server) {
      tables.add(table);
      return new SqlQueueBackend({ executor: executorFrom(conns[(server - 1) % 2], 'postgres'), table });
    }
  }));

  it('creates the table concurrently from two servers', async () => {
    const table = uniqueTable();
    tables.add(table);
    const a = new SqlQueueBackend({ executor: executorFrom(conns[0], 'postgres'), table });
    const b = new SqlQueueBackend({ executor: executorFrom(conns[1], 'postgres'), table });
    await Promise.all([a.init(), b.init()]);
    await a.enqueue(createJob('q', 'n', 1));
    expect(await b.counts('q')).toMatchObject({ pending: 1 });
  });
});

// ─── The default store path is untouched ──────────────────────────────────────

describe('Queue without a backend', () => {
  it('keeps the synchronous store API; the async variants delegate to it', async () => {
    const q = new Queue('mem', { pollIntervalMs: 5, logger: false });
    queues.push(q);
    q.process('n', async (job: Job<number>) => job.data * 2);
    const job = await q.add('n', 21);
    expect(q.getJob(job.id)).toBe(job);
    q.start();
    await waitFor(() => job.status === 'completed');
    expect(job.result).toBe(42);
    expect(await q.getJobAsync(job.id)).toBe(job);
    expect(await q.getJobsAsync('completed')).toEqual(q.getJobs('completed'));
    expect(await q.getStatsAsync()).toEqual(q.getStats());
    await q.purgeAsync();
    expect(q.getJobs()).toHaveLength(0);
    expect(await q.cancelAsync(job.id)).toBe(false);
  });

  it('rejects store and backend together', () => {
    expect(() => new Queue('x', { store: {} as never, backend: new InMemoryQueueBackend() })).toThrow(/either/);
  });
});
