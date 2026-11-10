/**
 * Job definitions and types for the queue system.
 */
export type JobStatus = 'pending' | 'active' | 'completed' | 'failed' | 'delayed' | 'cancelled';
export interface Job<T = unknown> {
    id: string;
    queue: string;
    name: string;
    data: T;
    status: JobStatus;
    attempts: number;
    maxAttempts: number;
    delay: number;
    priority: number;
    createdAt: Date;
    startedAt?: Date;
    finishedAt?: Date;
    error?: string;
    stack?: string;
    result?: unknown;
    runAt: Date;
    timeoutMs?: number;
}
export interface JobOptions {
    maxAttempts?: number;
    delay?: number;
    priority?: number;
    runAt?: Date;
    timeoutMs?: number;
}
export interface JobContext {
    signal: AbortSignal;
}
export type JobHandler<T = unknown> = (job: Job<T>, context?: JobContext) => Promise<unknown>;
export declare function createJob<T>(queue: string, name: string, data: T, options?: JobOptions): Job<T>;
//# sourceMappingURL=job.d.ts.map