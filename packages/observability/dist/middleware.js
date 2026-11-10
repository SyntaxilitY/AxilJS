"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.observabilityMiddleware = observabilityMiddleware;
exports.metricsHandler = metricsHandler;
/**
 * Create observability middleware.
 * Tracks request count, duration, and distributed traces.
 */
function observabilityMiddleware(options = {}) {
    const { metrics, tracer, pathLabel, propagate = true } = options;
    // Create standard HTTP metrics if registry provided
    const requestCounter = metrics?.counter('http_requests_total', 'Total HTTP requests', ['method', 'path', 'status']);
    const requestDuration = metrics?.histogram('http_request_duration_ms', 'HTTP request duration in milliseconds', [5, 10, 25, 50, 100, 250, 500, 1000, 2500], ['method', 'path']);
    const activeRequests = metrics?.gauge('http_active_requests', 'Number of active HTTP requests');
    return (req, res, next) => {
        const startTime = Date.now();
        // Start a trace span if tracer is configured, continuing the caller's
        // trace when a valid traceparent (or B3) header is present
        const span = tracer?.startSpan('http.request', propagate
            ? { parent: tracer.extractContext(req.headers || {}) }
            : {});
        if (span) {
            span.setAttributes({
                'http.method': req.method,
                'http.url': req.url,
                'http.path': req.path
            });
            // Attach trace IDs to response headers
            const traceHeaders = tracer.injectContext(span);
            Object.entries(traceHeaders).forEach(([k, v]) => res.header(k, v));
        }
        // Track active requests
        activeRequests?.inc();
        // Override res.raw.end to capture response details
        const originalEnd = res.raw.end.bind(res.raw);
        let recorded = false;
        res.raw.end = function (...args) {
            // Record once even if end() is called multiple times
            if (recorded)
                return originalEnd(...args);
            recorded = true;
            const duration = Date.now() - startTime;
            const status = String(res.raw.statusCode);
            let path = req.path;
            if (pathLabel) {
                try {
                    path = pathLabel(req) || req.path;
                }
                catch {
                    // Fall back to the raw path if the label function fails
                }
            }
            // Record metrics
            requestCounter?.inc({ method: req.method, path, status });
            requestDuration?.observe(duration, { method: req.method, path });
            activeRequests?.dec();
            // End trace span
            if (span) {
                const spanData = span
                    .setAttribute('http.status_code', res.raw.statusCode)
                    .setStatus(res.raw.statusCode < 500 ? 'ok' : 'error')
                    .end();
                // Export the finished span (previously ended but never exported)
                try {
                    tracer.exportSpan(spanData);
                }
                catch {
                    // Never let a failing exporter break the response
                }
            }
            return originalEnd(...args);
        };
        next();
    };
}
/**
 * Create a route handler that serves Prometheus metrics.
 * Mount at GET /metrics.
 */
function metricsHandler(registry) {
    return (req, res) => {
        res.header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
        res.text(registry.toPrometheus());
    };
}
//# sourceMappingURL=middleware.js.map