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

import { randomBytes } from 'crypto';

// ─── ID Generation ────────────────────────────────────────────────────────────

function generateTraceId(): string {
  return randomBytes(16).toString('hex'); // 32 hex chars
}

function generateSpanId(): string {
  return randomBytes(8).toString('hex');  // 16 hex chars
}

// ─── Span ─────────────────────────────────────────────────────────────────────

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
  events: Array<{ name: string; timestamp: number; attributes?: Record<string, unknown> }>;
  serviceName: string;
}

export class Span {
  private data: SpanData;
  private ended = false;

  constructor(
    name: string,
    serviceName: string,
    traceId?: string,
    parentSpanId?: string
  ) {
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

  get traceId(): string { return this.data.traceId; }
  get spanId(): string { return this.data.spanId; }

  // ─── Attributes ───────────────────────────────────────────────────────────────

  setAttribute(key: string, value: string | number | boolean): this {
    this.data.attributes[key] = value;
    return this;
  }

  setAttributes(attrs: Record<string, string | number | boolean>): this {
    Object.assign(this.data.attributes, attrs);
    return this;
  }

  // ─── Status ───────────────────────────────────────────────────────────────────

  setStatus(status: SpanStatus, message?: string): this {
    this.data.status = status;
    this.data.statusMessage = message;
    return this;
  }

  // ─── Events ───────────────────────────────────────────────────────────────────

  addEvent(name: string, attributes?: Record<string, unknown>): this {
    this.data.events.push({
      name,
      timestamp: Date.now(),
      attributes
    });
    return this;
  }

  // ─── Child Span ───────────────────────────────────────────────────────────────

  startChild(name: string): Span {
    return new Span(name, this.data.serviceName, this.traceId, this.spanId);
  }

  // ─── End ─────────────────────────────────────────────────────────────────────

  end(): SpanData {
    if (!this.ended) {
      this.data.endTime = Date.now();
      this.ended = true;
    }
    return this.data;
  }

  get durationMs(): number {
    const end = this.data.endTime || Date.now();
    return end - this.data.startTime;
  }

  isEnded(): boolean { return this.ended; }
}

// ─── Tracer ───────────────────────────────────────────────────────────────────

export interface TracerOptions {
  serviceName: string;

  // Called when a span ends (for exporting to Jaeger, Zipkin, etc.)
  exporter?: (span: SpanData) => void;
}

export class Tracer {
  private serviceName: string;
  private exporter: (span: SpanData) => void;
  private spans: SpanData[] = [];
  private maxSpans = 10000;

  constructor(options: TracerOptions) {
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
   * Start a new root span.
   */
  startSpan(name: string): Span {
    return new Span(name, this.serviceName);
  }

  /**
   * Execute a function within a span.
   * Automatically ends the span when done.
   */
  async trace<T>(
    name: string,
    fn: (span: Span) => Promise<T>,
    parentSpan?: Span
  ): Promise<T> {
    const span = parentSpan
      ? parentSpan.startChild(name)
      : this.startSpan(name);

    try {
      const result = await fn(span);
      span.setStatus('ok');
      return result;
    } catch (error) {
      span.setStatus('error', (error as Error).message);
      throw error;
    } finally {
      const data = span.end();
      this.exporter(data);
    }
  }

  /**
   * Get stored spans (when using default in-memory exporter).
   */
  getSpans(): SpanData[] {
    return [...this.spans];
  }

  /**
   * Extract trace context from HTTP headers.
   * Allows tracing across service boundaries.
   */
  extractContext(headers: Record<string, string | string[] | undefined>): {
    traceId?: string;
    spanId?: string;
  } {
    // W3C Trace Context format
    const traceparent = headers['traceparent'] as string;
    if (traceparent) {
      const parts = traceparent.split('-');
      if (parts.length === 4) {
        return { traceId: parts[1], spanId: parts[2] };
      }
    }

    // Fallback: Zipkin B3 format
    return {
      traceId: headers['x-b3-traceid'] as string,
      spanId: headers['x-b3-spanid'] as string
    };
  }

  /**
   * Inject trace context into HTTP headers.
   */
  injectContext(span: Span): Record<string, string> {
    return {
      'traceparent': `00-${span.traceId}-${span.spanId}-01`,
      'x-b3-traceid': span.traceId,
      'x-b3-spanid': span.spanId
    };
  }
}