/**
 * Pluggable job storage for Queue.
 *
 * The interface is synchronous on purpose: the queue's scheduling loop is
 * synchronous, so a store must answer immediately (in-memory, embedded DB
 * with a sync driver, etc.). Remote/async stores (Redis, SQL over the network)
 * use the asynchronous QueueBackend interface instead (see backend.ts and
 * SqlQueueBackend), passed to Queue as `backend`.
 */

import { Job } from './job';

export interface QueueStore {
  // Persist a new job
  add(job: Job): void;

  // Look up a job by ID
  get(id: string): Job | undefined;

  // Persist changes to an existing job (status, attempts, runAt, ...)
  update(job: Job): void;

  // All jobs. Jobs are picked in this order among equal priorities,
  // so return them in insertion order (or priority order).
  list(): Job[];

  // Delete a job
  remove(id: string): void;
}

/**
 * Default in-memory store. Keeps jobs ordered by priority (higher first),
 * FIFO within the same priority.
 */
export class InMemoryQueueStore implements QueueStore {
  private jobs: Job[] = [];

  add(job: Job): void {
    const insertAt = this.jobs.findIndex(j => j.priority < job.priority);
    if (insertAt === -1) {
      this.jobs.push(job);
    } else {
      this.jobs.splice(insertAt, 0, job);
    }
  }

  get(id: string): Job | undefined {
    return this.jobs.find(j => j.id === id);
  }

  update(job: Job): void {
    const index = this.jobs.findIndex(j => j.id === job.id);
    if (index !== -1) this.jobs[index] = job;
  }

  list(): Job[] {
    return [...this.jobs];
  }

  remove(id: string): void {
    const index = this.jobs.findIndex(j => j.id === id);
    if (index !== -1) this.jobs.splice(index, 1);
  }
}
