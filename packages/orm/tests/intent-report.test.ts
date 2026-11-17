import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { classifyStatement } from '../src';
import type { ConnectionManager } from '../src/connection/connection-manager';
import { memoryDb, quietConsole } from './helpers';

const KEY = Symbol.for('axiljs.intent.report');

describe('classifyStatement', () => {
  it('classifies reads', () => {
    for (const sql of [
      'SELECT * FROM users',
      '  select 1',
      '(SELECT 1) UNION (SELECT 2)',
      'WITH t AS (SELECT 1) SELECT * FROM t',
      'PRAGMA table_info(users)',
      'EXPLAIN SELECT 1',
      '-- comment\nSELECT 1',
      'BEGIN',
      'COMMIT'
    ]) {
      expect(classifyStatement(sql), sql).toBe('db.read');
    }
  });

  it('classifies writes', () => {
    for (const sql of [
      'INSERT INTO users (name) VALUES (?)',
      'UPDATE users SET name = ?',
      'DELETE FROM users',
      'CREATE TABLE x (id int)',
      'DROP TABLE x',
      'WITH gone AS (DELETE FROM users RETURNING *) SELECT * FROM gone',
      'SELECT * FROM accounts WHERE id = 1 FOR UPDATE'
    ]) {
      expect(classifyStatement(sql), sql).toBe('db.write');
    }
  });
});

describe('driver reporting', () => {
  let db: ConnectionManager;
  const seen: Array<[string, string]> = [];

  beforeAll(async () => {
    quietConsole();
    db = await memoryDb();
    (globalThis as any)[KEY] = (kind: string, detail: string) => { seen.push([kind, detail]); };
  });

  afterEach(() => { seen.length = 0; });

  afterAll(async () => {
    delete (globalThis as any)[KEY];
    await db.disconnect();
  });

  it('reports each statement before it runs', async () => {
    await db.getDriver().query('CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT)');
    await db.getDriver().query('INSERT INTO notes (body) VALUES (?)', ['hi']);
    await db.getDriver().query('SELECT * FROM notes');
    expect(seen.map(s => s[0])).toEqual(['db.write', 'db.write', 'db.read']);
  });

  it('a throwing reporter prevents the statement', async () => {
    (globalThis as any)[KEY] = (kind: string) => { if (kind === 'db.write') throw new Error('read-only'); };
    await expect(db.getDriver().query('INSERT INTO notes (body) VALUES (?)', ['blocked'])).rejects.toThrow('read-only');
    (globalThis as any)[KEY] = undefined;
    const { rows } = await db.getDriver().query<{ body: string }>('SELECT body FROM notes');
    expect(rows.map(r => r.body)).not.toContain('blocked');
  });
});
