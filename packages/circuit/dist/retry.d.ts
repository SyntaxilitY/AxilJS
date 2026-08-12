/**
 * Retry utility.
 * Retry async operations with configurable backoff strategies.
 *
 * Usage:
 *   const result = await retry(
 *     () => fetchData(),
 *     { attempts: 3, delay: 1000, backoff: 'exponential' }
 *   )
 */
export interface RetryOptions {
    attempts?: number;
    delay?: number;
    backoff?: 'fixed' | 'exponential' | 'linear';
    maxDelay?: number;
    jitter?: boolean;
    retryIf?: (error: Error) => boolean;
    onRetry?: (attempt: number, error: Error, delay: number) => void;
}
/**
 * Retry an async operation with backoff.
 *
 * @param fn       The operation to retry
 * @param options  Retry configuration
 */
export declare function retry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T>;
/**
 * Add a timeout to any async operation.
 * Throws if the operation doesn't complete within the timeout.
 *
 * Usage:
 *   const result = await withTimeout(fetchData(), 5000)
 */
export declare function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message?: string): Promise<T>;
//# sourceMappingURL=retry.d.ts.map