/**
 * In-memory job queue with worker processing.
 * Phase 4: in-memory. Phase 6: Redis/database backed.
 *
 * Features:
 *   - Priority queuing
 *   - Delayed jobs
 *   - Automatic retry with backoff
 *   - Concurrency control
 *   - Job events (completed, failed, etc.)
 *
 * Usage:
 *   const emailQueue = new Queue('emails', { concurrency: 5 })
 *
 *   emailQueue.process('send-welcome', async (job) => {
 *     await sendEmail(job.data.to, job.data.subject)
 *   })
 *
 *   await emailQueue.add('send-welcome', {
 *     to: 'tariq@@axiljs.dev',
 *     subject: 'Welcome!'
 *   })
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { Job, JobOptions, JobHandler, JobStatus, createJob } from './job';
import { QueueStore, InMemoryQueueStore } from './store';
import { QueueBackend } from './backend';
import { QueueLoggerOption, LogSink, createLogSink } from './logger';

/**
 * Report a job payload to @axiljs/runtime's sensitive data lineage ('queue'
 * sink) without depending on it. In enforce mode the hook throws and add()
 * rejects before the job is stored.
 */
function checkSensitiveSink(data: unknown): void {
  const sink = (globalThis as any)[Symbol.for('axiljs.sensitive.sink')];
  if (typeof sink === 'function') sink('queue', data);
}

// ─── Queue Options ────────────────────────────────────────────────────────────

export interface QueueOptions {
  // How many jobs to process simultaneously (default: 1)
  concurrency?: number;

  // Delay between polling for new jobs in ms (default: 500)
  pollIntervalMs?: number;

  // Backoff strategy for retries
  backoff?: {
    type: 'fixed' | 'exponential';
    delay: number; // Base delay in ms
  };

  // Job storage (default: InMemoryQueueStore)
  store?: QueueStore;

  // Asynchronous, claim-based storage shared by several processes/servers
  // (e.g. SqlQueueBackend). Mutually exclusive with `store`. With a backend
  // the sync query methods (getJobs, getJob, getStats, purge, cancel) throw;
  // use their *Async variants.
  backend?: QueueBackend;

  // Backend mode: this worker's lock owner ID
  // (default: `${hostname}:${pid}:${random}`)
  workerId?: string;

  // Backend mode: an active job whose lock has not been renewed for this long
  // is considered abandoned (its worker crashed) and is returned to pending.
  // Running jobs renew their lock on every poll. (default: 30000)
  visibilityTimeoutMs?: number;

  // Where start/stop and listener-error messages go.
  // Default: console (unchanged). false: silent. { info, warn }: your logger
  // (plain text, no ANSI; errors are reported via warn).
  logger?: QueueLoggerOption;
}

// ─── Internal ─────────────────────────────────────────────────────────────────

type Interrupt =
  | { kind: 'timeout'; error: Error }
  | { kind: 'cancelled' };

type JobStats = {
  pending: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  cancelled: number;
};

type AttemptOutcome =
  | { kind: 'ok'; result: unknown }
  | { kind: 'error'; error: unknown }
  | Interrupt;

interface ActiveRun {
  controller: AbortController;
  interrupt: (reason: Interrupt) => void;
}

// ─── Queue ────────────────────────────────────────────────────────────────────

export class Queue extends EventEmitter {
  private store: QueueStore;
  private handlers = new Map<string, JobHandler>();
  private activeCount = 0;
  private activeRuns = new Map<string, ActiveRun>();
  private pollTimer?: ReturnType<typeof setInterval>;
  private running = false;
  private options: Required<Omit<QueueOptions, 'store' | 'logger' | 'backend' | 'workerId' | 'visibilityTimeoutMs'>>;
  private log: LogSink;

  // Backend mode only
  private backend?: QueueBackend;
  readonly workerId: string;
  private readonly visibilityTimeoutMs: number;
  private backendTimer?: ReturnType<typeof setTimeout>;
  private tickInFlight?: Promise<void>;
  private tickAgain = false;
  private lastRecoveryAt = 0;
  private backendFailing = false;

