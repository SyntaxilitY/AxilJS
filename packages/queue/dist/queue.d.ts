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
export interface QueueOptions {
    concurrency?: number;
    pollIntervalMs?: number;
    backoff?: {
        type: 'fixed' | 'exponential';
        delay: number;
    };
}
export declare class Queue extends EventEmitter {
    readonly name: string;
    private jobs;
    private handlers;
    private activeCount;
    private pollTimer?;
    private running;
    private options;
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
     * @param options  Job options (delay, retry, priority)
     */
    add<T = unknown>(jobName: string, data: T, options?: JobOptions): Promise<Job<T>>;
    /**
     * Add multiple jobs at once.
     */
    addMany<T>(jobName: string, dataArray: T[], options?: JobOptions): Promise<Job<T>[]>;
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
    };
    /**
     * Remove completed and failed jobs (cleanup).
     */
    purge(): void;
    /**
     * Pick the next ready job and process it.
     */
    private processNext;
    /**
     * Execute a job with error handling and retry logic.
     */
    private runJob;
    /**
     * Calculate backoff delay for retry attempts.
     */
    private calculateBackoff;
}
//# sourceMappingURL=queue.d.ts.map