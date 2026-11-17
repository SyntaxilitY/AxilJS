import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Queue } from '../src/queue';
import { createJob, Job } from '../src/job';
import { FileQueueStore } from '../src/file-store';

let dir: string;
let file: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'axil-queue-'));
  file = path.join(dir, 'jobs.db');
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const journalLines = (): string[] =>
  fs.readFileSync(file + '.journal', 'utf8').split('\n').filter(l => l !== '');

describe('FileQueueStore', () => {
  it('persists jobs and reloads them with Dates rehydrated', () => {
    const s1 = new FileQueueStore({ path: file });
    const job = createJob('q', 'email', { to: 'a@b.c', n: [1, 2] }, { maxAttempts: 5, timeoutMs: 1000 });
    s1.add(job);
    job.status = 'completed';
    job.attempts = 1;
    job.result = { ok: true };
    job.finishedAt = new Date();
    s1.update(job);
    const gone = createJob('q', 'gone', null);
    s1.add(gone);
    s1.remove(gone.id);
    // No close(): simulate a crash, state must come from the journal
    expect(journalLines()).toHaveLength(4);

    const s2 = new FileQueueStore({ path: file });
    const loaded = s2.get(job.id)!;
    expect(s2.list()).toHaveLength(1);
    expect(s2.get(gone.id)).toBeUndefined();
    expect(loaded).toMatchObject({
      id: job.id, queue: 'q', name: 'email', data: { to: 'a@b.c', n: [1, 2] },
      status: 'completed', attempts: 1, maxAttempts: 5, timeoutMs: 1000, result: { ok: true }
    });
    expect(loaded.createdAt).toBeInstanceOf(Date);
    expect(loaded.runAt).toBeInstanceOf(Date);
    expect(loaded.finishedAt).toBeInstanceOf(Date);
    expect(loaded.createdAt.getTime()).toBe(job.createdAt.getTime());
    expect(loaded.runAt.getTime()).toBe(job.runAt.getTime());
    expect(loaded.startedAt).toBeUndefined();
    s2.close();
  });

  it('keeps priority order (FIFO within a priority) across reloads', () => {
    const s1 = new FileQueueStore({ path: file });
    for (const [name, priority] of [['low1', 0], ['high', 10], ['low2', 0], ['mid', 5], ['high2', 10]] as const) {
      s1.add(createJob('q', name, null, { priority }));
    }
    const expected = ['high', 'high2', 'mid', 'low1', 'low2'];
    expect(s1.list().map(j => j.name)).toEqual(expected);

    // Reload from journal only
    const s2 = new FileQueueStore({ path: file });
    expect(s2.list().map(j => j.name)).toEqual(expected);
    s2.close();

    // Reload from snapshot only
    const s3 = new FileQueueStore({ path: file });
    expect(s3.list().map(j => j.name)).toEqual(expected);
    s3.add(createJob('q', 'mid2', null, { priority: 5 }));
    expect(s3.list().map(j => j.name)).toEqual(['high', 'high2', 'mid', 'mid2', 'low1', 'low2']);
    s3.close();
  });

  it('returns active jobs to pending after a crash, keeping attempts', () => {
    const s1 = new FileQueueStore({ path: file });
    const job = createJob('q', 'work', { x: 1 });
    s1.add(job);
    job.status = 'active';
    job.attempts = 2;
    job.startedAt = new Date();
    s1.update(job);
    const done = createJob('q', 'done', null);
    s1.add(done);
    done.status = 'completed';
    s1.update(done);
    // crash: no close()

    const s2 = new FileQueueStore({ path: file });
    expect(s2.get(job.id)).toMatchObject({ status: 'pending', attempts: 2 });
    expect(s2.get(job.id)!.startedAt).toBeUndefined();
    expect(s2.get(done.id)!.status).toBe('completed');
    s2.close();

    // The recovery itself is persisted
    const s3 = new FileQueueStore({ path: file });
    expect(s3.get(job.id)).toMatchObject({ status: 'pending', attempts: 2 });
    s3.close();
  });

  it('ignores a truncated last journal line but rejects mid-file corruption', () => {
    const s1 = new FileQueueStore({ path: file });
    const a = createJob('q', 'a', null);
    const b = createJob('q', 'b', null);
    s1.add(a);
    s1.add(b);
    // Simulate a crash mid-append
    fs.appendFileSync(file + '.journal', '{"op":"put","job":{"id":"half');

    const s2 = new FileQueueStore({ path: file });
    expect(s2.list().map(j => j.name)).toEqual(['a', 'b']);
    s2.close();

    fs.writeFileSync(file + '.journal', '{"op":"del"\n' + JSON.stringify({ op: 'del', id: a.id }) + '\n');
    expect(() => new FileQueueStore({ path: file })).toThrow(/corrupt at line 1/);
  });

  it('compacts into an atomic snapshot every compactEvery entries and on close', () => {
    const s1 = new FileQueueStore({ path: file, compactEvery: 3 });
    expect(fs.existsSync(file)).toBe(true);
    expect(journalLines()).toHaveLength(0);

    const jobs: Job[] = [];
    for (let i = 0; i < 4; i++) {
      const j = createJob('q', 'j' + i, i);
      jobs.push(j);
      s1.add(j);
    }
    // 3 entries triggered a compaction, the 4th is in the journal
    expect(journalLines()).toHaveLength(1);
    const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(snapshot.version).toBe(1);
    expect(snapshot.jobs.map((j: Job) => j.name)).toEqual(['j0', 'j1', 'j2']);
    expect(fs.existsSync(file + '.tmp')).toBe(false);

    s1.remove(jobs[0].id);
    s1.close();
    expect(journalLines()).toHaveLength(0);
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).jobs.map((j: Job) => j.name)).toEqual(['j1', 'j2', 'j3']);
    expect(() => s1.add(createJob('q', 'late', null))).toThrow(/closed/);
    s1.close(); // idempotent

    const s2 = new FileQueueStore({ path: file });
    expect(s2.list().map(j => j.data)).toEqual([1, 2, 3]);
    s2.close();
  });

  it('replays a journal left behind by a crash during compaction', () => {
    const s1 = new FileQueueStore({ path: file, compactEvery: 0 });
    const a = createJob('q', 'a', null);
    s1.add(a);
    a.status = 'completed';
    s1.update(a);
    const journal = fs.readFileSync(file + '.journal', 'utf8');
    s1.close();
    // Snapshot was renamed into place but the journal was not emptied
    fs.writeFileSync(file + '.journal', journal);

    const s2 = new FileQueueStore({ path: file });
    expect(s2.list()).toHaveLength(1);
    expect(s2.get(a.id)!.status).toBe('completed');
    s2.close();
  });

  it('drops a non-serializable result instead of failing the update', () => {
    const s1 = new FileQueueStore({ path: file });
    const job = createJob('q', 'j', null);
    s1.add(job);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    job.status = 'completed';
    job.result = circular;
    expect(() => s1.update(job)).not.toThrow();

    const s2 = new FileQueueStore({ path: file });
    expect(s2.get(job.id)!.status).toBe('completed');
    expect(s2.get(job.id)!.result).toBeUndefined();
    s2.close();
  });

  it('requires a path and creates missing directories', () => {
    expect(() => new FileQueueStore({ path: '' })).toThrow(/path/);
    const nested = path.join(dir, 'a', 'b', 'jobs.db');
    new FileQueueStore({ path: nested }).close();
    expect(fs.existsSync(nested)).toBe(true);
  });
});

