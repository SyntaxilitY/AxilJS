/**
 * Structured Logger.
 * Production-grade logging with levels, context, and output formats.
 *
 * Features:
 *   - Log levels (debug, info, warn, error, fatal)
 *   - Structured JSON output in production
 *   - Pretty colored output in development
 *   - Child loggers with inherited context
 *   - Pluggable transports (console, file, external)
 *
 * Usage:
 *   const logger = new Logger({ name: 'UserService' })
 *   logger.info('User created', { userId: 123, email: 'tariq@@axiljs.dev' })
 *   logger.error('Database error', { error: err.message, query })
 *
 *   const requestLogger = logger.child({ requestId: req.id })
 *   requestLogger.info('Request received')
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';
export interface LogEntry {
    level: LogLevel;
    message: string;
    name: string;
    timestamp: string;
    pid: number;
    [key: string]: unknown;
}
export interface Transport {
    write(entry: LogEntry): void;
}
export interface LoggerOptions {
    name?: string;
    level?: LogLevel;
    format?: 'pretty' | 'json';
    context?: Record<string, unknown>;
    transports?: Transport[];
}
export declare class ConsoleTransport implements Transport {
    private format;
    constructor(format?: 'pretty' | 'json');
    write(entry: LogEntry): void;
}
export declare class FileTransport implements Transport {
    private logPath;
    private logDir;
    constructor(logPath: string);
    write(entry: LogEntry): void;
}
export declare class Logger {
    private name;
    private minLevel;
    private format;
    private context;
    private transports;
    constructor(options?: LoggerOptions);
    debug(message: string, context?: Record<string, unknown>): void;
    info(message: string, context?: Record<string, unknown>): void;
    warn(message: string, context?: Record<string, unknown>): void;
    error(message: string, context?: Record<string, unknown>): void;
    fatal(message: string, context?: Record<string, unknown>): void;
    /**
     * Create a child logger with additional inherited context.
     * Child logger shares the same transports as parent.
     */
    child(context: Record<string, unknown>): Logger;
    private log;
}
//# sourceMappingURL=logger.d.ts.map