  constructor(
    public readonly name: string,
    options: QueueOptions = {}
  ) {
    super();

    this.options = {
      concurrency: options.concurrency ?? 1,
      pollIntervalMs: options.pollIntervalMs ?? 500,
      backoff: options.backoff ?? { type: 'exponential', delay: 1000 }
    };
    if (options.store && options.backend) {
      throw new Error(`Queue '${name}': pass either 'store' or 'backend', not both`);
    }
    this.store = options.store ?? new InMemoryQueueStore();
    this.backend = options.backend;
    this.workerId = options.workerId ?? `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
    this.visibilityTimeoutMs = Math.max(1, options.visibilityTimeoutMs ?? 30000);
    this.log = createLogSink(options.logger, '[AxilJS Queue]');
  }

  // ─── Job Registration ─────────────────────────────────────────────────────────

  /**
   * Register a handler for a specific job name.
   * Call process() before start() or add().
   */
  process<T = unknown>(jobName: string, handler: JobHandler<T>): this {
    this.handlers.set(jobName, handler as JobHandler);
    return this;
  }

  // ─── Job Submission ───────────────────────────────────────────────────────────

  /**
   * Add a job to the queue.
   *
   * @param jobName  Must match a registered handler
   * @param data     Job payload
   * @param options  Job options (delay, retry, priority, timeoutMs)
   */
  async add<T = unknown>(
    jobName: string,
    data: T,
    options: JobOptions = {}
  ): Promise<Job<T>> {
    checkSensitiveSink(data);
    const job = createJob<T>(this.name, jobName, data, options);

    if (this.backend) {
      await this.backend.enqueue(job as Job);
      this.safeEmit('added', job);
      if (job.status === 'pending') this.wake();
      return job;
    }

    this.store.add(job as Job);

    this.safeEmit('added', job);

    return job;
  }

  /**
   * Add multiple jobs at once.
   */
  async addMany<T>(
    jobName: string,
    dataArray: T[],
    options: JobOptions = {}
  ): Promise<Job<T>[]> {
    return Promise.all(dataArray.map(data => this.add(jobName, data, options)));
  }

  /**
   * Cancel a job.
   *   - pending/delayed → 'cancelled', never runs
   *   - active          → 'cancelled', its AbortSignal fires, the result is
   *                       discarded and it is not retried
   * Emits 'cancelled'. Returns false if the job doesn't exist or already finished.
   */
  cancel(jobId: string): boolean {
    this.assertSync('cancel');
    const job = this.store.get(jobId);
    if (!job) return false;

    if (job.status === 'pending' || job.status === 'delayed') {
      job.status = 'cancelled';
      job.finishedAt = new Date();
      this.store.update(job);
      this.safeEmit('cancelled', job);
      return true;
    }

    if (job.status === 'active') {
      job.status = 'cancelled';
      job.finishedAt = new Date();
      this.store.update(job);
      const run = this.activeRuns.get(job.id);
      if (run) {
        run.controller.abort(new Error(`Job '${job.name}' was cancelled`));
        run.interrupt({ kind: 'cancelled' });
      }
      this.safeEmit('cancelled', job);
      return true;
    }

    return false;
  }

  // ─── Queue Control ────────────────────────────────────────────────────────────

  /**
   * Start processing jobs.
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    if (this.backend) {
      this.scheduleTick(0);
      this.log('info', `'${this.name}' started (concurrency: ${this.options.concurrency}, worker: ${this.workerId})`);
      return;
    }

    this.pollTimer = setInterval(() => {
      this.processNext();
    }, this.options.pollIntervalMs);

    this.log('info', `'${this.name}' started (concurrency: ${this.options.concurrency})`);
  }

  /**
   * Stop processing jobs gracefully.
   * Waits for active jobs to complete.
   */
  async stop(): Promise<void> {
    this.running = false;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
    }

    if (this.backend) {
      if (this.backendTimer) clearTimeout(this.backendTimer);
      this.backendTimer = undefined;
      // Jobs claimed by a tick that is still in flight run to completion too
      if (this.tickInFlight) await this.tickInFlight;
    }

    // Wait for active jobs to finish
    while (this.activeCount > 0) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.log('info', `'${this.name}' stopped`);
  }

  // ─── Job Queries ──────────────────────────────────────────────────────────────

  /**
   * Get jobs by status.
   */
  getJobs(status?: JobStatus): Job[] {
    this.assertSync('getJobs');
    const jobs = this.store.list();
    if (!status) return jobs;
    return jobs.filter(j => j.status === status);
  }

  /**
   * Get a specific job by ID.
   */
  getJob(id: string): Job | undefined {
    this.assertSync('getJob');
    return this.store.get(id);
  }

  /**
   * Get queue statistics.
   */
  getStats(): JobStats {
    this.assertSync('getStats');
    const jobs = this.store.list();
    return {
      pending:   jobs.filter(j => j.status === 'pending').length,
      active:    jobs.filter(j => j.status === 'active').length,
      completed: jobs.filter(j => j.status === 'completed').length,
      failed:    jobs.filter(j => j.status === 'failed').length,
      delayed:   jobs.filter(j => j.status === 'delayed').length,
      cancelled: jobs.filter(j => j.status === 'cancelled').length
    };
  }

  /**
   * Remove completed, failed and cancelled jobs (cleanup).
   */
  purge(): void {
    this.assertSync('purge');
    for (const job of this.store.list()) {
      if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
        // Keep cancelled jobs whose handler is still winding down tracked until it settles
        if (this.activeRuns.has(job.id)) continue;
        this.store.remove(job.id);
      }
    }
  }

  // ─── Async API (works with a store or a backend) ──────────────────────────────

  /**
   * Get jobs by status. Required with a `backend`; equals getJobs() otherwise.
   */
  async getJobsAsync(status?: JobStatus): Promise<Job[]> {
    if (!this.backend) return this.getJobs(status);
    return this.backend.list({ queue: this.name, status });
  }

  /**
   * Get a job by ID. Required with a `backend`; equals getJob() otherwise.
   */
  async getJobAsync(id: string): Promise<Job | undefined> {
    if (!this.backend) return this.getJob(id);
    const job = await this.backend.get(id);
    return job && job.queue === this.name ? job : undefined;
  }

  /**
   * Queue statistics. Required with a `backend`; equals getStats() otherwise.
   */
  async getStatsAsync(): Promise<JobStats> {
    if (!this.backend) return this.getStats();
    return this.backend.counts(this.name);
  }

  /**
   * Remove completed, failed and cancelled jobs. Required with a `backend`;
   * equals purge() otherwise.
   */
  async purgeAsync(): Promise<void> {
    if (!this.backend) return this.purge();
    await this.backend.purge(this.name, [...this.activeRuns.keys()]);
  }

  /**
   * Cancel a job (see cancel()). Required with a `backend`; equals cancel()
   * otherwise. With a backend, a job that is active on another server is
   * marked cancelled at once; that server aborts it on its next poll.
   */
  async cancelAsync(jobId: string): Promise<boolean> {
    if (!this.backend) return this.cancel(jobId);
    const job = await this.backend.cancel(jobId, new Date());
    if (!job) return false;
    const run = this.activeRuns.get(job.id);
    if (run) {
      run.controller.abort(new Error(`Job '${job.name}' was cancelled`));
      run.interrupt({ kind: 'cancelled' });
    }
    this.safeEmit('cancelled', job);
    return true;
  }

  private assertSync(method: string): void {
    if (this.backend) {
      throw new Error(
        `Queue '${this.name}' uses an async backend; use ${method}Async() instead of ${method}()`
      );
    }
  }

  // ─── Backend processing ───────────────────────────────────────────────────────

  // Run a tick as soon as possible (a job was added or a slot was freed)
  private wake(): void {
    if (this.running && this.backend) this.scheduleTick(0);
  }

  private scheduleTick(delay: number): void {
    if (!this.running) return;
    if (this.tickInFlight) {
      this.tickAgain = true;
      return;
    }
    if (this.backendTimer) clearTimeout(this.backendTimer);
    this.backendTimer = setTimeout(() => {
      this.backendTimer = undefined;
      this.tickInFlight = this.backendTick().finally(() => {
        this.tickInFlight = undefined;
        const again = this.tickAgain;
        this.tickAgain = false;
        this.scheduleTick(again ? 0 : this.options.pollIntervalMs);
      });
    }, delay);
  }

  /**
   * One poll: renew the locks of running jobs (aborting any this worker
   * lost), recover abandoned jobs, then claim jobs for the free slots.
   * Never rejects; backend errors are reported through the 'error' event.
   */
  private async backendTick(): Promise<void> {
    const backend = this.backend!;
    try {
      const now = new Date();

      const running = [...this.activeRuns.keys()];
      if (running.length > 0) {
        const owned = new Set(await backend.heartbeat(this.workerId, running, now));
        for (const id of running) {
          const run = this.activeRuns.get(id);
          // Cancelled elsewhere or recovered as stale: stop and discard it
          if (run && !owned.has(id)) {
            run.controller.abort(new Error(`Job '${id}' is no longer owned by this worker`));
            run.interrupt({ kind: 'cancelled' });
          }
        }
      }

      if (now.getTime() - this.lastRecoveryAt >= this.visibilityTimeoutMs / 2) {
        this.lastRecoveryAt = now.getTime();
        await backend.recoverStale(this.visibilityTimeoutMs, now, this.name);
      }

      const free = this.options.concurrency - this.activeCount;
      if (this.running && free > 0) {
        const jobs = await backend.claim(this.name, this.workerId, free, new Date());
        for (const job of jobs) this.startClaimed(job);
      }

      if (this.backendFailing) {
        this.backendFailing = false;
        this.log('info', `'${this.name}' backend recovered`);
      }
    } catch (err) {
      this.reportBackendError(err);
    }
  }

  private startClaimed(job: Job): void {
    const handler = this.handlers.get(job.name);
    if (!handler) {
      job.status = 'failed';
      job.attempts = Math.max(0, job.attempts - 1); // not an attempt
      job.finishedAt = new Date();
      job.error = `No handler registered for job '${job.name}'`;
      this.backend!.fail(job, this.workerId).then(
        owned => { if (owned) this.safeEmit('failed', job, new Error(job.error)); },
        err => this.reportBackendError(err)
      );
      return;
    }

    this.activeCount++;
    this.runBackendJob(job, handler).finally(() => {
      this.activeCount--;
      this.wake();
    });
  }

  /**
   * Backend counterpart of runJob(): the same outcome rules, but every state
   * change is a fenced write. If this worker no longer owns the job (it was
   * cancelled or recovered elsewhere) the outcome is discarded silently.
   */
  private async runBackendJob(job: Job, handler: JobHandler): Promise<void> {
    const backend = this.backend!;
    const outcome = await this.runAttempt(job, handler);

    if (outcome.kind === 'cancelled') return;

    try {
      if (outcome.kind === 'ok') {
        job.status = 'completed';
        job.finishedAt = new Date();
        job.result = outcome.result;
        if (await backend.complete(job, this.workerId)) {
          this.safeEmit('completed', job, outcome.result);
        }
        return;
      }

      const err = outcome.error instanceof Error ? outcome.error : new Error(String(outcome.error));

      if (job.attempts < job.maxAttempts) {
        job.status = 'delayed';
        job.runAt = new Date(Date.now() + this.calculateBackoff(job.attempts));
        job.error = err.message;
        if (await backend.retry(job, this.workerId)) {
          this.safeEmit('retry', job, err);
        }
      } else {
        job.status = 'failed';
        job.finishedAt = new Date();
        job.error = err.message;
        job.stack = err.stack;
        if (await backend.fail(job, this.workerId)) {
          this.safeEmit('failed', job, err);
        }
      }
    } catch (err) {
      // The job stays active in the backend and is recovered once its lock expires
      this.reportBackendError(err);
    }
  }

  private reportBackendError(err: unknown): void {
    const error = err instanceof Error ? err : new Error(String(err));
    // Log the first error of a failure streak, not one per poll
    if (!this.backendFailing) {
      this.backendFailing = true;
      this.log('warn', `'${this.name}' backend error: ${error.message}`, '\x1b[33m');
    }
    this.safeEmit('error', error);
  }

  // ─── Processing ───────────────────────────────────────────────────────────────

  /**
   * Pick the next ready job and process it.
   */
  private processNext(): void {
    // Fill all free concurrency slots on each tick (not just one)
    while (this.running && this.activeCount < this.options.concurrency) {
      const now = new Date();

      // Find the highest-priority ready job (store order breaks ties)
      let job: Job | undefined;
      for (const j of this.store.list()) {
        if ((j.status === 'pending' || j.status === 'delayed') && j.runAt <= now) {
          if (!job || j.priority > job.priority) job = j;
        }
      }

      if (!job) return;

      // Check if we have a handler for this job
      const handler = this.handlers.get(job.name);
      if (!handler) {
        job.status = 'failed';
        job.finishedAt = new Date();
        job.error = `No handler registered for job '${job.name}'`;
        this.store.update(job);
        this.safeEmit('failed', job, new Error(job.error));
        continue;
      }

      // Mark as active and process
      job.status = 'active';
      job.attempts++;
      job.startedAt = new Date();
      this.store.update(job);
      this.activeCount++;

      this.runJob(job, handler).finally(() => {
        this.activeCount--;
      });
    }
  }

  /**
   * Execute a job with error handling and retry logic.
   * Listener exceptions never influence the job outcome.
   */
  private async runJob(job: Job, handler: JobHandler): Promise<void> {
    const outcome = await this.runAttempt(job, handler);

    // cancel() already updated the job and emitted 'cancelled'
    if (outcome.kind === 'cancelled' || job.status === 'cancelled') return;

    if (outcome.kind === 'ok') {
      job.status = 'completed';
      job.finishedAt = new Date();
      job.result = outcome.result;
      this.store.update(job);

      this.safeEmit('completed', job, outcome.result);
      return;
    }

    const err = outcome.error instanceof Error ? outcome.error : new Error(String(outcome.error));

    // Should we retry?
    if (job.attempts < job.maxAttempts) {
      const backoffDelay = this.calculateBackoff(job.attempts);

      job.status = 'delayed';
      job.runAt = new Date(Date.now() + backoffDelay);
      job.error = err.message;
      this.store.update(job);

      this.safeEmit('retry', job, err);
    } else {
      // All attempts exhausted
      job.status = 'failed';
      job.finishedAt = new Date();
      job.error = err.message;
      job.stack = err.stack;
      this.store.update(job);

      this.safeEmit('failed', job, err);
    }
  }

  /**
   * Run one attempt, racing the handler against timeout/cancellation.
   * A handler that keeps running after a timeout/cancel is ignored
   * (its signal is aborted so cooperative handlers can stop).
   */
  private async runAttempt(job: Job, handler: JobHandler): Promise<AttemptOutcome> {
    const controller = new AbortController();
    let interrupt!: (reason: Interrupt) => void;
    const interrupted = new Promise<Interrupt>(resolve => { interrupt = resolve; });
    this.activeRuns.set(job.id, { controller, interrupt });

    let timer: ReturnType<typeof setTimeout> | undefined;
    if (job.timeoutMs && job.timeoutMs > 0) {
      timer = setTimeout(() => {
        const error = new Error(`Job '${job.name}' timed out after ${job.timeoutMs}ms`);
        error.name = 'JobTimeoutError';
        controller.abort(error);
        interrupt({ kind: 'timeout', error });
      }, job.timeoutMs);
    }

    try {
      const attempt: Promise<AttemptOutcome> = Promise.resolve()
        .then(() => handler(job, { signal: controller.signal }))
        .then(
          (result): AttemptOutcome => ({ kind: 'ok', result }),
          (error): AttemptOutcome => ({ kind: 'error', error })
        );
      return await Promise.race([attempt, interrupted]);
    } finally {
      if (timer) clearTimeout(timer);
      this.activeRuns.delete(job.id);
    }
  }

  /**
   * Emit without letting listener exceptions (sync throws or rejected
   * promises from async listeners) escape into the queue's control flow.
   */
  private safeEmit(event: string, ...args: unknown[]): void {
    for (const listener of this.rawListeners(event)) {
      try {
        const ret = (listener as (...a: unknown[]) => unknown).apply(this, args);
        if (ret && typeof (ret as Promise<unknown>).then === 'function') {
          (ret as Promise<unknown>).then(undefined, err => this.reportListenerError(event, err));
        }
      } catch (err) {
        this.reportListenerError(event, err);
      }
    }
  }

  private reportListenerError(event: string, err: unknown): void {
    this.log(
      'error',
      `'${this.name}' ${event} listener threw: ${err instanceof Error ? err.message : String(err)}`,
      '\x1b[31m'
    );
  }

  /**
   * Calculate backoff delay for retry attempts.
   *
   * exponential: base * 2^(attempt-1), with ±25% proportional jitter, i.e.
   *              a uniformly random value in [0.75 × d, 1.25 × d]. Jitter scales
   *              with the delay, so a 10 ms base waits 7.5–12.5 ms (not ~1 s).
   * fixed:       always exactly `delay` (no jitter).
   */
  private calculateBackoff(attemptNumber: number): number {
    const { type, delay } = this.options.backoff;

    if (type === 'exponential') {
      const base = delay * Math.pow(2, attemptNumber - 1);
      return Math.max(0, base * (0.75 + Math.random() * 0.5));
    }

    // Fixed: always the same delay
    return delay;
  }
}
