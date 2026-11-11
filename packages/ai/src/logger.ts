/**
 * Logging for RAGPipeline and Agent.
 * Default: coloured console output; `logger: false` silences everything.
 */

/**
 * Minimal logger accepted by RAGPipeline and Agent.
 * Pass `false` to silence all output.
 */
export interface AILogger {
  info(msg: string): void;
  warn(msg: string): void;
}

/**
 * Default logger: coloured console output (the historical behaviour).
 */
export function createConsoleLogger(prefix: string): AILogger {
  return {
    info: msg => console.log(`\x1b[36m[${prefix}]\x1b[0m ${msg}`),
    warn: msg => console.warn(`\x1b[33m[${prefix}]\x1b[0m ${msg}`)
  };
}

const SILENT_LOGGER: AILogger = { info: () => {}, warn: () => {} };

/**
 * Resolve a `logger` option: undefined = console default, false = silent.
 */
export function resolveLogger(logger: AILogger | false | undefined, prefix: string): AILogger {
  if (logger === false) return SILENT_LOGGER;
  return logger ?? createConsoleLogger(prefix);
}
