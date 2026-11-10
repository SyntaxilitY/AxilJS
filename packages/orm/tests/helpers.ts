import { vi } from 'vitest';
import { createConnection, ConnectionManager } from '../src/connection/connection-manager';
import type { BaseDriver } from '../src/connection/base-driver';
import type { QueryResult } from '../src/types';

/** Silence the drivers' "connected" banners. */
export function quietConsole(): void {
  vi.spyOn(console, 'log').mockImplementation(() => {});
}

/** Fresh in-memory SQLite connection (better-sqlite3). */
export async function memoryDb(name = `test_${Math.random()}`): Promise<ConnectionManager> {
  return createConnection({ driver: 'sqlite', filename: ':memory:' }, name);
}

export interface RecordedQuery {
  sql: string;
  params: unknown[];
}

/**
 * Driver stub that records SQL instead of executing it — used to assert the
 * SQL generated for postgres / mysql without a server.
 */
export function recordingDriver(
  rows: Record<string, unknown>[] = [],
  driver = 'postgres'
): BaseDriver & { queries: RecordedQuery[]; config: { driver: string } } {
  const queries: RecordedQuery[] = [];
  return {
    queries,
    config: { driver },
    async query<T>(sql: string, params: unknown[] = []): Promise<QueryResult<T>> {
      queries.push({ sql, params });
      return { rows: rows as T[], affectedRows: rows.length };
    },
    async transaction() { throw new Error('not supported'); },
    async connect() {},
    async disconnect() {},
    async ping() { return true; },
    isConnected() { return true; }
  } as unknown as BaseDriver & { queries: RecordedQuery[]; config: { driver: string } };
}
