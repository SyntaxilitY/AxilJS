/**
 * Pluggable logging for Queue and Scheduler.
 *
 *   logger: undefined → console (default, ANSI-coloured, unchanged behaviour)
 *   logger: false     → silent
 *   logger: { info, warn } → plain-text messages routed to your logger
 *                            (errors are reported through warn)
 */

export interface QueueLogger {
  info(msg: string): void;
  warn(msg: string): void;
}

export type QueueLoggerOption = QueueLogger | false;

export type LogLevel = 'info' | 'warn' | 'error';

/** @internal */
export interface LogSink {
  /** `color: null` writes `msg` without the tag (continuation lines). */
  (level: LogLevel, msg: string, color?: string | null): void;
}

/**
 * @internal
 * Build a sink that prefixes `tag` (e.g. "[AxilJS Queue]") to every message.
 * `color` is the ANSI colour used for the tag in default console mode only.
 */
export function createLogSink(logger: QueueLoggerOption | undefined, tag: string): LogSink {
  if (logger === false) return () => {};

  if (logger) {
    return (level, msg, color) => {
      const line = color === null ? msg : `${tag} ${msg}`;
      if (level === 'info') logger.info(line);
      else logger.warn(line);
    };
  }

  return (level, msg, color = '\x1b[36m') => {
    const line = color === null ? msg : `${color}${tag}\x1b[0m ${msg}`;
    if (level === 'info') console.log(line);
    else if (level === 'warn') console.warn(line);
    else console.error(line);
  };
}
