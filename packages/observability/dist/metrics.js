"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricsRegistry = exports.Histogram = exports.Gauge = exports.Counter = void 0;
function labelsToKey(labels) {
    return Object.entries(labels)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}="${v}"`)
        .join(',');
}
// ─── Counter ─────────────────────────────────────────────────────────────────
class Counter {
    name;
    help;
    labelNames;
    values = new Map();
    constructor(name, help, labelNames = []) {
        this.name = name;
        this.help = help;
        this.labelNames = labelNames;
    }
    /**
     * Increment the counter by 1 (or specified amount).
     */
    inc(labels = {}, amount = 1) {
        const key = labelsToKey(labels);
        this.values.set(key, (this.values.get(key) || 0) + amount);
    }
    /**
     * Get the current value.
     */
    get(labels = {}) {
        return this.values.get(labelsToKey(labels)) || 0;
    }
    toPrometheus() {
        const lines = [
            `# HELP ${this.name} ${this.help}`,
            `# TYPE ${this.name} counter`
        ];
        for (const [key, value] of this.values.entries()) {
            const labelStr = key ? `{${key}}` : '';
            lines.push(`${this.name}${labelStr} ${value}`);
        }
        return lines.join('\n');
    }
}
exports.Counter = Counter;
// ─── Gauge ────────────────────────────────────────────────────────────────────
class Gauge {
    name;
    help;
    labelNames;
    values = new Map();
    constructor(name, help, labelNames = []) {
        this.name = name;
        this.help = help;
        this.labelNames = labelNames;
    }
    set(value, labels = {}) {
        this.values.set(labelsToKey(labels), value);
    }
    inc(labels = {}, amount = 1) {
        const key = labelsToKey(labels);
        this.values.set(key, (this.values.get(key) || 0) + amount);
    }
    dec(labels = {}, amount = 1) {
        this.inc(labels, -amount);
    }
    get(labels = {}) {
        return this.values.get(labelsToKey(labels)) || 0;
    }
    toPrometheus() {
        const lines = [
            `# HELP ${this.name} ${this.help}`,
            `# TYPE ${this.name} gauge`
        ];
        for (const [key, value] of this.values.entries()) {
            const labelStr = key ? `{${key}}` : '';
            lines.push(`${this.name}${labelStr} ${value}`);
        }
        return lines.join('\n');
    }
}
exports.Gauge = Gauge;
// ─── Histogram ────────────────────────────────────────────────────────────────
const DEFAULT_BUCKETS = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
class Histogram {
    name;
    help;
    buckets;
    labelNames;
    // Map of label key → bucket counts and sum
    data = new Map();
    constructor(name, help, buckets = DEFAULT_BUCKETS, labelNames = []) {
        this.name = name;
        this.help = help;
        this.buckets = buckets;
        this.labelNames = labelNames;
    }
    /**
     * Record an observation.
     */
    observe(value, labels = {}) {
        const key = labelsToKey(labels);
        if (!this.data.has(key)) {
            this.data.set(key, {
                buckets: new Map(this.buckets.map(b => [b, 0])),
                sum: 0,
                count: 0
            });
        }
        const entry = this.data.get(key);
        entry.sum += value;
        entry.count++;
        // Increment all buckets that are >= the observed value
        for (const [bucket] of entry.buckets) {
            if (value <= bucket) {
                entry.buckets.set(bucket, (entry.buckets.get(bucket) || 0) + 1);
            }
        }
    }
    toPrometheus() {
        const lines = [
            `# HELP ${this.name} ${this.help}`,
            `# TYPE ${this.name} histogram`
        ];
        for (const [key, entry] of this.data.entries()) {
            const labelBase = key ? `,${key}` : '';
            let cumulativeCount = 0;
            for (const [bucket, count] of entry.buckets.entries()) {
                cumulativeCount += count;
                lines.push(`${this.name}_bucket{le="${bucket}"${labelBase}} ${cumulativeCount}`);
            }
            lines.push(`${this.name}_bucket{le="+Inf"${labelBase}} ${entry.count}`);
            lines.push(`${this.name}_sum${key ? `{${key}}` : ''} ${entry.sum}`);
            lines.push(`${this.name}_count${key ? `{${key}}` : ''} ${entry.count}`);
        }
        return lines.join('\n');
    }
}
exports.Histogram = Histogram;
// ─── Registry ─────────────────────────────────────────────────────────────────
class MetricsRegistry {
    metrics = [];
    counter(name, help, labelNames = []) {
        const metric = new Counter(name, help, labelNames);
        this.metrics.push(metric);
        return metric;
    }
    gauge(name, help, labelNames = []) {
        const metric = new Gauge(name, help, labelNames);
        this.metrics.push(metric);
        return metric;
    }
    histogram(name, help, buckets, labelNames = []) {
        const metric = new Histogram(name, help, buckets, labelNames);
        this.metrics.push(metric);
        return metric;
    }
    /**
     * Generate Prometheus-format metrics output.
     * Serve this at GET /metrics.
     */
    toPrometheus() {
        return this.metrics.map(m => m.toPrometheus()).join('\n\n') + '\n';
    }
}
exports.MetricsRegistry = MetricsRegistry;
//# sourceMappingURL=metrics.js.map