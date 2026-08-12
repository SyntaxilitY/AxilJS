/**
 * Monitoring Dashboard.
 * Simple HTML dashboard showing live metrics, logs, and health.
 * Served at /dashboard.
 */
import { RouteHandler } from '@restjs/common';
import { MetricsRegistry } from '@restjs/observability';
export declare function createDashboard(registry: MetricsRegistry): RouteHandler;
//# sourceMappingURL=dashboard.d.ts.map