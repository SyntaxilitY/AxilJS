/**
 * Distributed Tracing.
 * Track requests across services using trace/span IDs.
 * Compatible with OpenTelemetry trace format.
 *
 * Usage:
 *   const tracer = new Tracer({ serviceName: 'user-service' })
 *
 *   // Create a root span
 *   const span = tracer.startSpan('http.request')
 *   span.setAttribute('http.method', 'GET')
 *   span.setAttribute('http.url', '/users')
 *
 *   try {
 *     const result = await processRequest()
 *     span.setStatus('ok')
 *     return result
 *   } catch (err) {
 *     span.setStatus('error', err.message)
 *     throw err
 *   } finally {
 *     span.end()
 *   }
 */
export type SpanStatus = 'unset' | 'ok' | 'error';
export interface SpanData {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
    name: string;
    startTime: number;
    endTime?: number;
    status: SpanStatus;
    statusMessage?: string;
    attributes: Record<string, string | number | boolean>;
    events: Array<{
        name: string;
        timestamp: number;
        attributes?: Record<string, unknown>;
    }>;
    serviceName: string;
}
export declare class Span {
    private data;
    private ended;
    constructor(name: string, serviceName: string, traceId?: string, parentSpanId?: string);
    get traceId(): string;
    get spanId(): string;
    setAttribute(key: string, value: string | number | boolean): this;
    setAttributes(attrs: Record<string, string | number | boolean>): this;
    setStatus(status: SpanStatus, message?: string): this;
    addEvent(name: string, attributes?: Record<string, unknown>): this;
    startChild(name: string): Span;
    end(): SpanData;
    get durationMs(): number;
    isEnded(): boolean;
}
export interface SpanContext {
    traceId?: string;
    spanId?: string;
}
export interface StartSpanOptions {
    parent?: Span | SpanContext;
}
export interface TracerOptions {
    serviceName: string;
    exporter?: (span: SpanData) => void;
}
export declare class Tracer {
    private serviceName;
    private exporter;
    private spans;
    private maxSpans;
    constructor(options: TracerOptions);
    /**
     * Start a new span.
     * Without options (or with an invalid parent context) this is a new root span.
     *
     *   const ctx  = tracer.extractContext(req.headers)
     *   const span = tracer.startSpan('http.request', { parent: ctx })
     */
    startSpan(name: string, options?: StartSpanOptions): Span;
    /**
     * Execute a function within a span.
     * Automatically ends the span when done.
     */
    trace<T>(name: string, fn: (span: Span) => Promise<T>, parentSpan?: Span): Promise<T>;
    /**
     * Hand a finished span to the configured exporter
     * (used for spans not created via trace(), e.g. by middleware).
     */
    exportSpan(span: SpanData): void;
    /**
     * Get stored spans (when using default in-memory exporter).
     */
    getSpans(): SpanData[];
    /**
     * Extract trace context from HTTP headers.
     * Allows tracing across service boundaries.
     */
    extractContext(headers: Record<string, string | string[] | undefined>): {
        traceId?: string;
        spanId?: string;
    };
    /**
     * Inject trace context into HTTP headers.
     */
    injectContext(span: Span): Record<string, string>;
}
//# sourceMappingURL=tracing.d.ts.map