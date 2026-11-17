import { describe, it, expect } from 'vitest';
import {
  fromConnection,
  toDialect,
  SqlRateLimitStore,
  SqlIdempotencyStore,
  SqlCacheStore,
  SqlLockProvider,
  PgAdvisoryLockProvider
} from '../src';
import { recordingExecutor } from './helpers';

const IS_DDL = /^CREATE /;

describe('toDialect', () => {
  it('numbers ? placeholders for postgres only, skipping quoted text', () => {
    expect(toDialect('postgres', `SELECT ? , '?' , ?`)).toBe(`SELECT $1 , '?' , $2`);
    expect(toDialect('mysql', 'SELECT ?, ?')).toBe('SELECT ?, ?');
    expect(toDialect('sqlite', 'SELECT ?')).toBe('SELECT ?');
  });

  it('is applied to every statement a store sends to postgres', async () => {
    const { exec, calls } = recordingExecutor('postgres', sql => sql.includes('RETURNING') ? { rows: [{ hits: '1', reset_at: '5' }] } : {});
    const store = new SqlRateLimitStore(exec, { table: 'rl' });
    expect(await store.increment('k', 1000)).toEqual({ count: 1, resetAt: 5 });
    const dml = calls.filter(c => !IS_DDL.test(c.sql));
    expect(dml[0].sql).toContain('VALUES ($1, 1, $2)');
    expect(dml[0].sql).toContain('THEN $5');
    expect(calls.every(c => !c.sql.includes('?'))).toBe(true);
  });
});

describe('fromConnection', () => {
  it('reads the dialect from the ORM driver config and delegates queries', async () => {
    const seen: string[] = [];
    const driver = {
      config: { driver: 'mysql' },
      async query(sql: string) { seen.push(sql); return { rows: [{ a: 1 }], affectedRows: 3, insertId: 9 }; },
      async transaction(work: (trx: any) => Promise<unknown>) {
        return work({ async query(sql: string) { seen.push(`trx:${sql}`); return { rows: [], affectedRows: 0 }; } });
      }
    };
    const exec = fromConnection({ getDriver: () => driver });
    expect(exec.dialect).toBe('mysql');
    expect(await exec.query('SELECT 1')).toEqual({ rows: [{ a: 1 }], affectedRows: 3 });
    await exec.transaction!(q => q.query('UPDATE x'));
    expect(seen).toEqual(['SELECT 1', 'trx:UPDATE x']);
  });

  it('rejects unsupported drivers', () => {
    expect(() => fromConnection({ getDriver: () => ({ config: { driver: 'mongodb' } }) })).toThrow(/unsupported driver 'mongodb'/);
  });
});

