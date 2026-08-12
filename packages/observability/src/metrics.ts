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

// ─── Label Types ──────────────────────────────────────────────────────────────

type Labels = Record<string, string>;

function labelsToKey(labels: Labels): string {
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v}"`)
    .join(',');
}

// ─── Counter ─────────────────────────────────────────────────────────────────

export class Counter {
  private values = new Map<string, number>();

  constructor(
    public readonly name: string,
    public readonly help: string,
    public readonly labelNames: string[] = []
  ) {}

  /**
   * Increment the counter by 1 (or specified amount).
   */
  inc(labels: Labels = {}, amount: number = 1): void {
    const key = labelsToKey(labels);
    this.values.set(key, (this.values.get(key) || 0) + amount);
  }

  /**
   * Get the current value.
   */
  get(labels: Labels = {}): number {
    return this.values.get(labelsToKey(labels)) || 0;
  }

  toPrometheus(): string {
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

// ─── Gauge ────────────────────────────────────────────────────────────────────

export class Gauge {
  private values = new Map<string, number>();

  constructor(
    public readonly name: string,
    public readonly help: string,
    public readonly labelNames: string[] = []
  ) {}

  set(value: number, labels: Labels = {}): void {
    this.values.set(labelsToKey(labels), value);
  }

  inc(labels: Labels = {}, amount: number = 1): void {
    const key = labelsToKey(labels);
    this.values.set(key, (this.values.get(key) || 0) + amount);
  }

  dec(labels: Labels = {}, amount: number = 1): void {
    this.inc(labels, -amount);
  }

  get(labels: Labels = {}): number {
    return this.values.get(labelsToKey(labels)) || 0;
  }

  toPrometheus(): string {
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

// ─── Histogram ────────────────────────────────────────────────────────────────

const DEFAULT_BUCKETS = [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];

export class Histogram {
  // Map of label key → bucket counts and sum
  private data = new Map<string, {
    buckets: Map<number, number>;
    sum: number;
    count: number;
  }>();

  constructor(
    public readonly name: string,
    public readonly help: string,
    public readonly buckets: number[] = DEFAULT_BUCKETS,
    public readonly labelNames: string[] = []
  ) {}

  /**
   * Record an observation.
   */
  observe(value: number, labels: Labels = {}): void {
    const key = labelsToKey(labels);

    if (!this.data.has(key)) {
      this.data.set(key, {
        buckets: new Map(this.buckets.map(b => [b, 0])),
        sum: 0,
        count: 0
      });
    }

    const entry = this.data.get(key)!;
    entry.sum += value;
    entry.count++;

    // Increment all buckets that are >= the observed value
    for (const [bucket] of entry.buckets) {
      if (value <= bucket) {
        entry.buckets.set(bucket, (entry.buckets.get(bucket) || 0) + 1);
      }
    }
  }

  toPrometheus(): string {
    const lines = [
      `# HELP ${this.name} ${this.help}`,
      `# TYPE ${this.name} histogram`
    ];

    for (const [key, entry] of this.data.entries()) {
      const labelBase = key ? `,${key}` : '';
      let cumulativeCount = 0;

      for (const [bucket, count] of entry.buckets.entries()) {
        cumulativeCount += count;
        lines.push(
          `${this.name}_bucket{le="${bucket}"${labelBase}} ${cumulativeCount}`
        );
      }

      lines.push(`${this.name}_bucket{le="+Inf"${labelBase}} ${entry.count}`);
      lines.push(`${this.name}_sum${key ? `{${key}}` : ''} ${entry.sum}`);
      lines.push(`${this.name}_count${key ? `{${key}}` : ''} ${entry.count}`);
    }

    return lines.join('\n');
  }
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export class MetricsRegistry {
  private metrics: Array<Counter | Gauge | Histogram> = [];

  counter(name: string, help: string, labelNames: string[] = []): Counter {
    const metric = new Counter(name, help, labelNames);
    this.metrics.push(metric);
    return metric;
  }

  gauge(name: string, help: string, labelNames: string[] = []): Gauge {
    const metric = new Gauge(name, help, labelNames);
    this.metrics.push(metric);
    return metric;
  }

  histogram(
    name: string,
    help: string,
    buckets?: number[],
    labelNames: string[] = []
  ): Histogram {
    const metric = new Histogram(name, help, buckets, labelNames);
    this.metrics.push(metric);
    return metric;
  }

  /**
   * Generate Prometheus-format metrics output.
   * Serve this at GET /metrics.
   */
  toPrometheus(): string {
    return this.metrics.map(m => m.toPrometheus()).join('\n\n') + '\n';
  }
}