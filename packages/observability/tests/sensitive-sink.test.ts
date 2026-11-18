import { describe, it, expect, vi, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger, ConsoleTransport, FileTransport } from '../src/logger';

// @axiljs/runtime's sensitive data lineage listens on this hook
const KEY = Symbol.for('axiljs.sensitive.sink');

afterEach(() => {
  delete (globalThis as any)[KEY];
  vi.restoreAllMocks();
});

const jsonLogger = () => new Logger({ transports: [new ConsoleTransport('json')], level: 'debug' });

describe('sensitive data sink hook', () => {
  it('ConsoleTransport passes each entry to the hook as the log sink', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const calls: unknown[][] = [];
    (globalThis as any)[KEY] = (...args: unknown[]) => { calls.push(args); };
    jsonLogger().info('hello', { email: 'ann@example.com' });
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('log');
    expect(calls[0][1]).toMatchObject({ message: 'hello', email: 'ann@example.com' });
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('drops the entry (Logger swallows transport errors) when the hook throws', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    (globalThis as any)[KEY] = () => { throw new Error('leak'); };
    expect(() => jsonLogger().info('hello')).not.toThrow();
    expect(log).not.toHaveBeenCalled();
  });

  it('FileTransport checks before writing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'axil-obs-'));
    try {
      const file = join(dir, 'app.log');
      const logger = new Logger({ transports: [new FileTransport(file)], level: 'debug' });
      (globalThis as any)[KEY] = () => { throw new Error('leak'); };
      logger.info('secret');
      expect(existsSync(file)).toBe(false);
      delete (globalThis as any)[KEY];
      logger.info('fine');
      expect(readFileSync(file, 'utf8')).toContain('fine');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('is a no-op without the hook', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    jsonLogger().info('hello');
    expect(log).toHaveBeenCalledTimes(1);
  });
});
