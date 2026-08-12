"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.retry = retry;
exports.withTimeout = withTimeout;
// ─── Retry ────────────────────────────────────────────────────────────────────
/**
 * Retry an async operation with backoff.
 *
 * @param fn       The operation to retry
 * @param options  Retry configuration
 */
async function retry(fn, options = {}) {
    const { attempts = 3, delay = 1000, backoff = 'exponential', maxDelay = 30000, jitter = true, retryIf = () => true, onRetry } = options;
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            // Check if we should retry this error
            if (!retryIf(lastError)) {
                throw lastError;
            }
            // Last attempt - don't delay, just throw
            if (attempt === attempts) {
                throw lastError;
            }
            // Calculate delay for next attempt
            const nextDelay = calculateDelay(attempt, delay, backoff, maxDelay, jitter);
            // Notify of retry
            onRetry?.(attempt, lastError, nextDelay);
            // Wait before retrying
            await sleep(nextDelay);
        }
    }
    throw lastError;
}
/**
 * Calculate delay for the next attempt.
 */
function calculateDelay(attempt, baseDelay, strategy, maxDelay, jitter) {
    let delay;
    switch (strategy) {
        case 'exponential':
            // 1s, 2s, 4s, 8s...
            delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
            break;
        case 'linear':
            // 1s, 2s, 3s, 4s...
            delay = Math.min(baseDelay * attempt, maxDelay);
            break;
        case 'fixed':
        default:
            delay = baseDelay;
            break;
    }
    // Add jitter (±25% random variation to prevent thundering herd)
    if (jitter) {
        const jitterAmount = delay * 0.25;
        delay += (Math.random() * 2 - 1) * jitterAmount;
    }
    return Math.max(0, Math.floor(delay));
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
// ─── Timeout ──────────────────────────────────────────────────────────────────
/**
 * Add a timeout to any async operation.
 * Throws if the operation doesn't complete within the timeout.
 *
 * Usage:
 *   const result = await withTimeout(fetchData(), 5000)
 */
function withTimeout(promise, timeoutMs, message) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(message || `Operation timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        promise
            .then(result => {
            clearTimeout(timer);
            resolve(result);
        })
            .catch(error => {
            clearTimeout(timer);
            reject(error);
        });
    });
}
//# sourceMappingURL=retry.js.map