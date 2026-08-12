/**
 * @restjs/observability - Public API
 */

// Logging
export { Logger, ConsoleTransport, FileTransport } from './logger';
export type { LogLevel, LogEntry, LoggerOptions, Transport } from './logger';

// Metrics
export { MetricsRegistry, Counter, Gauge, Histogram } from './metrics';

// Health checks
export { HealthChecker } from './health';
export type { CheckResult, HealthStatus, CheckStatus } from './health';

// Tracing
export { Tracer, Span } from './tracing';
export type { SpanData, SpanStatus, TracerOptions } from './tracing';

// Middleware
export { observabilityMiddleware, metricsHandler } from './middleware';
export type { ObservabilityOptions } from './middleware';