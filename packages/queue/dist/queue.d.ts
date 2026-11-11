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
import { Job, JobOptions, JobHandler, JobStatus } from './job';
import { QueueStore } from './store';
import { QueueLoggerOption } from './logger';
export interface QueueOptions {
    concurrency?: number;
    pollIntervalMs?: number;
    backoff?: {
        type: 'fixed' | 'exponential';
        delay: number;
    };
    store?: QueueStore;
    logger?: QueueLoggerOption;
}
export declare class Queue extends EventEmitter {
    readonly name: string;
    private store;
    private handlers;
    private activeCount;
    private activeRuns;
    private pollTimer?;
    private running;
    private options;
    private log;
    constructor(name: string, options?: QueueOptions);
    /**
     * Register a handler for a specific job name.
     * Call process() before start() or add().
     */
    process<T = unknown>(jobName: string, handler: JobHandler<T>): this;
    /**
     * Add a job to the queue.
     *
     * @param jobName  Must match a registered handler
     * @param data     Job payload
     * @param options  Job options (delay, retry, priority, timeoutMs)
     */
    add<T = unknown>(jobName: string, data: T, options?: JobOptions): Promise<Job<T>>;
    /**
     * Add multiple jobs at once.
     */
    addMany<T>(jobName: string, dataArray: T[], options?: JobOptions): Promise<Job<T>[]>;
    /**
     * Cancel a job.
     *   - pending/delayed → 'cancelled', never runs
     *   - active          → 'cancelled', its AbortSignal fires, the result is
     *                       discarded and it is not retried
     * Emits 'cancelled'. Returns false if the job doesn't exist or already finished.
     */
    cancel(jobId: string): boolean;
    /**
     * Start processing jobs.
     */
    start(): void;
    /**
     * Stop processing jobs gracefully.
     * Waits for active jobs to complete.
     */
    stop(): Promise<void>;
    /**
     * Get jobs by status.
     */
    getJobs(status?: JobStatus): Job[];
    /**
     * Get a specific job by ID.
     */
    getJob(id: string): Job | undefined;
    /**
     * Get queue statistics.
     */
    getStats(): {
        pending: number;
        active: number;
        completed: number;
        failed: number;
        delayed: number;
        cancelled: number;
    };
    /**
     * Remove completed, failed and cancelled jobs (cleanup).
     */
    purge(): void;
    /**
     * Pick the next ready job and process it.
     */
    private processNext;
    /**
     * Execute a job with error handling and retry logic.
     * Listener exceptions never influence the job outcome.
     */
    private runJob;
    /**
     * Run one attempt, racing the handler against timeout/cancellation.
     * A handler that keeps running after a timeout/cancel is ignored
     * (its signal is aborted so cooperative handlers can stop).
     */
    private runAttempt;
    /**
     * Emit without letting listener exceptions (sync throws or rejected
     * promises from async listeners) escape into the queue's control flow.
     */
    private safeEmit;
    private reportListenerError;
    /**
     * Calculate backoff delay for retry attempts.
     *
     * exponential: base * 2^(attempt-1), with ±25% proportional jitter, i.e.
     *              a uniformly random value in [0.75 × d, 1.25 × d]. Jitter scales
     *              with the delay, so a 10 ms base waits 7.5–12.5 ms (not ~1 s).
     * fixed:       always exactly `delay` (no jitter).
     */
    private calculateBackoff;
}
//# sourceMappingURL=queue.d.ts.map