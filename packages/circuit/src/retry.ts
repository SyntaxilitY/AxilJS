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

// ─── Options ──────────────────────────────────────────────────────────────────

export interface RetryOptions {
  // Number of attempts (default: 3)
  attempts?: number;

  // Base delay between attempts in ms (default: 1000)
  delay?: number;

  // Backoff strategy (default: 'exponential')
  backoff?: 'fixed' | 'exponential' | 'linear';

  // Max delay cap for exponential backoff (default: 30000)
  maxDelay?: number;

  // Jitter: add random delay to prevent thundering herd (default: true)
  jitter?: boolean;

  // Function to determine if an error is retryable (default: always retry)
  retryIf?: (error: Error) => boolean;

  // Called before each retry
  onRetry?: (attempt: number, error: Error, delay: number) => void;
}

// ─── Retry ────────────────────────────────────────────────────────────────────

/**
 * Retry an async operation with backoff.
 *
 * @param fn       The operation to retry
 * @param options  Retry configuration
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    attempts = 3,
    delay = 1000,
    backoff = 'exponential',
    maxDelay = 30000,
    jitter = true,
    retryIf = () => true,
    onRetry
  } = options;

  let lastError: Error;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
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

  throw lastError!;
}

/**
 * Calculate delay for the next attempt.
 */
function calculateDelay(
  attempt: number,
  baseDelay: number,
  strategy: string,
  maxDelay: number,
  jitter: boolean
): number {
  let delay: number;

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

function sleep(ms: number): Promise<void> {
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
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message?: string
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new Error(message || `Operation timed out after ${timeoutMs}ms`)
      );
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