/**
 * Observability middleware.
 * Automatically tracks metrics and traces for all HTTP requests.
 *
 * Usage:
 *   const metrics = new MetricsRegistry()
 *   const tracer = new Tracer({ serviceName: 'my-api' })
 *
 *   app.use(observabilityMiddleware({ metrics, tracer }))
 *   app.get('/metrics', metricsHandler(metrics))
 */
import { MiddlewareFn, RouteHandler } from '@axil/common';
import { MetricsRegistry } from './metrics';
import { Tracer } from './tracing';
export interface ObservabilityOptions {
    metrics?: MetricsRegistry;
    tracer?: Tracer;
}
/**
 * Create observability middleware.
 * Tracks request count, duration, and distributed traces.
 */
export declare function observabilityMiddleware(options?: ObservabilityOptions): MiddlewareFn;
/**
 * Create a route handler that serves Prometheus metrics.
 * Mount at GET /metrics.
 */
export declare function metricsHandler(registry: MetricsRegistry): RouteHandler;
//# sourceMappingURL=middleware.d.ts.map