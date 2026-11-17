/**
 * Asynchronous, claim-based job storage for Queue.
 *
 * Where a QueueStore is a synchronous list the queue scans itself, a
 * QueueBackend owns job selection: `claim()` atomically moves due jobs to
 * 'active' for one worker and returns them. That makes it safe for several
 * processes or servers to share one backend (e.g. a SQL table, see
 * SqlQueueBackend), because no two workers can claim the same job.
 *
 * Ownership is fenced: `finish()`, `heartbeat()` only touch a job that is
 * still 'active' and locked by the calling worker. If the job was cancelled
 * or recovered as stale in the meantime the call reports that the worker no
 * longer owns it, and the queue discards its outcome.
 */

import { Job, JobStatus } from './job';

export interface JobFilter {
  // Only jobs of this queue
  queue?: string;

  // Only jobs with this status (or any of these statuses)
  status?: JobStatus | JobStatus[];

  // Only these job IDs
  ids?: string[];

  // Paging (results are in claim order: priority, then insertion order)
  limit?: number;
  offset?: number;
}

export type JobCounts = Record<JobStatus, number>;

export interface QueueBackend {
  // Persist a new job
  enqueue(job: Job): Promise<void>;

  // Atomically move up to `limit` due jobs of `queue` ('pending' or 'delayed'
  // with runAt <= now) to 'active', locked by `workerId`. Increments
  // `attempts` and sets `startedAt`. Highest priority first, then insertion
  // order. Returns the claimed jobs in that order.
  claim(queue: string, workerId: string, limit: number, now: Date): Promise<Job[]>;

  // Write the final state of an attempt (status, attempts, runAt, finishedAt,
  // error, stack, result) and release the lock. Applies only while the job is
  // still 'active' and locked by `workerId`; returns false otherwise.
  complete(job: Job, workerId: string): Promise<boolean>;
  fail(job: Job, workerId: string): Promise<boolean>;
  retry(job: Job, workerId: string): Promise<boolean>;

  // Unconditionally overwrite a job's mutable fields
  update(job: Job): Promise<void>;

  // Set an existing pending/delayed/active job to 'cancelled' and return it.
  // Returns undefined if the job doesn't exist or already finished.
  cancel(id: string, now: Date): Promise<Job | undefined>;

  // Refresh the lock of the given active jobs held by `workerId`. Returns the
  // IDs the worker still owns; any other ID was cancelled or recovered.
  heartbeat(workerId: string, ids: string[], now: Date): Promise<string[]>;

  // Return 'active' jobs whose lock is older than `olderThanMs` to 'pending'
  // (attempt count kept). Jobs that already used all attempts become
  // 'failed'. Returns how many jobs were changed.
  recoverStale(olderThanMs: number, now?: Date, queue?: string): Promise<number>;

  get(id: string): Promise<Job | undefined>;
  list(filter?: JobFilter): Promise<Job[]>;
  counts(queue: string): Promise<JobCounts>;
  remove(id: string): Promise<void>;

  // Delete finished jobs (completed, failed, cancelled) of `queue`, except
  // `keepIds`. Returns how many were deleted.
  purge(queue: string, keepIds?: string[]): Promise<number>;
}

/** @internal */
export function emptyCounts(): JobCounts {
  return { pending: 0, active: 0, completed: 0, failed: 0, delayed: 0, cancelled: 0 };
}

/** @internal Error stored on jobs that exhausted their attempts while stalled. */
export const STALLED_MESSAGE = 'Job stalled (its worker stopped renewing the lock) and has no attempts left';

interface Lock {
  workerId: string;
  at: number;
}

/**
 * Reference QueueBackend that keeps jobs in process memory. Behaves like the
 * SQL backend (claiming, fencing, stale recovery) but is only shared by
 * Queue instances in the same process. Useful for tests.
 */
export class InMemoryQueueBackend implements QueueBackend {
  private jobs: Job[] = [];
  private locks = new Map<string, Lock>();

  async enqueue(job: Job): Promise<void> {
    if (this.jobs.some(j => j.id === job.id)) {
      throw new Error(`InMemoryQueueBackend: job '${job.id}' already exists`);
    }
    // Insertion order is the tie-breaker; priority is applied when claiming
    this.jobs.push(copy(job));
  }

  async claim(queue: string, workerId: string, limit: number, now: Date): Promise<Job[]> {
    const due = this.ordered().filter(j =>
      j.queue === queue &&
      (j.status === 'pending' || j.status === 'delayed') &&
      j.runAt.getTime() <= now.getTime()
    );
    const claimed: Job[] = [];
    for (const job of due.slice(0, Math.max(0, Math.floor(limit)))) {
      job.status = 'active';
      job.attempts++;
      job.startedAt = new Date(now.getTime());
      this.locks.set(job.id, { workerId, at: now.getTime() });
      claimed.push(copy(job));
    }
    return claimed;
  }

