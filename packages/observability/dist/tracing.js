"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.Tracer = exports.Span = void 0;
const crypto_1 = require("crypto");
// ─── ID Generation ────────────────────────────────────────────────────────────
function generateTraceId() {
    return (0, crypto_1.randomBytes)(16).toString('hex'); // 32 hex chars
}
function generateSpanId() {
    return (0, crypto_1.randomBytes)(8).toString('hex'); // 16 hex chars
}
class Span {
    data;
    ended = false;
    constructor(name, serviceName, traceId, parentSpanId) {
        this.data = {
            traceId: traceId || generateTraceId(),
            spanId: generateSpanId(),
            parentSpanId,
            name,
            startTime: Date.now(),
            status: 'unset',
            attributes: {},
            events: [],
            serviceName
        };
    }
    // ─── Getters ─────────────────────────────────────────────────────────────────
    get traceId() { return this.data.traceId; }
    get spanId() { return this.data.spanId; }
    // ─── Attributes ───────────────────────────────────────────────────────────────
    setAttribute(key, value) {
        this.data.attributes[key] = value;
        return this;
    }
    setAttributes(attrs) {
        Object.assign(this.data.attributes, attrs);
        return this;
    }
    // ─── Status ───────────────────────────────────────────────────────────────────
    setStatus(status, message) {
        this.data.status = status;
        this.data.statusMessage = message;
        return this;
    }
    // ─── Events ───────────────────────────────────────────────────────────────────
    addEvent(name, attributes) {
        this.data.events.push({
            name,
            timestamp: Date.now(),
            attributes
        });
        return this;
    }
    // ─── Child Span ───────────────────────────────────────────────────────────────
    startChild(name) {
        return new Span(name, this.data.serviceName, this.traceId, this.spanId);
    }
    // ─── End ─────────────────────────────────────────────────────────────────────
    end() {
        if (!this.ended) {
            this.data.endTime = Date.now();
            this.ended = true;
        }
        return this.data;
    }
    get durationMs() {
        const end = this.data.endTime || Date.now();
        return end - this.data.startTime;
    }
    isEnded() { return this.ended; }
}
exports.Span = Span;
const TRACE_ID_32 = /^[0-9a-f]{32}$/;
const TRACE_ID_16 = /^[0-9a-f]{16}$/;
const SPAN_ID = /^[0-9a-f]{16}$/;
/**
 * Normalize a trace ID to 32 lowercase hex chars (64-bit B3 IDs are
 * left-padded with zeros, as W3C requires). Returns undefined if invalid.
 */
function normalizeTraceId(id) {
    if (!id)
        return undefined;
    const lower = id.trim().toLowerCase();
    if (/^0+$/.test(lower))
        return undefined;
    if (TRACE_ID_32.test(lower))
        return lower;
    if (TRACE_ID_16.test(lower))
        return '0000000000000000' + lower;
    return undefined;
}
function normalizeSpanId(id) {
    if (!id)
        return undefined;
    const lower = id.trim().toLowerCase();
    return SPAN_ID.test(lower) && !/^0+$/.test(lower) ? lower : undefined;
}
class Tracer {
    serviceName;
    exporter;
    spans = [];
    maxSpans = 10000;
    constructor(options) {
        this.serviceName = options.serviceName;
        this.exporter = options.exporter || ((span) => {
            // Default: store in memory
            this.spans.push(span);
            if (this.spans.length > this.maxSpans) {
                this.spans.shift();
            }
        });
    }
    /**
     * Start a new span.
     * Without options (or with an invalid parent context) this is a new root span.
     *
     *   const ctx  = tracer.extractContext(req.headers)
     *   const span = tracer.startSpan('http.request', { parent: ctx })
     */
    startSpan(name, options = {}) {
        const parent = options.parent;
        if (parent instanceof Span) {
            return new Span(name, this.serviceName, parent.traceId, parent.spanId);
        }
        const traceId = normalizeTraceId(parent?.traceId);
        if (traceId) {
            return new Span(name, this.serviceName, traceId, normalizeSpanId(parent?.spanId));
        }
        return new Span(name, this.serviceName);
    }
    /**
     * Execute a function within a span.
     * Automatically ends the span when done.
     */
    async trace(name, fn, parentSpan) {
        const span = parentSpan
            ? parentSpan.startChild(name)
            : this.startSpan(name);
        try {
            const result = await fn(span);
            span.setStatus('ok');
            return result;
        }
        catch (error) {
            span.setStatus('error', error.message);
            throw error;
        }
        finally {
            const data = span.end();
            this.exporter(data);
        }
    }
    /**
     * Hand a finished span to the configured exporter
     * (used for spans not created via trace(), e.g. by middleware).
     */
    exportSpan(span) {
        this.exporter(span);
    }
    /**
     * Get stored spans (when using default in-memory exporter).
     */
    getSpans() {
        return [...this.spans];
    }
    /**
     * Extract trace context from HTTP headers.
     * Allows tracing across service boundaries.
     */
    extractContext(headers) {
        // W3C Trace Context format
        // version-traceid(32 hex)-parentid(16 hex)-flags; all-zero ids and version ff are invalid
        const traceparent = headers['traceparent'];
        if (traceparent) {
            const parts = traceparent.trim().split('-');
            if (parts.length >= 4 &&
                /^[0-9a-f]{2}$/.test(parts[0]) && parts[0] !== 'ff' &&
                /^[0-9a-f]{32}$/.test(parts[1]) && !/^0+$/.test(parts[1]) &&
                /^[0-9a-f]{16}$/.test(parts[2]) && !/^0+$/.test(parts[2]) &&
                /^[0-9a-f]{2}$/.test(parts[3]) &&
                (parts[0] !== '00' || parts.length === 4)) {
                return { traceId: parts[1], spanId: parts[2] };
            }
        }
        // Fallback: Zipkin B3 format
        return {
            traceId: headers['x-b3-traceid'],
            spanId: headers['x-b3-spanid']
        };
    }
    /**
     * Inject trace context into HTTP headers.
     */
    injectContext(span) {
        return {
            'traceparent': `00-${span.traceId}-${span.spanId}-01`,
            'x-b3-traceid': span.traceId,
            'x-b3-spanid': span.spanId
        };
    }
}
exports.Tracer = Tracer;
//# sourceMappingURL=tracing.js.map