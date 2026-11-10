import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ViewManager } from '../src/views/view-manager';
import { buildMySQLPoolOptions, MySQLDriver } from '../src/connection/mysql-driver';
import { ConnectionManager } from '../src/connection/connection-manager';
import { memoryDb, quietConsole, recordingDriver } from './helpers';

describe('ViewManager dialects', () => {
  let db: ConnectionManager;

  beforeAll(async () => {
    quietConsole();
    db = await memoryDb();
    await db.getDriver().query('CREATE TABLE users (id INTEGER PRIMARY KEY, role TEXT)');
    await db.getDriver().query(`INSERT INTO users (role) VALUES ('admin'), ('user'), ('admin')`);
  });

  afterAll(async () => {
    await db.disconnect();
  });

  it('creates and replaces a view on real SQLite (dialect detected from the driver)', async () => {
    const driver = db.getDriver();
    await ViewManager.create('admins', `SELECT * FROM users WHERE role = 'admin'`, driver);
    expect(await ViewManager.query('admins', driver, 'sqlite').count()).toBe(2);

    // replace = true → DROP + CREATE
    await ViewManager.create('admins', `SELECT * FROM users WHERE role = 'user'`, driver);
    expect(await ViewManager.query('admins', driver, 'sqlite').count()).toBe(1);

    // replace = false → CREATE VIEW IF NOT EXISTS keeps the existing view
    await ViewManager.create('admins', `SELECT * FROM users`, driver, false);
    expect(await ViewManager.query('admins', driver, 'sqlite').count()).toBe(1);
    expect(await ViewManager.exists('admins', driver, 'sqlite')).toBe(true);

    await ViewManager.drop('admins', driver);
    expect(await ViewManager.exists('admins', driver)).toBe(false);
  });

  it('works inside a SQLite transaction when driverType is passed', async () => {
    const driver = db.getDriver();
    await driver.transaction(async trx => {
      await ViewManager.create('v_trx', 'SELECT id FROM users', trx, true, 'sqlite');
    });
    expect(await ViewManager.exists('v_trx', driver, 'sqlite')).toBe(true);
  });

  it('postgres / mysql use CREATE OR REPLACE VIEW', async () => {
    for (const dialect of ['postgres', 'mysql']) {
      const fake = recordingDriver([], dialect);
      await ViewManager.create('v', 'SELECT 1', fake);
      expect(fake.queries.map(q => q.sql)).toEqual(['CREATE OR REPLACE VIEW v AS SELECT 1']);
    }
  });

  it('postgres / mysql without replace check information_schema first', async () => {
    const missing = recordingDriver([], 'postgres');
    await ViewManager.create('v', 'SELECT 1', missing, false);
    expect(missing.queries[0].sql).toMatch(/information_schema\.views WHERE table_name = \$1/);
    expect(missing.queries[0].params).toEqual(['v']);
    expect(missing.queries[1].sql).toBe('CREATE VIEW v AS SELECT 1');

    const present = recordingDriver([{ '?column?': 1 }], 'mysql');
    await ViewManager.create('v', 'SELECT 1', present, false);
    expect(present.queries).toHaveLength(1);
    expect(present.queries[0].sql).toMatch(/table_name = \? AND table_schema = DATABASE\(\)/);
  });

  it('unknown dialect keeps the previous SQL', async () => {
    const ctx = { queries: [] as string[], async query(sql: string) { this.queries.push(sql); return { rows: [], affectedRows: 0 }; } };
    await ViewManager.create('v', 'SELECT 1', ctx);
    await ViewManager.create('v', 'SELECT 1', ctx, false);
    expect(ctx.queries).toEqual(['CREATE OR REPLACE VIEW v AS SELECT 1', 'CREATE VIEW IF NOT EXISTS v AS SELECT 1']);
  });
});

describe('MySQL driver config', () => {
  it('uses config.url when given', () => {
    expect(buildMySQLPoolOptions({ driver: 'mysql', url: 'mysql://u:p@db:3307/app', pool: { max: 4 } }))
      .toEqual({ uri: 'mysql://u:p@db:3307/app', connectionLimit: 4 });
  });

  it('falls back to individual fields', () => {
    expect(buildMySQLPoolOptions({
      driver: 'mysql', host: 'h', port: 1, database: 'd', username: 'u', password: 'p', ssl: true
    })).toEqual({ host: 'h', port: 1, database: 'd', user: 'u', password: 'p', connectionLimit: 10, ssl: true });
  });

  it('closes the pool and rethrows when the first connection fails', async () => {
    quietConsole();
    const driver = new MySQLDriver({ driver: 'mysql', url: 'mysql://u:p@127.0.0.1:1/app' });
    await expect(driver.connect()).rejects.toThrow();
    expect(driver.isConnected()).toBe(false);
    await expect(driver.query('SELECT 1')).rejects.toThrow(/not connected/);
  });
});
