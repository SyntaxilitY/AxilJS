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
const node_crypto_1 = require("node:crypto");
const node_os_1 = require("node:os");
const job_1 = require("./job");
const store_1 = require("./store");
const logger_1 = require("./logger");
/**
 * Report a job payload to @axiljs/runtime's sensitive data lineage ('queue'
 * sink) without depending on it. In enforce mode the hook throws and add()
 * rejects before the job is stored.
 */
function checkSensitiveSink(data) {
    const sink = globalThis[Symbol.for('axiljs.sensitive.sink')];
    if (typeof sink === 'function')
        sink('queue', data);
}
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
    // Backend mode only
    backend;
    workerId;
    visibilityTimeoutMs;
    backendTimer;
    tickInFlight;
    tickAgain = false;
    lastRecoveryAt = 0;
    backendFailing = false;
    constructor(name, options = {}) {
        super();
        this.name = name;
        this.options = {
            concurrency: options.concurrency ?? 1,
            pollIntervalMs: options.pollIntervalMs ?? 500,
            backoff: options.backoff ?? { type: 'exponential', delay: 1000 }
        };
        if (options.store && options.backend) {
            throw new Error(`Queue '${name}': pass either 'store' or 'backend', not both`);
        }
        this.store = options.store ?? new store_1.InMemoryQueueStore();
        this.backend = options.backend;
        this.workerId = options.workerId ?? `${(0, node_os_1.hostname)()}:${process.pid}:${(0, node_crypto_1.randomUUID)().slice(0, 8)}`;
        this.visibilityTimeoutMs = Math.max(1, options.visibilityTimeoutMs ?? 30000);
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
        checkSensitiveSink(data);
        const job = (0, job_1.createJob)(this.name, jobName, data, options);
        if (this.backend) {
            await this.backend.enqueue(job);
            this.safeEmit('added', job);
            if (job.status === 'pending')
                this.wake();
            return job;
        }
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
        this.assertSync('cancel');
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
    async stop() {
        this.running = false;
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
        }
        if (this.backend) {
            if (this.backendTimer)
                clearTimeout(this.backendTimer);
            this.backendTimer = undefined;
            // Jobs claimed by a tick that is still in flight run to completion too
            if (this.tickInFlight)
                await this.tickInFlight;
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
        this.assertSync('getJobs');
        const jobs = this.store.list();
        if (!status)
            return jobs;
        return jobs.filter(j => j.status === status);
    }
    /**
     * Get a specific job by ID.
     */
    getJob(id) {
        this.assertSync('getJob');
        return this.store.get(id);
    }
    /**
     * Get queue statistics.
     */
    getStats() {
        this.assertSync('getStats');
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
        this.assertSync('purge');
        for (const job of this.store.list()) {
            if (job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') {
                // Keep cancelled jobs whose handler is still winding down tracked until it settles
                if (this.activeRuns.has(job.id))
                    continue;
                this.store.remove(job.id);
            }
        }
    }
    // ─── Async API (works with a store or a backend) ──────────────────────────────
    /**
     * Get jobs by status. Required with a `backend`; equals getJobs() otherwise.
     */
    async getJobsAsync(status) {
        if (!this.backend)
            return this.getJobs(status);
        return this.backend.list({ queue: this.name, status });
    }
    /**
     * Get a job by ID. Required with a `backend`; equals getJob() otherwise.
     */
    async getJobAsync(id) {
        if (!this.backend)
            return this.getJob(id);
        const job = await this.backend.get(id);
        return job && job.queue === this.name ? job : undefined;
    }
    /**
     * Queue statistics. Required with a `backend`; equals getStats() otherwise.
     */
    async getStatsAsync() {
        if (!this.backend)
            return this.getStats();
        return this.backend.counts(this.name);
    }
    /**
     * Remove completed, failed and cancelled jobs. Required with a `backend`;
     * equals purge() otherwise.
     */
    async purgeAsync() {
        if (!this.backend)
            return this.purge();
        await this.backend.purge(this.name, [...this.activeRuns.keys()]);
    }
    /**
     * Cancel a job (see cancel()). Required with a `backend`; equals cancel()
     * otherwise. With a backend, a job that is active on another server is
     * marked cancelled at once; that server aborts it on its next poll.
     */
    async cancelAsync(jobId) {
        if (!this.backend)
            return this.cancel(jobId);
        const job = await this.backend.cancel(jobId, new Date());
        if (!job)
            return false;
        const run = this.activeRuns.get(job.id);
        if (run) {
            run.controller.abort(new Error(`Job '${job.name}' was cancelled`));
            run.interrupt({ kind: 'cancelled' });
        }
        this.safeEmit('cancelled', job);
        return true;
    }
    assertSync(method) {
        if (this.backend) {
            throw new Error(`Queue '${this.name}' uses an async backend; use ${method}Async() instead of ${method}()`);
        }
    }
    // ─── Backend processing ───────────────────────────────────────────────────────
    // Run a tick as soon as possible (a job was added or a slot was freed)
    wake() {
        if (this.running && this.backend)
            this.scheduleTick(0);
    }
    scheduleTick(delay) {
        if (!this.running)
            return;
        if (this.tickInFlight) {
            this.tickAgain = true;
            return;
        }
        if (this.backendTimer)
            clearTimeout(this.backendTimer);
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
    async backendTick() {
        const backend = this.backend;
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
                for (const job of jobs)
                    this.startClaimed(job);
            }
            if (this.backendFailing) {
                this.backendFailing = false;
                this.log('info', `'${this.name}' backend recovered`);
            }
        }
        catch (err) {
            this.reportBackendError(err);
        }
    }
    startClaimed(job) {
        const handler = this.handlers.get(job.name);
        if (!handler) {
            job.status = 'failed';
            job.attempts = Math.max(0, job.attempts - 1); // not an attempt
            job.finishedAt = new Date();
            job.error = `No handler registered for job '${job.name}'`;
            this.backend.fail(job, this.workerId).then(owned => { if (owned)
                this.safeEmit('failed', job, new Error(job.error)); }, err => this.reportBackendError(err));
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
    async runBackendJob(job, handler) {
        const backend = this.backend;
        const outcome = await this.runAttempt(job, handler);
        if (outcome.kind === 'cancelled')
            return;
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
            }
            else {
                job.status = 'failed';
                job.finishedAt = new Date();
                job.error = err.message;
                job.stack = err.stack;
                if (await backend.fail(job, this.workerId)) {
                    this.safeEmit('failed', job, err);
                }
            }
        }
        catch (err) {
            // The job stays active in the backend and is recovered once its lock expires
            this.reportBackendError(err);
        }
    }
    reportBackendError(err) {
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