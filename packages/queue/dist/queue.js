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
 *     to: 'tariq@@axiljs.dev',
 *     subject: 'Welcome!'
 *   })
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.Queue = void 0;
const events_1 = require("events");
const job_1 = require("./job");
const store_1 = require("./store");
const logger_1 = require("./logger");
// ─── Queue ────────────────────────────────────────────────────────────────────
class Queue extends events_1.EventEmitter {
    name;
    store;
    handlers = new Map();
    activeCount = 0;
    activeRuns = new Map();
    pollTimer;
    running = false;
    options;
    log;
    constructor(name, options = {}) {
        super();
        this.name = name;
        this.options = {
            concurrency: options.concurrency ?? 1,
            pollIntervalMs: options.pollIntervalMs ?? 500,
            backoff: options.backoff ?? { type: 'exponential', delay: 1000 }
        };
        this.store = options.store ?? new store_1.InMemoryQueueStore();
        this.log = (0, logger_1.createLogSink)(options.logger, '[AxilJS Queue]');
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
     * @param options  Job options (delay, retry, priority, timeoutMs)
     */
    async add(jobName, data, options = {}) {
        const job = (0, job_1.createJob)(this.name, jobName, data, options);
        this.store.add(job);
        this.safeEmit('added', job);
        return job;
    }
    /**
     * Add multiple jobs at once.
     */
    async addMany(jobName, dataArray, options = {}) {
        return Promise.all(dataArray.map(data => this.add(jobName, data, options)));
    }
    /**
     * Cancel a job.
     *   - pending/delayed → 'cancelled', never runs
     *   - active          → 'cancelled', its AbortSignal fires, the result is
     *                       discarded and it is not retried
     * Emits 'cancelled'. Returns false if the job doesn't exist or already finished.
     */
    cancel(jobId) {
        const job = this.store.get(jobId);
        if (!job)
            return false;
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
    start() {
        if (this.running)
            return;
        this.running = true;
        this.pollTimer = setInterval(() => {
            this.processNext();
        }, this.options.pollIntervalMs);
        this.log('info', `'${this.name}' started (concurrency: ${this.options.concurrency})`);
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
        this.log('info', `'${this.name}' stopped`);
    }
    // ─── Job Queries ──────────────────────────────────────────────────────────────
    /**
     * Get jobs by status.
     */
    getJobs(status) {
        const jobs = this.store.list();
        if (!status)
            return jobs;
        return jobs.filter(j => j.status === status);
    }
    /**
     * Get a specific job by ID.
     */
    getJob(id) {
        return this.store.get(id);
    }
    /**
     * Get queue statistics.
     */
    getStats() {
        const jobs = this.store.list();
        return {
            pending: jobs.filter(j => j.status === 'pending').length,
            active: jobs.filter(j => j.status === 'active').length,
            completed: jobs.filter(j => j.status === 'completed').length,
            failed: jobs.filter(j => j.status === 'failed').length,
            delayed: jobs.filter(j => j.status === 'delayed').length,
            cancelled: jobs.filter(j => j.status === 'cancelled').length
        };
    }
    /**
     * Remove completed, failed and cancelled jobs (cleanup).
     */
    purge() {
        for (const job of this.store.list()) {
            if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
                // Keep cancelled jobs whose handler is still winding down tracked until it settles
                if (this.activeRuns.has(job.id))
                    continue;
                this.store.remove(job.id);
            }
        }
    }
    // ─── Processing ───────────────────────────────────────────────────────────────
    /**
     * Pick the next ready job and process it.
     */
    processNext() {
        // Fill all free concurrency slots on each tick (not just one)
        while (this.running && this.activeCount < this.options.concurrency) {
            const now = new Date();
            // Find the highest-priority ready job (store order breaks ties)
            let job;
            for (const j of this.store.list()) {
                if ((j.status === 'pending' || j.status === 'delayed') && j.runAt <= now) {
                    if (!job || j.priority > job.priority)
                        job = j;
                }
            }
            if (!job)
                return;
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
    async runJob(job, handler) {
        const outcome = await this.runAttempt(job, handler);
        // cancel() already updated the job and emitted 'cancelled'
        if (outcome.kind === 'cancelled' || job.status === 'cancelled')
            return;
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
        }
        else {
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
    async runAttempt(job, handler) {
        const controller = new AbortController();
        let interrupt;
        const interrupted = new Promise(resolve => { interrupt = resolve; });
        this.activeRuns.set(job.id, { controller, interrupt });
        let timer;
        if (job.timeoutMs && job.timeoutMs > 0) {
            timer = setTimeout(() => {
                const error = new Error(`Job '${job.name}' timed out after ${job.timeoutMs}ms`);
                error.name = 'JobTimeoutError';
                controller.abort(error);
                interrupt({ kind: 'timeout', error });
            }, job.timeoutMs);
        }
        try {
            const attempt = Promise.resolve()
                .then(() => handler(job, { signal: controller.signal }))
                .then((result) => ({ kind: 'ok', result }), (error) => ({ kind: 'error', error }));
            return await Promise.race([attempt, interrupted]);
        }
        finally {
            if (timer)
                clearTimeout(timer);
            this.activeRuns.delete(job.id);
        }
    }
    /**
     * Emit without letting listener exceptions (sync throws or rejected
     * promises from async listeners) escape into the queue's control flow.
     */
    safeEmit(event, ...args) {
        for (const listener of this.rawListeners(event)) {
            try {
                const ret = listener.apply(this, args);
                if (ret && typeof ret.then === 'function') {
                    ret.then(undefined, err => this.reportListenerError(event, err));
                }
            }
            catch (err) {
                this.reportListenerError(event, err);
            }
        }
    }
    reportListenerError(event, err) {
        this.log('error', `'${this.name}' ${event} listener threw: ${err instanceof Error ? err.message : String(err)}`, '\x1b[31m');
    }
    /**
     * Calculate backoff delay for retry attempts.
     *
     * exponential: base * 2^(attempt-1), with ±25% proportional jitter, i.e.
     *              a uniformly random value in [0.75 × d, 1.25 × d]. Jitter scales
     *              with the delay, so a 10 ms base waits 7.5–12.5 ms (not ~1 s).
     * fixed:       always exactly `delay` (no jitter).
     */
    calculateBackoff(attemptNumber) {
        const { type, delay } = this.options.backoff;
        if (type === 'exponential') {
            const base = delay * Math.pow(2, attemptNumber - 1);
            return Math.max(0, base * (0.75 + Math.random() * 0.5));
        }
        // Fixed: always the same delay
        return delay;
    }
}
exports.Queue = Queue;
//# sourceMappingURL=queue.js.map