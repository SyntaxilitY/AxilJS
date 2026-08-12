"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthChecker = void 0;
// ─── Health Checker ───────────────────────────────────────────────────────────
class HealthChecker {
    checks = new Map();
    startTime = Date.now();
    /**
     * Register a health check.
     *
     * @param name   Check name (shown in response)
     * @param check  Async function - throw to indicate failure
     */
    addCheck(name, check) {
        this.checks.set(name, check);
        return this;
    }
    /**
     * Run all health checks and return the status.
     */
    async check() {
        const results = {};
        let overallStatus = 'healthy';
        await Promise.all(Array.from(this.checks.entries()).map(async ([name, fn]) => {
            const start = Date.now();
            try {
                const result = await fn();
                const responseTimeMs = Date.now() - start;
                results[name] = {
                    status: 'healthy',
                    responseTimeMs,
                    message: result?.message,
                    details: result?.details
                };
            }
            catch (error) {
                const responseTimeMs = Date.now() - start;
                results[name] = {
                    status: 'unhealthy',
                    responseTimeMs,
                    message: error.message
                };
                overallStatus = 'unhealthy';
            }
        }));
        return {
            status: overallStatus,
            timestamp: new Date().toISOString(),
            uptime: Math.floor((Date.now() - this.startTime) / 1000),
            version: process.version,
            checks: results
        };
    }
    /**
     * Create a route handler for GET /health.
     * Returns 200 if healthy, 503 if unhealthy.
     */
    handler() {
        return async (req, res) => {
            const status = await this.check();
            const httpStatus = status.status === 'healthy' ? 200 : 503;
            res.status(httpStatus).json(status);
        };
    }
    /**
     * Liveness probe - is the application running?
     * Returns 200 always (if the server is running, it's alive).
     * Used by Kubernetes to decide if the pod should be restarted.
     */
    livenessHandler() {
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
    readinessHandler() {
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
exports.HealthChecker = HealthChecker;
//# sourceMappingURL=health.js.map