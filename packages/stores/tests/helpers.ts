import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createConnection } from '../../orm/src';
import { fromConnection, SqlExecutor } from '../src';

export const PG_URL = process.env.AXIL_TEST_PG_URL;

export interface Server {
  exec: SqlExecutor;
  conn: { getDriver(): any; disconnect(): Promise<void> };
}

export interface Target {
  name: 'sqlite' | 'postgres';
  skip: boolean;
  /** Open a connection to a database shared by every server of this target. */
  server(): Promise<Server>;
  /** Unique table name; dropped by `cleanup()`. */
  table(prefix: string): string;
  cleanup(): Promise<void>;
}

let seq = 0;
const unique = (prefix: string) => `${prefix}_${randomBytes(4).toString('hex')}_${seq++}`;

function makeTarget(name: 'sqlite' | 'postgres'): Target {
  const servers: Server[] = [];
  const tables: string[] = [];
  // SQLite servers share one file, like several processes on one host
  const file = join(tmpdir(), `${unique('axil_stores')}.db`);

  return {
    name,
    skip: name === 'postgres' && !PG_URL,
    async server() {
      const conn = name === 'sqlite'
        ? await createConnection({ driver: 'sqlite', filename: file, logging: false }, unique('sqlite'))
        : await createConnection({ driver: 'postgres', url: PG_URL, logging: false, pool: { min: 0, max: 10 } }, unique('pg'));
      const server = { conn, exec: fromConnection(conn) };
      servers.push(server);
      return server;
    },
    table(prefix: string) {
      const t = unique(prefix);
      tables.push(t, `${t}_tags`);
      return t;
    },
    async cleanup() {
      if (servers.length) {
        for (const t of tables) await servers[0].conn.getDriver().query(`DROP TABLE IF EXISTS ${t}`);
      }
      for (const s of servers.splice(0)) await s.conn.disconnect();
      tables.length = 0;
      if (name === 'sqlite') {
        for (const suffix of ['', '-wal', '-shm']) {
          // Windows may still hold the file briefly; a leftover temp file is harmless
          try { rmSync(file + suffix, { force: true }); } catch { /* ignore */ }
        }
      }
    }
  };
}

export const targets: Target[] = [makeTarget('sqlite'), makeTarget('postgres')];

export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** A settable clock for ttl / window tests. */
export function clock(start = 1_700_000_000_000) {
  const c = { t: start, now: () => c.t };
  return c;
}

/** Records every statement; `respond` decides the result. */
export function recordingExecutor(
  dialect: SqlExecutor['dialect'],
  respond: (sql: string, params: unknown[]) => { rows?: any[]; affectedRows?: number } = () => ({})
) {
  const calls: Array<{ sql: string; params: unknown[]; trx: boolean }> = [];
  let inTrx = false;
  const exec: SqlExecutor = {
    dialect,
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params, trx: inTrx });
      const r = respond(sql, params);
      return { rows: r.rows ?? [], affectedRows: r.affectedRows };
    },
    async transaction(work) {
      inTrx = true;
      try { return await work(exec); } finally { inTrx = false; }
    }
  };
  return { exec, calls };
}
