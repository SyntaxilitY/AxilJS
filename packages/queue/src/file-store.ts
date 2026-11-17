/**
 * Durable, file-backed QueueStore.
 *
 * Layout (for `path: 'data/jobs.db'`):
 *   data/jobs.db          snapshot: JSON `{ version: 1, jobs: [...] }` in queue order
 *   data/jobs.db.journal  append-only JSON lines: `{"op":"put","job":{...}}` / `{"op":"del","id":"..."}`
 *   data/jobs.db.tmp      transient; the next snapshot before it is renamed into place
 *
 * Every mutation is appended to the journal synchronously. Every `compactEvery`
 * journal entries (and on open/close) the full state is written to the temp
 * file and atomically renamed over the snapshot, then the journal is emptied.
 *
 * Durability: writes use plain writeFileSync/appendFileSync without fsync. Data
 * survives a process crash (the OS still holds the written pages), but not a
 * power loss or kernel crash, where the most recent writes may be lost.
 *
 * Recovery: on open, jobs that were 'active' when the process died are reset
 * to 'pending' (attempt count kept) so the queue retries them. A truncated
 * last journal line (crash mid-append) is ignored.
 *
 * One store per file per process: two live stores on the same path would
 * overwrite each other's snapshots.
 */

import * as fs from 'node:fs';
import * as nodePath from 'node:path';
import { Job } from './job';
import { QueueStore } from './store';

export interface FileQueueStoreOptions {
  // Snapshot file path. The journal is `${path}.journal`.
  path: string;

  // Compact after this many journal entries (default: 1000). 0 disables
  // automatic compaction (it still happens on open and close()).
  compactEvery?: number;
}

type JournalEntry =
  | { op: 'put'; job: Record<string, unknown> }
  | { op: 'del'; id: string };

const DATE_FIELDS = ['createdAt', 'startedAt', 'finishedAt', 'runAt'] as const;

export class FileQueueStore implements QueueStore {
  readonly path: string;
  readonly journalPath: string;
  private readonly tmpPath: string;
  private readonly compactEvery: number;
  private jobs: Job[] = [];
  private journalEntries = 0;
  private closed = false;

  constructor(options: FileQueueStoreOptions) {
    if (!options || typeof options.path !== 'string' || options.path === '') {
      throw new Error('FileQueueStore: options.path is required');
    }
    this.path = nodePath.resolve(options.path);
    this.journalPath = this.path + '.journal';
    this.tmpPath = this.path + '.tmp';
    this.compactEvery = Math.max(0, Math.floor(options.compactEvery ?? 1000));

    fs.mkdirSync(nodePath.dirname(this.path), { recursive: true });
    this.load();
    // Persist the recovered state and start from an empty journal
    this.compact();
  }

  // ─── QueueStore ─────────────────────────────────────────────────────────────

  add(job: Job): void {
    this.assertOpen();
    const line = this.serializePut(job);
    this.insert(job);
    this.append(line);
  }

  get(id: string): Job | undefined {
    return this.jobs.find(j => j.id === id);
  }

  update(job: Job): void {
    this.assertOpen();
    const index = this.jobs.findIndex(j => j.id === job.id);
    if (index === -1) return;
    const line = this.serializePut(job);
    this.jobs[index] = job;
    this.append(line);
  }

  list(): Job[] {
    return [...this.jobs];
  }

  remove(id: string): void {
    this.assertOpen();
    const index = this.jobs.findIndex(j => j.id === id);
    if (index === -1) return;
    this.jobs.splice(index, 1);
    this.append(JSON.stringify({ op: 'del', id }));
  }

  // ─── Maintenance ────────────────────────────────────────────────────────────

  /**
   * Write the current state to a new snapshot (temp file + atomic rename)
   * and empty the journal.
   */
  compact(): void {
    this.assertOpen();
    const snapshot = JSON.stringify({
      version: 1,
      jobs: this.jobs.map(j => this.toPlain(j))
    });
    fs.writeFileSync(this.tmpPath, snapshot);
    fs.renameSync(this.tmpPath, this.path);
    // A crash before this line just replays an already-applied journal on
    // the next open; put/del entries are idempotent.
    fs.writeFileSync(this.journalPath, '');
    this.journalEntries = 0;
  }

