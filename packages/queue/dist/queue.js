"use strict";
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
 *     to: 'tariq@restjs.dev',
 *     subject: 'Welcome!'
 *   })
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Queue = void 0;
const events_1 = require("events");
const job_1 = require("./job");
// ─── Queue ────────────────────────────────────────────────────────────────────
class Queue extends events_1.EventEmitter {
    name;
    jobs = [];
    handlers = new Map();
    activeCount = 0;
    pollTimer;
    running = false;
    options;
    constructor(name, options = {}) {
        super();
        this.name = name;
        this.options = {
            concurrency: options.concurrency ?? 1,
            pollIntervalMs: options.pollIntervalMs ?? 500,
            backoff: options.backoff ?? { type: 'exponential', delay: 1000 }
        };
    }
    // ─── Job Registration ─────────────────────────────────────────────────────────
    /**
     * Register a handler for a specific job name.
     * Call process() before start() or add().
     */
    process(jobName, handler) {
        this.handlers.set(jobName, handler);
        return this;
    }
    // ─── Job Submission ───────────────────────────────────────────────────────────
    /**
     * Add a job to the queue.
     *
     * @param jobName  Must match a registered handler
     * @param data     Job payload
     * @param options  Job options (delay, retry, priority)
     */
    async add(jobName, data, options = {}) {
        const job = (0, job_1.createJob)(this.name, jobName, data, options);
        // Insert maintaining priority order (higher priority first)
        const insertAt = this.jobs.findIndex(j => j.priority < job.priority);
        if (insertAt === -1) {
            this.jobs.push(job);
        }
        else {
            this.jobs.splice(insertAt, 0, job);
        }
        this.emit('added', job);
        return job;
    }
    /**
     * Add multiple jobs at once.
     */
    async addMany(jobName, dataArray, options = {}) {
        return Promise.all(dataArray.map(data => this.add(jobName, data, options)));
    }
    // ─── Queue Control ────────────────────────────────────────────────────────────
    /**
     * Start processing jobs.
     */
    start() {
        if (this.running)
            return;
        this.running = true;
        this.pollTimer = setInterval(() => {
            this.processNext();
        }, this.options.pollIntervalMs);
        console.log(`\x1b[36m[REstJS Queue]\x1b[0m '${this.name}' started ` +
            `(concurrency: ${this.options.concurrency})`);
    }
    /**
     * Stop processing jobs gracefully.
     * Waits for active jobs to complete.
     */
    async stop() {
        this.running = false;
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
        }
        // Wait for active jobs to finish
        while (this.activeCount > 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        console.log(`\x1b[36m[REstJS Queue]\x1b[0m '${this.name}' stopped`);
    }
    // ─── Job Queries ──────────────────────────────────────────────────────────────
    /**
     * Get jobs by status.
     */
    getJobs(status) {
        if (!status)
            return [...this.jobs];
        return this.jobs.filter(j => j.status === status);
    }
    /**
     * Get a specific job by ID.
     */
    getJob(id) {
        return this.jobs.find(j => j.id === id);
    }
    /**
     * Get queue statistics.
     */
    getStats() {
        return {
            pending: this.jobs.filter(j => j.status === 'pending').length,
            active: this.jobs.filter(j => j.status === 'active').length,
            completed: this.jobs.filter(j => j.status === 'completed').length,
            failed: this.jobs.filter(j => j.status === 'failed').length,
            delayed: this.jobs.filter(j => j.status === 'delayed').length
        };
    }
    /**
     * Remove completed and failed jobs (cleanup).
     */
    purge() {
        this.jobs = this.jobs.filter(j => j.status !== 'completed' && j.status !== 'failed' && j.status !== 'cancelled');
    }
    // ─── Processing ───────────────────────────────────────────────────────────────
    /**
     * Pick the next ready job and process it.
     */
    processNext() {
        if (!this.running)
            return;
        if (this.activeCount >= this.options.concurrency)
            return;
        const now = new Date();
        // Find next pending job that's ready to run
        const job = this.jobs.find(j => (j.status === 'pending' || j.status === 'delayed') &&
            j.runAt <= now);
        if (!job)
            return;
        // Check if we have a handler for this job
        const handler = this.handlers.get(job.name);
        if (!handler) {
            job.status = 'failed';
            job.error = `No handler registered for job '${job.name}'`;
            this.emit('failed', job, new Error(job.error));
            return;
        }
        // Mark as active and process
        job.status = 'active';
        job.attempts++;
        job.startedAt = new Date();
        this.activeCount++;
        this.runJob(job, handler).finally(() => {
            this.activeCount--;
        });
    }
    /**
     * Execute a job with error handling and retry logic.
     */
    async runJob(job, handler) {
        try {
            const result = await handler(job);
            job.status = 'completed';
            job.finishedAt = new Date();
            job.result = result;
            this.emit('completed', job, result);
        }
        catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            // Should we retry?
            if (job.attempts < job.maxAttempts) {
                const backoffDelay = this.calculateBackoff(job.attempts);
                job.status = 'delayed';
                job.runAt = new Date(Date.now() + backoffDelay);
                job.error = err.message;
                this.emit('retry', job, err);
            }
            else {
                // All attempts exhausted
                job.status = 'failed';
                job.finishedAt = new Date();
                job.error = err.message;
                job.stack = err.stack;
                this.emit('failed', job, err);
            }
        }
    }
    /**
     * Calculate backoff delay for retry attempts.
     */
    calculateBackoff(attemptNumber) {
        const { type, delay } = this.options.backoff;
        if (type === 'exponential') {
            // Exponential: 1s, 2s, 4s, 8s... with jitter
            return delay * Math.pow(2, attemptNumber - 1) + Math.random() * 1000;
        }
        // Fixed: always the same delay
        return delay;
    }
}
exports.Queue = Queue;
//# sourceMappingURL=queue.js.map