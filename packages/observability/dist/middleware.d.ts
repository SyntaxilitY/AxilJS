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
 *
 * With a tracer, the request's server span is exposed to later middleware
 * and handlers as req.locals.span (plus req.locals.tracer and
 * req.locals.traceContext) so they can create child spans and propagate the
 * trace to downstream calls:
 *
 *   await tracer.trace('db.query', async () => db.query(sql), getRequestSpan(req))
 */
import { MiddlewareFn, RouteHandler, axilRequest } from '@axiljs/common';
import { MetricsRegistry } from './metrics';
import { Tracer, Span, SpanContext } from './tracing';
export interface ObservabilityOptions {
    metrics?: MetricsRegistry;
    tracer?: Tracer;
    pathLabel?: (req: axilRequest) => string;
    propagate?: boolean;
}
/**
 * Create observability middleware.
 * Tracks request count, duration, and distributed traces.
 */
export declare function observabilityMiddleware(options?: ObservabilityOptions): MiddlewareFn;
/**
 * The server span observabilityMiddleware started for this request
 * (req.locals.span), or undefined when no tracer is configured.
 */
export declare function getRequestSpan(req: axilRequest): Span | undefined;
/**
 * Trace context ({ traceId, spanId }) of the request's server span
 * (req.locals.traceContext), or undefined when no tracer is configured.
 */
export declare function getTraceContext(req: axilRequest): SpanContext | undefined;
/**
 * Create a route handler that serves Prometheus metrics.
 * Mount at GET /metrics.
 */
export declare function metricsHandler(registry: MetricsRegistry): RouteHandler;
//# sourceMappingURL=middleware.d.ts.map