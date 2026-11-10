/**
 * Metrics collection.
 * Prometheus-compatible metrics.
 * Exposes /metrics endpoint for scraping.
 *
 * Usage:
 *   const metrics = new MetricsRegistry()
 *
 *   const requestCounter = metrics.counter('http_requests_total', 'Total HTTP requests')
 *   const requestDuration = metrics.histogram('http_request_duration_ms', 'Request duration')
 *   const activeConnections = metrics.gauge('active_connections', 'Active connections')
 *
 *   requestCounter.inc({ method: 'GET', path: '/users', status: '200' })
 *   requestDuration.observe(42, { method: 'GET' })
 *   activeConnections.set(15)
 */
type Labels = Record<string, string>;
export declare class Counter {
    readonly name: string;
    readonly help: string;
    readonly labelNames: string[];
    private values;
    constructor(name: string, help: string, labelNames?: string[]);
    /**
     * Increment the counter by 1 (or specified amount).
     */
    inc(labels?: Labels, amount?: number): void;
    /**
     * Get the current value.
     */
    get(labels?: Labels): number;
    toPrometheus(): string;
}
export declare class Gauge {
    readonly name: string;
    readonly help: string;
    readonly labelNames: string[];
    private values;
    constructor(name: string, help: string, labelNames?: string[]);
    set(value: number, labels?: Labels): void;
    inc(labels?: Labels, amount?: number): void;
    dec(labels?: Labels, amount?: number): void;
    get(labels?: Labels): number;
    toPrometheus(): string;
}
export declare class Histogram {
    readonly name: string;
    readonly help: string;
    readonly buckets: number[];
    readonly labelNames: string[];
    private data;
    constructor(name: string, help: string, buckets?: number[], labelNames?: string[]);
    /**
     * Record an observation.
     */
    observe(value: number, labels?: Labels): void;
    toPrometheus(): string;
}
/**
 * Registration is idempotent per name: registering a name again with the
 * same metric type returns the EXISTING metric (its original help, labels
 * and buckets are kept). Registering it with a different type throws.
 */
export declare class MetricsRegistry {
    private metrics;
    counter(name: string, help: string, labelNames?: string[]): Counter;
    gauge(name: string, help: string, labelNames?: string[]): Gauge;
    histogram(name: string, help: string, buckets?: number[], labelNames?: string[]): Histogram;
    /**
     * Look up a metric by name.
     */
    get(name: string): Counter | Gauge | Histogram | undefined;
    private findExisting;
    /**
     * Generate Prometheus-format metrics output.
     * Serve this at GET /metrics.
     */
    toPrometheus(): string;
}
export {};
//# sourceMappingURL=metrics.d.ts.map