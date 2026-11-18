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

import { writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

// ─── Log Levels ───────────────────────────────────────────────────────────────

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'fatal';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info:  1,
  warn:  2,
  error: 3,
  fatal: 4
};

// ─── Log Entry ────────────────────────────────────────────────────────────────

export interface LogEntry {
  // Log level
  level: LogLevel;

  // Human-readable message
  message: string;

  // Logger name
  name: string;

  // ISO timestamp
  timestamp: string;

  // Process ID
  pid: number;

  // Extra context fields
  [key: string]: unknown;
}

// ─── Transport ────────────────────────────────────────────────────────────────

export interface Transport {
  write(entry: LogEntry): void;
}

// ─── Logger Options ───────────────────────────────────────────────────────────

export interface LoggerOptions {
  // Logger name (shown in output)
  name?: string;

  // Minimum level to log (default: 'info' in production, 'debug' in dev)
  level?: LogLevel;

  // Output format (default: 'pretty' in dev, 'json' in production)
  format?: 'pretty' | 'json';

  // Additional context added to all log entries
  context?: Record<string, unknown>;

  // Custom transports (default: console)
  transports?: Transport[];
}

// ─── ANSI Colors ─────────────────────────────────────────────────────────────

const COLORS: Record<LogLevel, string> = {
  debug: '\x1b[90m',   // Gray
  info:  '\x1b[32m',   // Green
  warn:  '\x1b[33m',   // Yellow
  error: '\x1b[31m',   // Red
  fatal: '\x1b[35m'    // Magenta
};
const RESET = '\x1b[0m';
const DIM   = '\x1b[2m';
const BOLD  = '\x1b[1m';

/**
 * Report an entry to @axiljs/runtime's sensitive data lineage ('log' sink)
 * without depending on it. In enforce mode the hook throws before anything
 * is written; Logger swallows transport errors, so the leaking entry is
 * dropped and the violation recorded.
 */
function checkSensitiveSink(entry: LogEntry): void {
  const sink = (globalThis as any)[Symbol.for('axiljs.sensitive.sink')];
  if (typeof sink === 'function') sink('log', entry);
}

// ─── Console Transport ────────────────────────────────────────────────────────

export class ConsoleTransport implements Transport {
  constructor(private format: 'pretty' | 'json' = 'pretty') {}

  write(entry: LogEntry): void {
    checkSensitiveSink(entry);
    if (this.format === 'json') {
      console.log(JSON.stringify(entry));
      return;
    }

    // Pretty format
    const { level, message, name, timestamp, pid, ...axil } = entry;
    const color = COLORS[level];
    const time = new Date(timestamp).toLocaleTimeString();
    const levelPad = level.toUpperCase().padEnd(5);

    let line =
      `${DIM}${time}${RESET} ` +
      `${color}${BOLD}${levelPad}${RESET} ` +
      `${DIM}[${name}]${RESET} ` +
      `${message}`;

    // Append extra context on the same line if small
    const axilKeys = Object.keys(axil);
    if (axilKeys.length > 0 && axilKeys.length <= 3) {
      const extras = axilKeys
        .map(k => `${DIM}${k}${RESET}=${JSON.stringify(axil[k])}`)
        .join(' ');
      line += ` ${extras}`;
    } else if (axilKeys.length > 3) {
      line += '\n' + JSON.stringify(axil, null, 2)
        .split('\n')
        .map(l => '  ' + l)
        .join('\n');
    }

    if (level === 'error' || level === 'fatal') {
      console.error(line);
    } else {
      console.log(line);
    }
  }
}

// ─── File Transport ───────────────────────────────────────────────────────────

export class FileTransport implements Transport {
  private logDir: string;

  constructor(private logPath: string) {
    this.logDir = join(logPath, '..');
    mkdirSync(this.logDir, { recursive: true });
  }

  write(entry: LogEntry): void {
    checkSensitiveSink(entry);
    const line = JSON.stringify(entry) + '\n';
    appendFileSync(this.logPath, line, 'utf-8');
  }
}

// ─── Logger ───────────────────────────────────────────────────────────────────

export class Logger {
  private name: string;
  private minLevel: number;
  private format: 'pretty' | 'json';
  private context: Record<string, unknown>;
  private transports: Transport[];

  constructor(options: LoggerOptions = {}) {
    this.name = options.name || 'axilJS';
    this.format = options.format ||
      (process.env.NODE_ENV === 'production' ? 'json' : 'pretty');

    const defaultLevel: LogLevel =
      process.env.NODE_ENV === 'production' ? 'info' : 'debug';

    this.minLevel = LOG_LEVELS[options.level || defaultLevel];
    this.context = options.context || {};
    this.transports = options.transports || [new ConsoleTransport(this.format)];
  }

  // ─── Log Methods ─────────────────────────────────────────────────────────────

  debug(message: string, context?: Record<string, unknown>): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.log('error', message, context);
  }

  fatal(message: string, context?: Record<string, unknown>): void {
    this.log('fatal', message, context);
  }

  /**
   * Create a child logger with additional inherited context.
   * Child logger shares the same transports as parent.
   */
  child(context: Record<string, unknown>): Logger {
    const child = new Logger({
      name: this.name,
      format: this.format,
      context: { ...this.context, ...context },
      transports: this.transports
    });
    child.minLevel = this.minLevel;
    return child;
  }

  // ─── Internal ────────────────────────────────────────────────────────────────

  private log(
    level: LogLevel,
    message: string,
    context?: Record<string, unknown>
  ): void {
    if (LOG_LEVELS[level] < this.minLevel) return;

    const entry: LogEntry = {
      level,
      message,
      name: this.name,
      timestamp: new Date().toISOString(),
      pid: process.pid,
      ...this.context,
      ...context
    };

    for (const transport of this.transports) {
      try {
        transport.write(entry);
      } catch {
        // Never let logging crash the application
      }
    }
  }
}