describe('MySQL SQL generation', () => {
  it('rate limit: case-sensitive key column, ordered assignments, INSERT + SELECT in one transaction', async () => {
    const { exec, calls } = recordingExecutor('mysql', sql =>
      sql.startsWith('SELECT hits') ? { rows: [{ hits: 3, reset_at: 1234 }] } : { affectedRows: 2 }
    );
    const store = new SqlRateLimitStore(exec, { table: 'rl', now: () => 1000 });
    expect(await store.increment('k', 60)).toEqual({ count: 3, resetAt: 1234 });

    const ddl = calls.filter(c => IS_DDL.test(c.sql));
    expect(ddl).toHaveLength(1);
    expect(ddl[0].sql).toContain('COLLATE utf8mb4_bin');
    expect(ddl[0].sql).toContain('INDEX idx_reset_at (reset_at)');

    const [insert, select] = calls.filter(c => !IS_DDL.test(c.sql));
    expect(insert.sql).toMatch(/ON DUPLICATE KEY UPDATE hits = CASE WHEN reset_at <= \? THEN 1 ELSE hits \+ 1 END, reset_at = CASE/);
    expect(insert.sql.indexOf('hits = CASE')).toBeLessThan(insert.sql.indexOf('reset_at = CASE'));
    expect(insert.params).toEqual(['k', 1060, 1000, 1000, 1060]);
    expect(insert.trx).toBe(true);
    expect(select.sql).toBe('SELECT hits, reset_at FROM rl WHERE id = ?');
    expect(select.trx).toBe(true);
    expect(calls.some(c => /RETURNING|ON CONFLICT|\$1/.test(c.sql))).toBe(false);
  });

  it('idempotency: ON DUPLICATE KEY UPDATE with LONGTEXT payload', async () => {
    const { exec, calls } = recordingExecutor('mysql', sql =>
      sql.startsWith('SELECT') ? { rows: [{ payload: '{"result":7}' }] } : {}
    );
    const store = new SqlIdempotencyStore(exec, { table: 'idem', now: () => 10 });
    await store.set('k', { result: 7 }, 5);
    expect(await store.get('k')).toEqual({ result: 7 });
    expect(calls[0].sql).toContain('payload LONGTEXT NOT NULL');
    expect(calls[1].sql).toBe('INSERT INTO idem (id, payload, expires_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE payload = VALUES(payload), expires_at = VALUES(expires_at)');
    expect(calls[1].params).toEqual(['k', '{"result":7}', 15]);
    expect(calls[2].params).toEqual(['k', 10]);
  });

  it('cache: tag rows with INSERT IGNORE inside a transaction, deleteByTag in chunks', async () => {
    const { exec, calls } = recordingExecutor('mysql', sql =>
      sql.startsWith('SELECT id FROM') ? { rows: [{ id: 'a' }, { id: 'b' }] } : {}
    );
    const store = new SqlCacheStore(exec, { table: 'c', now: () => 0 });
    await store.set('a', 1, 10, ['t1', 't2', 't1']);
    const ddl = calls.filter(c => IS_DDL.test(c.sql));
    expect(ddl.map(c => c.sql)).toEqual([
      expect.stringContaining('CREATE TABLE IF NOT EXISTS c (id VARCHAR(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin'),
      expect.stringContaining('CREATE TABLE IF NOT EXISTS c_tags (tag VARCHAR(255)')
    ]);
    const set = calls.filter(c => !IS_DDL.test(c.sql));
    expect(set.map(c => c.sql)).toEqual([
      expect.stringContaining('ON DUPLICATE KEY UPDATE payload = VALUES(payload)'),
      'DELETE FROM c_tags WHERE id = ?',
      'INSERT IGNORE INTO c_tags (tag, id) VALUES (?, ?), (?, ?)'
    ]);
    expect(set[2].params).toEqual(['t1', 'a', 't2', 'a']);
    expect(set.every(c => c.trx)).toBe(true);

    calls.length = 0;
    await store.deleteByTag('t1');
    expect(calls.map(c => c.sql)).toEqual([
      'SELECT id FROM c_tags WHERE tag = ?',
      'DELETE FROM c WHERE id IN (?, ?)',
      'DELETE FROM c_tags WHERE id IN (?, ?)'
    ]);
  });

  it('locks: INSERT IGNORE, then take over only a lapsed lease, release by owner', async () => {
    let held = false;
    const { exec, calls } = recordingExecutor('mysql', sql => {
      if (sql.startsWith('INSERT IGNORE')) { const ok = !held; held = true; return { affectedRows: ok ? 1 : 0 }; }
      if (sql.startsWith('UPDATE')) return { affectedRows: 0 };
      if (sql.startsWith('DELETE')) { held = false; return { affectedRows: 1 }; }
      return {};
    });
    const locks = new SqlLockProvider(exec, { table: 'l', now: () => 100 });
    const release = await locks.acquire('k', { ttlMs: 50, waitMs: 0 });
    await expect(locks.acquire('k', { ttlMs: 50, waitMs: 0 })).rejects.toThrow(/unavailable/);
    await release();

    const dml = calls.filter(c => !IS_DDL.test(c.sql));
    expect(dml[0].sql).toBe('INSERT IGNORE INTO l (id, owner, expires_at) VALUES (?, ?, ?)');
    expect(dml[0].params).toEqual(['k', expect.stringMatching(/^[0-9a-f]{32}$/), 150]);
    expect(dml[2].sql).toBe('UPDATE l SET owner = ?, expires_at = ? WHERE id = ? AND expires_at <= ?');
    expect(dml[2].params.slice(1)).toEqual([150, 'k', 100]);
    expect(dml[3].sql).toBe('DELETE FROM l WHERE id = ? AND owner = ?');
    expect(dml[3].params).toEqual(['k', dml[0].params[1]]);
  });

  it('PgAdvisoryLockProvider refuses non-postgres executors', () => {
    expect(() => new PgAdvisoryLockProvider(recordingExecutor('mysql').exec)).toThrow(/requires a postgres executor/);
    const { exec } = recordingExecutor('postgres');
    delete (exec as any).transaction;
    expect(() => new PgAdvisoryLockProvider(exec)).toThrow(/transaction/);
  });
});

describe('long keys', () => {
  it('are shortened to a prefix plus SHA-256 so they fit VARCHAR(255)', async () => {
    const { exec, calls } = recordingExecutor('sqlite');
    const store = new SqlIdempotencyStore(exec, { table: 'i' });
    await store.delete('a'.repeat(1000));
    const id = calls.find(c => c.sql.startsWith('DELETE'))!.params[0] as string;
    expect(id.length).toBeLessThanOrEqual(255);
    expect(id).toMatch(/^a{120}#[0-9a-f]{64}$/);
  });
});