describe('Queue with FileQueueStore', () => {
  const queues: Queue[] = [];

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    for (const q of queues.splice(0)) {
      const p = q.stop();
      await vi.advanceTimersByTimeAsync(10000);
      await p;
    }
    vi.useRealTimers();
  });

  function makeQueue(store: FileQueueStore): Queue {
    const q = new Queue('durable', { store, pollIntervalMs: 10, backoff: { type: 'fixed', delay: 100 }, logger: false });
    queues.push(q);
    return q;
  }

  it('a job added by one instance is processed by a new instance', async () => {
    const store1 = new FileQueueStore({ path: file });
    const q1 = makeQueue(store1);
    const added = await q1.add('double', { x: 21 }, { priority: 1 });
    await q1.add('double', { x: 1 });
    // q1 never started; the process "restarts"
    store1.close();

    const store2 = new FileQueueStore({ path: file });
    const q2 = makeQueue(store2);
    const results: unknown[] = [];
    q2.on('completed', (_job, result) => { results.push(result); });
    q2.process<{ x: number }>('double', async (job) => job.data.x * 2);
    q2.start();
    await vi.advanceTimersByTimeAsync(50);

    expect(results).toEqual([42, 2]);
    expect(q2.getJob(added.id)).toMatchObject({ status: 'completed', result: 42, attempts: 1 });
    await q2.stop();
    store2.close();

    const store3 = new FileQueueStore({ path: file });
    expect(store3.list().every(j => j.status === 'completed')).toBe(true);
    store3.close();
  });

  it('retries a job that was active when the process crashed', async () => {
    const store1 = new FileQueueStore({ path: file });
    const q1 = makeQueue(store1);
    q1.process('slow', () => new Promise(() => {})); // never settles: simulates a crash mid-job
    q1.start();
    const job = await q1.add('slow', 'payload', { maxAttempts: 3 });
    await vi.advanceTimersByTimeAsync(20);
    expect(job.status).toBe('active');
    // Crash: no stop(), no close(); abandon q1 and its store
    queues.splice(queues.indexOf(q1), 1);
    const dead = q1 as unknown as { running: boolean; pollTimer?: ReturnType<typeof setInterval> };
    dead.running = false;
    clearInterval(dead.pollTimer);

    const store2 = new FileQueueStore({ path: file });
    expect(store2.get(job.id)).toMatchObject({ status: 'pending', attempts: 1 });
    const q2 = makeQueue(store2);
    const seen: number[] = [];
    q2.process('slow', async (j) => { seen.push(j.attempts); return 'done'; });
    q2.start();
    await vi.advanceTimersByTimeAsync(20);
    expect(seen).toEqual([2]);
    expect(q2.getJob(job.id)).toMatchObject({ status: 'completed', result: 'done', attempts: 2 });
  });
});
