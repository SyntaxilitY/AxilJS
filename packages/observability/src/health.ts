/**
 * Health check system.
 * Monitors the health of application dependencies.
 * Used by load balancers, Kubernetes, and monitoring tools.
 *
 * Usage:
 *   const health = new HealthChecker()
 *
 *   health.addCheck('database', async () => {
 *     await db.ping()
 *     return { message: 'Connected' }
 *   })
 *
 *   health.addCheck('redis', async () => {
 *     await redis.ping()
 *   })
 *
 *   // Register health endpoints
 *   app.get('/health', health.handler())
 *   app.get('/health/live', health.livenessHandler())
 *   app.get('/health/ready', health.readinessHandler())
 */

import { RouteHandler } from '@axiljs/common';

// ─── Health Check Types ───────────────────────────────────────────────────────

export type CheckStatus = 'healthy' | 'unhealthy' | 'degraded';

export interface CheckResult {
  // Status of this specific check
  status: CheckStatus;

  // Optional message
  message?: string;

  // Response time in ms
  responseTimeMs: number;

  // Extra info (version, connection count, etc.)
  details?: Record<string, unknown>;
}

export interface HealthStatus {
  // Overall status
  status: CheckStatus;

  // ISO timestamp
  timestamp: string;

  // Application uptime in seconds
  uptime: number;

  // Node.js version
  version: string;

  // Individual check results
  checks: Record<string, CheckResult>;
}

// ─── Check Function ───────────────────────────────────────────────────────────

type CheckFn = () => Promise<void | { message?: string; details?: Record<string, unknown> }>;

export interface CheckOptions {
  // Fail the check (unhealthy) if it doesn't settle in time (default: 5000ms,
  // or the HealthChecker's defaultTimeoutMs). 0 disables the timeout.
  timeoutMs?: number;
}

export interface HealthCheckerOptions {
  // Default per-check timeout in ms (default: 5000). 0 disables.
  defaultTimeoutMs?: number;
}

const DEFAULT_CHECK_TIMEOUT_MS = 5000;

// ─── Health Checker ───────────────────────────────────────────────────────────

export class HealthChecker {
  private checks = new Map<string, CheckFn>();
  private checkTimeouts = new Map<string, number>();
  private startTime = Date.now();
  private defaultTimeoutMs: number;

  constructor(options: HealthCheckerOptions = {}) {
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS;
  }

  /**
   * Register a health check.
   *
   * @param name   Check name (shown in response)
   * @param check  Async function - throw to indicate failure
   * @param options  { timeoutMs } - a check that hangs longer is reported unhealthy
   */
  addCheck(name: string, check: CheckFn, options: CheckOptions = {}): this {
    this.checks.set(name, check);
    this.checkTimeouts.set(name, options.timeoutMs ?? this.defaultTimeoutMs);
    return this;
  }

  /**
   * Run all health checks and return the status.
   */
  async check(): Promise<HealthStatus> {
    const results: Record<string, CheckResult> = {};
    let overallStatus: CheckStatus = 'healthy';

    await Promise.all(
      Array.from(this.checks.entries()).map(async ([name, fn]) => {
        const start = Date.now();

        try {
          const result = await this.runWithTimeout(name, fn);
          const responseTimeMs = Date.now() - start;

          results[name] = {
            status: 'healthy',
            responseTimeMs,
            message: result?.message,
            details: result?.details
          };
        } catch (error) {
          const responseTimeMs = Date.now() - start;

          results[name] = {
            status: 'unhealthy',
            responseTimeMs,
            message: (error as Error).message
          };

          overallStatus = 'unhealthy';
        }
      })
    );

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      version: process.version,
      checks: results
    };
  }

  /**
   * Run a check, rejecting if it exceeds its timeout.
   */
  private runWithTimeout(name: string, fn: CheckFn): ReturnType<CheckFn> {
    const timeoutMs = this.checkTimeouts.get(name) ?? this.defaultTimeoutMs;
    const run = Promise.resolve().then(fn);
    if (!timeoutMs || timeoutMs <= 0) return run;

    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Health check '${name}' timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      timer.unref?.();
    });

    return Promise.race([run, timeout]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  }

  /**
   * Create a route handler for GET /health.
   * Returns 200 if healthy, 503 if unhealthy.
   */
  handler(): RouteHandler {
    return async (req, res) => {
      const status = await this.check();
      const httpStatus = status.status === 'healthy' ? 200 : 503;
      res.status(httpStatus).json(status);
    };
  }

  /**
   * Liveness probe - is the application running?
   * Returns 200 always (if the server is running, it's alive).
   * Used by Kubernetes to decide if the pod should be @axiljsarted.
   */
  livenessHandler(): RouteHandler {
    return (req, res) => {
      res.json({
        status: 'alive',
        timestamp: new Date().toISOString(),
        uptime: Math.floor((Date.now() - this.startTime) / 1000)
      });
    };
  }

  /**
   * Readiness probe - is the application ready to receive traffic?
   * Runs actual dependency checks. Returns 503 if not ready.
   * Used by Kubernetes to decide if traffic should be routed here.
   */
  readinessHandler(): RouteHandler {
    return async (req, res) => {
      const status = await this.check();
      const ready = status.status !== 'unhealthy';
      res.status(ready ? 200 : 503).json({
        ready,
        timestamp: status.timestamp,
        checks: status.checks
      });
    };
  }
}