  complete(job: Job, workerId: string): Promise<boolean> {
    return this.finish(job, workerId);
  }

  fail(job: Job, workerId: string): Promise<boolean> {
    return this.finish(job, workerId);
  }

  retry(job: Job, workerId: string): Promise<boolean> {
    return this.finish(job, workerId);
  }

  async update(job: Job): Promise<void> {
    const index = this.jobs.findIndex(j => j.id === job.id);
    if (index === -1) return;
    this.jobs[index] = copy(job);
    if (job.status !== 'active') this.locks.delete(job.id);
  }

  async cancel(id: string, now: Date): Promise<Job | undefined> {
    const job = this.jobs.find(j => j.id === id);
    if (!job) return undefined;
    if (job.status !== 'pending' && job.status !== 'delayed' && job.status !== 'active') return undefined;
    job.status = 'cancelled';
    job.finishedAt = new Date(now.getTime());
    this.locks.delete(id);
    return copy(job);
  }

  async heartbeat(workerId: string, ids: string[], now: Date): Promise<string[]> {
    const owned: string[] = [];
    for (const id of ids) {
      const lock = this.locks.get(id);
      const job = this.jobs.find(j => j.id === id);
      if (job && job.status === 'active' && lock && lock.workerId === workerId) {
        lock.at = now.getTime();
        owned.push(id);
      }
    }
    return owned;
  }

  async recoverStale(olderThanMs: number, now: Date = new Date(), queue?: string): Promise<number> {
    const cutoff = now.getTime() - olderThanMs;
    let changed = 0;
    for (const job of this.jobs) {
      if (job.status !== 'active' || (queue !== undefined && job.queue !== queue)) continue;
      const lock = this.locks.get(job.id);
      if (lock && lock.at >= cutoff) continue;
      this.locks.delete(job.id);
      if (job.attempts >= job.maxAttempts) {
        job.status = 'failed';
        job.finishedAt = new Date(now.getTime());
        job.error = STALLED_MESSAGE;
      } else {
        job.status = 'pending';
      }
      changed++;
    }
    return changed;
  }

  async get(id: string): Promise<Job | undefined> {
    const job = this.jobs.find(j => j.id === id);
    return job ? copy(job) : undefined;
  }

  async list(filter: JobFilter = {}): Promise<Job[]> {
    const statuses = filter.status === undefined ? undefined
      : Array.isArray(filter.status) ? filter.status : [filter.status];
    const ids = filter.ids ? new Set(filter.ids) : undefined;
    const matched = this.ordered().filter(j =>
      (filter.queue === undefined || j.queue === filter.queue) &&
      (!statuses || statuses.includes(j.status)) &&
      (!ids || ids.has(j.id))
    );
    const offset = Math.max(0, filter.offset ?? 0);
    const end = filter.limit === undefined ? undefined : offset + Math.max(0, filter.limit);
    return matched.slice(offset, end).map(copy);
  }

  async counts(queue: string): Promise<JobCounts> {
    const counts = emptyCounts();
    for (const job of this.jobs) {
      if (job.queue === queue) counts[job.status]++;
    }
    return counts;
  }

  async remove(id: string): Promise<void> {
    const index = this.jobs.findIndex(j => j.id === id);
    if (index !== -1) this.jobs.splice(index, 1);
    this.locks.delete(id);
  }

  async purge(queue: string, keepIds: string[] = []): Promise<number> {
    const keep = new Set(keepIds);
    const before = this.jobs.length;
    this.jobs = this.jobs.filter(j =>
      j.queue !== queue ||
      keep.has(j.id) ||
      !(j.status === 'completed' || j.status === 'failed' || j.status === 'cancelled')
    );
    return before - this.jobs.length;
  }

  private async finish(job: Job, workerId: string): Promise<boolean> {
    const lock = this.locks.get(job.id);
    const index = this.jobs.findIndex(j => j.id === job.id);
    if (index === -1 || this.jobs[index].status !== 'active' || !lock || lock.workerId !== workerId) {
      return false;
    }
    this.jobs[index] = copy(job);
    this.locks.delete(job.id);
    return true;
  }

  // Priority (higher first), then insertion order; Array#sort is stable
  private ordered(): Job[] {
    return [...this.jobs].sort((a, b) => b.priority - a.priority);
  }
}

function copy(job: Job): Job {
  return { ...job };
}
