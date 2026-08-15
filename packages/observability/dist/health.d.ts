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
import { RouteHandler } from '@axil/common';
export type CheckStatus = 'healthy' | 'unhealthy' | 'degraded';
export interface CheckResult {
    status: CheckStatus;
    message?: string;
    responseTimeMs: number;
    details?: Record<string, unknown>;
}
export interface HealthStatus {
    status: CheckStatus;
    timestamp: string;
    uptime: number;
    version: string;
    checks: Record<string, CheckResult>;
}
type CheckFn = () => Promise<void | {
    message?: string;
    details?: Record<string, unknown>;
}>;
export declare class HealthChecker {
    private checks;
    private startTime;
    /**
     * Register a health check.
     *
     * @param name   Check name (shown in response)
     * @param check  Async function - throw to indicate failure
     */
    addCheck(name: string, check: CheckFn): this;
    /**
     * Run all health checks and return the status.
     */
    check(): Promise<HealthStatus>;
    /**
     * Create a route handler for GET /health.
     * Returns 200 if healthy, 503 if unhealthy.
     */
    handler(): RouteHandler;
    /**
     * Liveness probe - is the application running?
     * Returns 200 always (if the server is running, it's alive).
     * Used by Kubernetes to decide if the pod should be @axilarted.
     */
    livenessHandler(): RouteHandler;
    /**
     * Readiness probe - is the application ready to receive traffic?
     * Runs actual dependency checks. Returns 503 if not ready.
     * Used by Kubernetes to decide if traffic should be routed here.
     */
    readinessHandler(): RouteHandler;
}
export {};
//# sourceMappingURL=health.d.ts.map