  /**
   * Compact and stop accepting writes. Stop the Queue (await queue.stop())
   * before closing its store. Idempotent.
   */
  close(): void {
    if (this.closed) return;
    this.compact();
    this.closed = true;
  }

  // ─── Internals ──────────────────────────────────────────────────────────────

  // Same ordering as InMemoryQueueStore: priority desc, FIFO within a priority
  private insert(job: Job): void {
    const insertAt = this.jobs.findIndex(j => j.priority < job.priority);
    if (insertAt === -1) {
      this.jobs.push(job);
    } else {
      this.jobs.splice(insertAt, 0, job);
    }
  }

  private append(line: string): void {
    fs.appendFileSync(this.journalPath, line + '\n');
    this.journalEntries++;
    if (this.compactEvery > 0 && this.journalEntries >= this.compactEvery) {
      this.compact();
    }
  }

  private assertOpen(): void {
    if (this.closed) throw new Error(`FileQueueStore(${this.path}) is closed`);
  }

  /**
   * Serialize before mutating memory so a non-serializable job leaves the
   * store unchanged. A non-JSON handler result is dropped rather than failing
   * the update (the job's status must still be persisted).
   */
  private serializePut(job: Job): string {
    try {
      return JSON.stringify({ op: 'put', job: this.toPlain(job) });
    } catch (err) {
      if (job.result === undefined) throw err;
      return JSON.stringify({ op: 'put', job: this.toPlain({ ...job, result: undefined }) });
    }
  }

  private toPlain(job: Job): Record<string, unknown> {
    // JSON.stringify turns Dates into ISO strings; undefined fields are omitted
    return { ...job } as Record<string, unknown>;
  }

  private load(): void {
    this.jobs = [];

    // The snapshot is already in queue order
    if (fs.existsSync(this.path)) {
      const text = fs.readFileSync(this.path, 'utf8');
      if (text.trim() !== '') {
        let parsed: { version?: number; jobs?: unknown };
        try {
          parsed = JSON.parse(text);
        } catch (err) {
          throw new Error(`FileQueueStore: snapshot ${this.path} is corrupt: ${(err as Error).message}`);
        }
        if (!parsed || !Array.isArray(parsed.jobs)) {
          throw new Error(`FileQueueStore: snapshot ${this.path} has no jobs array`);
        }
        this.jobs = parsed.jobs.map(raw => this.rehydrate(raw as Record<string, unknown>));
      }
    }

    // Replay the journal on top of the snapshot. Puts of known jobs update in
    // place (keeping position), so the order matches the live store's order.
    if (fs.existsSync(this.journalPath)) {
      const lines = fs.readFileSync(this.journalPath, 'utf8').split('\n');
      // Drop the trailing empty element produced by the final newline
      while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();

      lines.forEach((line, i) => {
        if (line.trim() === '') return;
        let entry: JournalEntry;
        try {
          entry = JSON.parse(line);
        } catch (err) {
          // A crash mid-append can leave a partial last line: ignore it
          if (i === lines.length - 1) return;
          throw new Error(
            `FileQueueStore: journal ${this.journalPath} is corrupt at line ${i + 1}: ${(err as Error).message}`
          );
        }
        if (entry.op === 'put' && entry.job) {
          const job = this.rehydrate(entry.job);
          const index = this.jobs.findIndex(j => j.id === job.id);
          if (index === -1) this.insert(job);
          else this.jobs[index] = job;
        } else if (entry.op === 'del') {
          const index = this.jobs.findIndex(j => j.id === entry.id);
          if (index !== -1) this.jobs.splice(index, 1);
        }
      });
    }

    // Jobs that were running when the process died go back to the queue
    for (const job of this.jobs) {
      if (job.status === 'active') {
        job.status = 'pending';
        delete job.startedAt;
      }
    }
  }

  private rehydrate(raw: Record<string, unknown>): Job {
    const job = { ...raw } as unknown as Job;
    for (const field of DATE_FIELDS) {
      const value = raw[field];
      if (typeof value === 'string' || typeof value === 'number') {
        (job as unknown as Record<string, unknown>)[field] = new Date(value);
      }
    }
    if (!(job.createdAt instanceof Date)) job.createdAt = new Date();
    if (!(job.runAt instanceof Date)) job.runAt = new Date(job.createdAt.getTime());
    return job;
  }
}
