"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = exports.FileTransport = exports.ConsoleTransport = void 0;
const fs_1 = require("fs");
const path_1 = require("path");
const LOG_LEVELS = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
    fatal: 4
};
// ─── ANSI Colors ─────────────────────────────────────────────────────────────
const COLORS = {
    debug: '\x1b[90m', // Gray
    info: '\x1b[32m', // Green
    warn: '\x1b[33m', // Yellow
    error: '\x1b[31m', // Red
    fatal: '\x1b[35m' // Magenta
};
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
// ─── Console Transport ────────────────────────────────────────────────────────
class ConsoleTransport {
    format;
    constructor(format = 'pretty') {
        this.format = format;
    }
    write(entry) {
        if (this.format === 'json') {
            console.log(JSON.stringify(entry));
            return;
        }
        // Pretty format
        const { level, message, name, timestamp, pid, ...axil } = entry;
        const color = COLORS[level];
        const time = new Date(timestamp).toLocaleTimeString();
        const levelPad = level.toUpperCase().padEnd(5);
        let line = `${DIM}${time}${RESET} ` +
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
        }
        else if (axilKeys.length > 3) {
            line += '\n' + JSON.stringify(axil, null, 2)
                .split('\n')
                .map(l => '  ' + l)
                .join('\n');
        }
        if (level === 'error' || level === 'fatal') {
            console.error(line);
        }
        else {
            console.log(line);
        }
    }
}
exports.ConsoleTransport = ConsoleTransport;
// ─── File Transport ───────────────────────────────────────────────────────────
class FileTransport {
    logPath;
    logDir;
    constructor(logPath) {
        this.logPath = logPath;
        this.logDir = (0, path_1.join)(logPath, '..');
        (0, fs_1.mkdirSync)(this.logDir, { recursive: true });
    }
    write(entry) {
        const line = JSON.stringify(entry) + '\n';
        (0, fs_1.appendFileSync)(this.logPath, line, 'utf-8');
    }
}
exports.FileTransport = FileTransport;
// ─── Logger ───────────────────────────────────────────────────────────────────
class Logger {
    name;
    minLevel;
    format;
    context;
    transports;
    constructor(options = {}) {
        this.name = options.name || 'axilJS';
        this.format = options.format ||
            (process.env.NODE_ENV === 'production' ? 'json' : 'pretty');
        const defaultLevel = process.env.NODE_ENV === 'production' ? 'info' : 'debug';
        this.minLevel = LOG_LEVELS[options.level || defaultLevel];
        this.context = options.context || {};
        this.transports = options.transports || [new ConsoleTransport(this.format)];
    }
    // ─── Log Methods ─────────────────────────────────────────────────────────────
    debug(message, context) {
        this.log('debug', message, context);
    }
    info(message, context) {
        this.log('info', message, context);
    }
    warn(message, context) {
        this.log('warn', message, context);
    }
    error(message, context) {
        this.log('error', message, context);
    }
    fatal(message, context) {
        this.log('fatal', message, context);
    }
    /**
     * Create a child logger with additional inherited context.
     * Child logger shares the same transports as parent.
     */
    child(context) {
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
    log(level, message, context) {
        if (LOG_LEVELS[level] < this.minLevel)
            return;
        const entry = {
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
            }
            catch {
                // Never let logging crash the application
            }
        }
    }
}
exports.Logger = Logger;
//# sourceMappingURL=logger.js.map