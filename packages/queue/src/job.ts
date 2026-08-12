/**
 * Job definitions and types for the queue system.
 */

import { randomUUID } from 'crypto';

// ─── Job Status ───────────────────────────────────────────────────────────────

export type JobStatus =
  | 'pending'    // Waiting to be processed
  | 'active'     // Currently being processed
  | 'completed'  // Successfully completed
  | 'failed'     // Failed after all retries
  | 'delayed'    // Waiting for delay to expire
  | 'cancelled'; // Manually cancelled

// ─── Job ─────────────────────────────────────────────────────────────────────

export interface Job<T = unknown> {
  // Unique job ID
  id: string;

  // Queue name this job belongs to
  queue: string;

  // Job name/type (determines which handler processes it)
  name: string;

  // Job payload data
  data: T;

  // Current status
  status: JobStatus;

  // Number of times this job has been attempted
  attempts: number;

  // Max number of attempts before marking as failed
  maxAttempts: number;

  // Delay before first attempt (ms)
  delay: number;

  // Priority (higher = processed first)
  priority: number;

  // When the job was created
  createdAt: Date;

  // When processing started
  startedAt?: Date;

  // When processing completed or failed
  finishedAt?: Date;

  // Error message if failed
  error?: string;

  // Error stack trace if failed
  stack?: string;

  // Result data from the handler
  result?: unknown;

  // When to run (for delayed/scheduled jobs)
  runAt: Date;
}

// ─── Job Options ──────────────────────────────────────────────────────────────

export interface JobOptions {
  // Max retry attempts (default: 3)
  maxAttempts?: number;

  // Delay before first attempt in ms (default: 0)
  delay?: number;

  // Job priority (default: 0, higher = sooner)
  priority?: number;

  // Specific time to run the job (overrides delay)
  runAt?: Date;
}

// ─── Job Handler ─────────────────────────────────────────────────────────────

export type JobHandler<T = unknown> = (job: Job<T>) => Promise<unknown>;

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createJob<T>(
  queue: string,
  name: string,
  data: T,
  options: JobOptions = {}
): Job<T> {
  const now = new Date();
  const delay = options.delay || 0;

  return {
    id: randomUUID(),
    queue,
    name,
    data,
    status: delay > 0 ? 'delayed' : 'pending',
    attempts: 0,
    maxAttempts: options.maxAttempts ?? 3,
    delay,
    priority: options.priority ?? 0,
    createdAt: now,
    runAt: options.runAt || new Date(now.getTime() + delay)
  };
}