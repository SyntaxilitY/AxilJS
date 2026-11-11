import { describe, it, expect, vi, afterEach } from 'vitest';
import { SQLiteDriver } from '../src/connection/sqlite-driver';

afterEach(() => vi.restoreAllMocks());

const connectedLines = (log: { mock: { calls: unknown[][] } }) =>
  log.mock.calls.filter(c => String(c[0]).includes('SQLite connected'));

describe('connection message', () => {
  it('is printed by default', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const driver = new SQLiteDriver({ driver: 'sqlite', filename: ':memory:' } as any);
    await driver.connect();
    expect(connectedLines(log)).toHaveLength(1);
    await driver.disconnect();
  });

  it('is silenced by logging: false', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const driver = new SQLiteDriver({ driver: 'sqlite', filename: ':memory:', logging: false } as any);
    await driver.connect();
    expect(connectedLines(log)).toHaveLength(0);
    await driver.disconnect();
  });
});
