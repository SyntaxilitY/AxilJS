import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  analyzeMigration,
  splitStatements,
  isSafeTypeChange,
  type AnalyzeMigrationOptions,
  type MigrationFinding
} from '../src/migrations/safety';
import { MigrationRunner, MigrationSafetyError, checkMigrations } from '../src/migrations/migration-runner';
import { memoryDb, quietConsole, recordingDriver } from './helpers';

const PG: AnalyzeMigrationOptions = { dialect: 'postgres' };
const MY: AnalyzeMigrationOptions = { dialect: 'mysql' };
const LITE: AnalyzeMigrationOptions = { dialect: 'sqlite' };

/** Findings without the lock_timeout advisory, which most rules trigger too */
function analyze(sql: string | string[], options: AnalyzeMigrationOptions = PG): MigrationFinding[] {
  return analyzeMigration(sql, options).filter(f => f.rule !== 'missing-lock-timeout');
}
const rules = (sql: string | string[], options: AnalyzeMigrationOptions = PG) => analyze(sql, options).map(f => f.rule);
const one = (sql: string, rule: string, options: AnalyzeMigrationOptions = PG) => {
  const f = analyze(sql, options).filter(x => x.rule === rule);
  expect(f).toHaveLength(1);
  return f[0];
};

describe('splitStatements', () => {
  it('splits on top-level semicolons only', () => {
    const s = splitStatements(`
      INSERT INTO t (a) VALUES ('x;y');  -- trailing; comment
      /* block ; comment */ UPDATE t SET a = 'it''s;' WHERE id = 1;
      SELECT "weird;name" FROM t
    `);
    expect(s.map(x => x.sql)).toEqual([
      "INSERT INTO t (a) VALUES ('x;y')",
      "UPDATE t SET a = 'it''s;' WHERE id = 1",
      'SELECT "weird;name" FROM t'
    ]);
    expect(s[1].masked).toBe("UPDATE t SET a = '' WHERE id = 1");
  });

  it('keeps dollar-quoted bodies (incl. tagged) as one statement and masks them', () => {
    const s = splitStatements(`
      CREATE FUNCTION f() RETURNS trigger AS $$
      BEGIN
        DELETE FROM audit; UPDATE t SET x = 1;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      DO $body$ BEGIN PERFORM 1; END $body$;
      SELECT 1
    `);
    expect(s).toHaveLength(3);
    expect(s[0].sql).toContain('DELETE FROM audit;');
    expect(s[0].masked).not.toMatch(/DELETE/);
    expect(s[1].sql).toMatch(/^DO \$body\$/);
    expect(s[2].sql).toBe('SELECT 1');
  });

  it('handles nested block comments, E-strings and comment-only input', () => {
    const s = splitStatements(`/* outer /* inner ; */ still ; comment */ SELECT E'a\\'; b'; -- only a comment`);
    expect(s).toHaveLength(1);
    expect(s[0].sql).toBe("SELECT E'a\\'; b'");
    expect(splitStatements('-- nothing here\n/* or here */')).toEqual([]);
  });

  it('MySQL: backslash escapes, backticks and # comments', () => {
    const s = splitStatements("UPDATE `t;x` SET a = 'it\\'s;' WHERE id = 1; # done; really\nSELECT 2", 'mysql');
    expect(s.map(x => x.sql)).toEqual(["UPDATE `t;x` SET a = 'it\\'s;' WHERE id = 1", 'SELECT 2']);
  });

  it('attaches leading comments and same-line trailing comments to their statement', () => {
    const s = splitStatements('-- lead\nDROP TABLE a; -- axil:allow drop-table\nDROP TABLE b;');
    expect(s[0].comments).toEqual(['-- lead', '-- axil:allow drop-table']);
    expect(s[1].comments).toEqual([]);
  });

  it('does not flag statements hidden inside function bodies or strings', () => {
    expect(rules(`
      CREATE OR REPLACE FUNCTION purge() RETURNS void AS $$ DELETE FROM sessions; DROP TABLE x; $$ LANGUAGE sql;
      INSERT INTO notes (body) VALUES ('TRUNCATE users; DROP TABLE users');
    `)).toEqual([]);
  });
});

describe('PostgreSQL rules', () => {
  it('create-index-non-concurrent', () => {
    const f = one('CREATE INDEX idx_users_email ON users (email)', 'create-index-non-concurrent');
    expect(f).toMatchObject({ severity: 'warning', table: 'users', lock: 'SHARE' });
    expect(f.fix).toMatch(/CONCURRENTLY/);
    expect(f.fix).toMatch(/transaction/);
    expect(rules('CREATE UNIQUE INDEX ON public.users (email)')).toEqual(['create-index-non-concurrent']);
    expect(rules('CREATE INDEX CONCURRENTLY idx ON users (email)')).toEqual([]);
    // table created in the same migration is empty: no finding
    expect(rules('CREATE TABLE users (id int); CREATE INDEX idx ON users (id)')).toEqual([]);
  });

  it('concurrently-in-transaction', () => {
    expect(rules('CREATE INDEX CONCURRENTLY idx ON users (email)', { dialect: 'postgres', inTransaction: true }))
      .toEqual(['concurrently-in-transaction']);
    expect(rules('BEGIN; DROP INDEX CONCURRENTLY idx; COMMIT')).toEqual(['concurrently-in-transaction']);
    expect(rules('DROP INDEX CONCURRENTLY idx')).toEqual([]);
    expect(rules('REINDEX (CONCURRENTLY) TABLE users', { dialect: 'postgres', inTransaction: true }))
      .toEqual(['concurrently-in-transaction']);
  });

  it('drop-index-non-concurrent', () => {
    expect(rules('DROP INDEX IF EXISTS idx_users_email')).toEqual(['drop-index-non-concurrent']);
    expect(rules('CREATE INDEX CONCURRENTLY tmp_idx ON users (a); DROP INDEX tmp_idx')).toEqual([]);
  });

  it('add-column-not-null-without-default', () => {
    const f = one('ALTER TABLE users ADD COLUMN age integer NOT NULL', 'add-column-not-null-without-default');
    expect(f).toMatchObject({ severity: 'error', table: 'users' });
    expect(rules("ALTER TABLE users ADD COLUMN age integer NOT NULL DEFAULT 0")).toEqual([]);
    expect(rules('ALTER TABLE users ADD COLUMN age integer')).toEqual([]);
    expect(rules('ALTER TABLE users ADD COLUMN id bigserial NOT NULL')).not.toContain('add-column-not-null-without-default');
    expect(rules('CREATE TABLE users (id int); ALTER TABLE users ADD COLUMN age int NOT NULL')).toEqual([]);
  });

  it('add-column-volatile-default', () => {
    expect(rules('ALTER TABLE users ADD COLUMN token uuid DEFAULT gen_random_uuid()')).toEqual(['add-column-volatile-default']);
    expect(rules('ALTER TABLE users ADD COLUMN r float NOT NULL DEFAULT random()')).toEqual(['add-column-volatile-default']);
    expect(rules('ALTER TABLE users ADD COLUMN n bigserial')).toEqual(['add-column-volatile-default']);
    expect(rules('ALTER TABLE users ADD COLUMN n int GENERATED ALWAYS AS IDENTITY')).toEqual(['add-column-volatile-default']);
    // now() / constants are metadata-only on PG 11+
    expect(rules('ALTER TABLE users ADD COLUMN created_at timestamptz NOT NULL DEFAULT now()')).toEqual([]);
    expect(rules("ALTER TABLE users ADD COLUMN status text NOT NULL DEFAULT 'random()'")).toEqual([]);
  });

  it('alter-column-type, with safe widening exemptions', () => {
    const f = one('ALTER TABLE users ALTER COLUMN id TYPE bigint', 'alter-column-type');
    expect(f).toMatchObject({ severity: 'error', lock: 'ACCESS EXCLUSIVE' });
    expect(rules('ALTER TABLE users ALTER id SET DATA TYPE bigint')).toEqual(['alter-column-type']);

    const columnTypes = { 'users.name': 'varchar(50)', 'users.bio': 'character varying(200)', 'users.price': 'numeric(10,2)' };
    const opts: AnalyzeMigrationOptions = { dialect: 'postgres', columnTypes };
    expect(rules('ALTER TABLE users ALTER COLUMN name TYPE varchar(100)', opts)).toEqual([]);
    expect(rules('ALTER TABLE users ALTER COLUMN name TYPE text', opts)).toEqual([]);
    expect(rules('ALTER TABLE users ALTER COLUMN bio TYPE varchar', opts)).toEqual([]);
    expect(rules('ALTER TABLE users ALTER COLUMN price TYPE numeric(12,2)', opts)).toEqual([]);
    // narrowing, scale change or USING: unsafe
    expect(analyze('ALTER TABLE users ALTER COLUMN name TYPE varchar(20)', opts)[0].severity).toBe('error');
    expect(analyze('ALTER TABLE users ALTER COLUMN price TYPE numeric(12,4)', opts)[0].severity).toBe('error');
    expect(analyze('ALTER TABLE users ALTER COLUMN name TYPE text USING name::text', opts)[0].severity).toBe('error');
    // unknown current type but a widening-looking target: info only
    expect(analyze('ALTER TABLE users ALTER COLUMN other TYPE text')[0]).toMatchObject({ rule: 'alter-column-type', severity: 'info' });
  });

  it('isSafeTypeChange', () => {
    expect(isSafeTypeChange('varchar(10)', 'varchar(10)')).toBe(true);
    expect(isSafeTypeChange('varchar(10)', 'VARCHAR(11)')).toBe(true);
    expect(isSafeTypeChange('varchar', 'text')).toBe(true);
    expect(isSafeTypeChange('text', 'varchar')).toBe(true);
    expect(isSafeTypeChange('varchar', 'varchar(10)')).toBe(false);
    expect(isSafeTypeChange('integer', 'bigint')).toBe(false);
    expect(isSafeTypeChange('varchar(10)[]', 'text')).toBe(false);
  });

  it('set-not-null', () => {
    const f = one('ALTER TABLE users ALTER COLUMN email SET NOT NULL', 'set-not-null');
    expect(f.severity).toBe('warning');
    expect(f.fix).toMatch(/CHECK \(email IS NOT NULL\) NOT VALID/);
    expect(f.fix).toMatch(/VALIDATE CONSTRAINT/);
    expect(rules('ALTER TABLE users ALTER COLUMN email DROP NOT NULL')).toEqual([]);
    // the documented safe sequence (second migration) is clean
    expect(rules(`
      ALTER TABLE users VALIDATE CONSTRAINT users_email_not_null;
      ALTER TABLE users ALTER COLUMN email SET NOT NULL;
      ALTER TABLE users DROP CONSTRAINT users_email_not_null;
    `)).toEqual([]);
    // CHECK (col IS NOT NULL) added NOT VALID and validated earlier in the same (non-transactional) migration
    expect(rules('ALTER TABLE users ADD CONSTRAINT c CHECK (email IS NOT NULL) NOT VALID; ALTER TABLE users VALIDATE CONSTRAINT c; ALTER TABLE users ALTER email SET NOT NULL')).toEqual([]);
    // a valid CHECK added in the same migration also proves it
    expect(rules('ALTER TABLE users ADD CONSTRAINT c CHECK (email IS NOT NULL); ALTER TABLE users ALTER email SET NOT NULL')).toEqual(['add-constraint-without-not-valid']);
  });

  it('add-constraint-without-not-valid', () => {
    const fk = one('ALTER TABLE orders ADD CONSTRAINT orders_user_fk FOREIGN KEY (user_id) REFERENCES users (id)', 'add-constraint-without-not-valid');
    expect(fk.lock).toMatch(/SHARE ROW EXCLUSIVE/);
    expect(fk.fix).toMatch(/VALIDATE CONSTRAINT orders_user_fk/);
    expect(one('ALTER TABLE orders ADD CHECK (total >= 0)', 'add-constraint-without-not-valid').lock).toBe('ACCESS EXCLUSIVE');
    expect(rules('ALTER TABLE orders ADD CONSTRAINT fk FOREIGN KEY (user_id) REFERENCES users (id) NOT VALID')).toEqual([]);
    expect(rules('ALTER TABLE orders VALIDATE CONSTRAINT fk')).toEqual([]);
  });

  it('validate-in-same-transaction', () => {
    const sql = 'ALTER TABLE orders ADD CONSTRAINT fk FOREIGN KEY (user_id) REFERENCES users (id) NOT VALID; ALTER TABLE orders VALIDATE CONSTRAINT fk';
    expect(rules(sql, { dialect: 'postgres', inTransaction: true })).toEqual(['validate-in-same-transaction']);
    expect(rules(sql, { dialect: 'postgres', inTransaction: false })).toEqual([]);
  });

  it('add-unique-constraint', () => {
    expect(rules('ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE (email)')).toEqual(['add-unique-constraint']);
    expect(one('ALTER TABLE users ADD PRIMARY KEY (id)', 'add-unique-constraint').message).toMatch(/NOT NULL/);
    expect(rules('ALTER TABLE users ADD CONSTRAINT users_email_key UNIQUE USING INDEX users_email_idx')).toEqual([]);
  });

  it('drop / rename column and table', () => {
    expect(one('ALTER TABLE users DROP COLUMN legacy', 'drop-column').severity).toBe('warning');
    expect(rules('ALTER TABLE users DROP legacy')).toEqual(['drop-column']);
    expect(rules('ALTER TABLE users DROP CONSTRAINT users_fk')).toEqual([]);
    expect(rules('ALTER TABLE users ALTER COLUMN a DROP DEFAULT')).toEqual([]);
    expect(rules('DROP TABLE IF EXISTS old_logs, older_logs CASCADE')).toEqual(['drop-table', 'drop-table']);
    expect(rules('CREATE TABLE tmp (id int); DROP TABLE tmp')).toEqual([]);

    const rc = one('ALTER TABLE users RENAME COLUMN name TO full_name', 'rename-column');
    expect(rc.severity).toBe('error');
    expect(rc.fix).toMatch(/Expand\/contract/);
    expect(rules('ALTER TABLE users RENAME name TO full_name')).toEqual(['rename-column']);
    expect(one('ALTER TABLE users RENAME TO members', 'rename-table').fix).toMatch(/CREATE VIEW users/);
    expect(rules('ALTER TABLE users RENAME CONSTRAINT a TO b')).toEqual([]);
  });

  it('axil:allow comments and the ignore option suppress findings', () => {
    expect(rules('-- contract phase, code no longer reads it\n-- axil:allow drop-column\nALTER TABLE users DROP COLUMN legacy')).toEqual([]);
    expect(rules('ALTER TABLE users DROP COLUMN legacy; -- axil:allow drop-column')).toEqual([]);
    expect(rules('/* axil:allow all */ TRUNCATE users')).toEqual([]);
    expect(rules('TRUNCATE users', { dialect: 'postgres', ignore: ['truncate'] })).toEqual([]);
  });

  it('truncate, delete / update without where', () => {
    expect(one('TRUNCATE TABLE sessions', 'truncate')).toMatchObject({ severity: 'warning', lock: 'ACCESS EXCLUSIVE' });
    expect(rules('DELETE FROM sessions')).toEqual(['delete-without-where']);
    expect(rules('DELETE FROM sessions WHERE expires_at < now()')).toEqual([]);
    expect(rules('UPDATE users SET active = true')).toEqual(['update-without-where']);
    expect(rules('UPDATE users SET active = true WHERE id IN (SELECT id FROM x WHERE y)')).toEqual([]);
    // a WHERE inside a subquery does not count
    expect(rules('UPDATE users SET score = (SELECT max(s) FROM scores WHERE scores.uid = users.id)')).toEqual(['update-without-where']);
    expect(rules("UPDATE users SET note = 'where'")).toEqual(['update-without-where']);
  });

  it('vacuum full, cluster, reindex, lock table', () => {
    expect(one('VACUUM FULL users', 'vacuum-full')).toMatchObject({ severity: 'error', table: 'users' });
    expect(rules('VACUUM (FULL, ANALYZE) users')).toEqual(['vacuum-full']);
    expect(rules('VACUUM ANALYZE users')).toEqual([]);
    expect(one('CLUSTER users USING users_pkey', 'cluster')).toMatchObject({ severity: 'error', table: 'users' });
    expect(one('REINDEX TABLE users', 'reindex-non-concurrent')).toMatchObject({ severity: 'warning', table: 'users' });
    expect(rules('REINDEX TABLE CONCURRENTLY users')).toEqual([]);
    expect(rules('REINDEX (CONCURRENTLY) INDEX users_pkey')).toEqual([]);
    expect(one('LOCK TABLE users', 'lock-table').lock).toBe('ACCESS EXCLUSIVE');
    expect(one('LOCK TABLE users IN SHARE ROW EXCLUSIVE MODE', 'lock-table').lock).toBe('SHARE ROW EXCLUSIVE');
  });

  it('missing-lock-timeout: once, before risky DDL, unless set', () => {
    const all = analyzeMigration('ALTER TABLE users ADD COLUMN a int; ALTER TABLE users ADD COLUMN b int', PG);
    expect(all.map(f => f.rule)).toEqual(['missing-lock-timeout']);
    expect(all[0].severity).toBe('info');
    expect(all[0].fix).toMatch(/SET lock_timeout = '5s'/);
    expect(analyzeMigration('ALTER TABLE users ADD COLUMN a int', { dialect: 'postgres', inTransaction: true })[0].fix)
      .toMatch(/SET LOCAL lock_timeout/);
    expect(analyzeMigration("SET lock_timeout = '5s'; ALTER TABLE users ADD COLUMN a int", PG)).toEqual([]);
    expect(analyzeMigration("SET LOCAL lock_timeout TO '2s'; CREATE INDEX i ON users (a)", PG).map(f => f.rule))
      .toEqual(['create-index-non-concurrent']);
    expect(analyzeMigration('CREATE TABLE t (id int); ALTER TABLE t ADD COLUMN a int', PG)).toEqual([]);
    expect(analyzeMigration('ALTER TABLE users ADD COLUMN a int', MY)).toEqual([]);
  });

  it('handles quoted and schema-qualified names', () => {
    const f = one('ALTER TABLE "Billing"."Invoices" DROP COLUMN "LegacyId"', 'drop-column');
    expect(f.table).toBe('Billing.Invoices');
    expect(f.message).toContain('LegacyId');
    expect(one('CREATE INDEX i ON public.users (a)', 'create-index-non-concurrent').table).toBe('public.users');
  });

  it('reports every action of a multi-action ALTER TABLE', () => {
    expect(rules('ALTER TABLE users ADD COLUMN a int NOT NULL, ALTER COLUMN b SET NOT NULL, DROP COLUMN c'))
      .toEqual(['add-column-not-null-without-default', 'set-not-null', 'drop-column']);
  });
});

describe('tableSizes escalation', () => {
  const big: AnalyzeMigrationOptions = { dialect: 'postgres', tableSizes: { users: 5_000_000, 'public.small': 10 } };

  it('escalates lock-duration findings on large tables and mentions the size', () => {
    const f = one('CREATE INDEX i ON users (email)', 'create-index-non-concurrent', big);
    expect(f.severity).toBe('error');
    expect(f.message).toContain('5,000,000 rows');
    expect(one('CREATE INDEX i ON public.users (email)', 'create-index-non-concurrent', big).severity).toBe('error');
    expect(one('ALTER TABLE users ALTER COLUMN x TYPE text', 'alter-column-type', big).severity).toBe('warning');
    const lt = analyzeMigration('ALTER TABLE users ADD COLUMN a int', big);
    expect(lt[0]).toMatchObject({ rule: 'missing-lock-timeout', severity: 'warning' });
  });

  it('leaves small tables and size-independent rules alone', () => {
    expect(one('CREATE INDEX i ON small (a)', 'create-index-non-concurrent', big).severity).toBe('warning');
    expect(one('ALTER TABLE users DROP COLUMN a', 'drop-column', big).severity).toBe('warning');
    expect(one('CREATE INDEX i ON users (a)', 'create-index-non-concurrent',
      { ...big, largeTableThreshold: 10_000_000 }).severity).toBe('warning');
  });
});

describe('MySQL rules', () => {
  it('mysql-copy-algorithm for MODIFY / CHANGE / charset / FK', () => {
    const f = one('ALTER TABLE users MODIFY COLUMN name VARCHAR(500) NOT NULL', 'mysql-copy-algorithm', MY);
    expect(f.fix).toMatch(/ALGORITHM=INPLACE, LOCK=NONE/);
    expect(rules('ALTER TABLE users CHANGE name name TEXT', MY)).toEqual(['mysql-copy-algorithm']);
    expect(rules('ALTER TABLE users CONVERT TO CHARACTER SET utf8mb4', MY)).toEqual(['mysql-copy-algorithm']);
    expect(rules('ALTER TABLE orders ADD CONSTRAINT fk FOREIGN KEY (user_id) REFERENCES users (id)', MY)).toEqual(['mysql-copy-algorithm']);
    expect(rules('SET foreign_key_checks = 0; ALTER TABLE orders ADD FOREIGN KEY (user_id) REFERENCES users (id)', MY)).toEqual([]);
    expect(rules('ALTER TABLE users MODIFY name VARCHAR(500), ALGORITHM=INPLACE, LOCK=NONE', MY)).toEqual([]);
    expect(rules('ALTER TABLE users ADD COLUMN nick VARCHAR(20)', MY)).toEqual([]);
    expect(rules('CREATE INDEX i ON users (email)', MY)).toEqual([]);
  });

  it('renames, drops and implicit NOT NULL defaults', () => {
    expect(rules('ALTER TABLE users CHANGE name full_name VARCHAR(100)', MY)).toEqual(['rename-column']);
    expect(rules('RENAME TABLE users TO members', MY)).toEqual(['rename-table']);
    expect(rules('ALTER TABLE users RENAME TO members', MY)).toEqual(['rename-table']);
    expect(rules('ALTER TABLE users DROP COLUMN a', MY)).toEqual(['drop-column']);
    expect(rules('ALTER TABLE users DROP INDEX idx_a', MY)).toEqual([]);
    expect(one('ALTER TABLE users ADD COLUMN age INT NOT NULL', 'add-column-not-null-without-default', MY).severity).toBe('warning');
  });
});

describe('SQLite rules', () => {
  it('ADD COLUMN restrictions fail even on new tables', () => {
    expect(rules('ALTER TABLE users ADD COLUMN age INTEGER NOT NULL', LITE)).toEqual(['add-column-not-null-without-default']);
    expect(rules('CREATE TABLE t (id INTEGER); ALTER TABLE t ADD COLUMN a INTEGER NOT NULL', LITE)).toEqual(['add-column-not-null-without-default']);
    expect(rules('ALTER TABLE users ADD COLUMN created TEXT DEFAULT CURRENT_TIMESTAMP', LITE)).toEqual(['sqlite-add-column-unsupported']);
    expect(rules('ALTER TABLE users ADD COLUMN code TEXT UNIQUE', LITE)).toEqual(['sqlite-add-column-unsupported']);
    expect(rules("ALTER TABLE users ADD COLUMN age INTEGER NOT NULL DEFAULT 0", LITE)).toEqual([]);
  });

  it('shares the breaking-change rules; no PostgreSQL lock rules', () => {
    expect(rules('ALTER TABLE users RENAME COLUMN a TO b', LITE)).toEqual(['rename-column']);
    expect(rules('ALTER TABLE users DROP COLUMN a', LITE)).toEqual(['drop-column']);
    expect(rules('DELETE FROM users', LITE)).toEqual(['delete-without-where']);
    expect(rules('CREATE INDEX i ON users (a)', LITE)).toEqual([]);
  });
});

// ── MigrationRunner integration ─────────────────────────────────────────

describe('MigrationRunner#check and safety modes', () => {
  let dir: string;

  beforeAll(() => quietConsole());

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function writeMigrations(files: Record<string, string>): string {
    dir = mkdtempSync(join(tmpdir(), 'axil-orm-safety-'));
    for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
    return dir;
  }

  async function quietly<T>(fn: () => Promise<T>): Promise<T> {
    const write = process.stdout.write;
    process.stdout.write = (() => true) as typeof process.stdout.write;
    try { return await fn(); } finally { process.stdout.write = write; }
  }

  it('check() records SQL from up() without executing anything', async () => {
    const db = await memoryDb();
    const driver = db.getDriver();
    await driver.query('CREATE TABLE accounts (id INTEGER PRIMARY KEY, name TEXT)');
    await driver.query("INSERT INTO accounts (name) VALUES ('a')");

    writeMigrations({
      '001_safe.js': `
        exports.up = async (db) => { await db.query('CREATE TABLE widgets (id INTEGER PRIMARY KEY)') }
        exports.down = async () => {}
      `,
      '002_reads_rows.js': `
        exports.up = async (db) => {
          await db.query('ALTER TABLE accounts RENAME COLUMN name TO full_name')
          const { rows } = await db.query('SELECT id FROM accounts LIMIT 1')
          await db.query('UPDATE accounts SET full_name = ? WHERE id = ?', ['x', rows[0].id])
        }
        exports.down = async () => {}
      `,
      '003_default_export.js': `
        exports.default = { up: async (db) => { await db.query('DELETE FROM accounts') }, down: async () => {} }
      `
    });

    const runner = new MigrationRunner(driver, dir);
    const results = await runner.check();
    expect(results.map(r => r.name)).toEqual(['001_safe', '002_reads_rows', '003_default_export']);

    expect(results[0].statements).toEqual(['CREATE TABLE widgets (id INTEGER PRIMARY KEY)']);
    expect(results[0].findings).toEqual([]);

    // rows[0].id throws on the empty result: reported, and the SQL captured before it is still analyzed
    expect(results[1].findings.map(f => [f.rule, f.severity])).toEqual([
      ['rename-column', 'error'],
      ['dynamic-analysis-failed', 'info']
    ]);
    expect(results[2].findings.map(f => f.rule)).toEqual(['delete-without-where']);

    // Nothing ran: no widgets table, column not renamed, row not deleted, no _migrations table
    const tables = await driver.query<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'");
    expect(tables.rows.map(r => r.name)).toEqual(['accounts']);
    const cols = await driver.query<{ name: string }>('PRAGMA table_info(accounts)');
    expect(cols.rows.map(r => r.name)).toEqual(['id', 'name']);
    expect((await driver.query('SELECT * FROM accounts')).rows).toHaveLength(1);

    expect((await checkMigrations(runner)).length).toBe(3);
  });

  it('check() skips executed migrations unless all is set', async () => {
    const db = await memoryDb();
    writeMigrations({
      '001_a.js': `exports.up = async (db) => { await db.query('CREATE TABLE a (id INTEGER)') }; exports.down = async () => {}`,
      '002_b.js': `exports.up = async (db) => { await db.query('DROP TABLE a') }; exports.down = async () => {}`
    });
    const driver = db.getDriver();
    await driver.query('CREATE TABLE a (id INTEGER)');
    await driver.query('CREATE TABLE _migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name VARCHAR(255) NOT NULL UNIQUE, batch INTEGER NOT NULL, executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
    await driver.query("INSERT INTO _migrations (name, batch) VALUES ('001_a', 1)");
    const runner = new MigrationRunner(driver, dir);
    const pending = await runner.check();
    expect(pending.map(r => r.name)).toEqual(['002_b']);
    expect(pending[0].findings.map(f => f.rule)).toEqual(['drop-table']);
    expect((await runner.check({ all: true })).map(r => r.name)).toEqual(['001_a', '002_b']);
  });

  it("safety: 'block' stops a dangerous migration before anything runs", async () => {
    const db = await memoryDb();
    const driver = db.getDriver();
    await driver.query('CREATE TABLE accounts (id INTEGER PRIMARY KEY, name TEXT)');
    writeMigrations({
      '001_ok.js': `exports.up = async (db) => { await db.query('CREATE TABLE widgets (id INTEGER)') }; exports.down = async () => {}`,
      '002_bad.js': `exports.up = async (db) => { await db.query('ALTER TABLE accounts RENAME COLUMN name TO full_name') }; exports.down = async () => {}`
    });

    const runner = new MigrationRunner(driver, dir, { safety: 'block' });
    const err = await quietly(() => runner.up()).catch(e => e);
    expect(err).toBeInstanceOf(MigrationSafetyError);
    expect(err.message).toMatch(/002_bad: \[rename-column\]/);
    expect((err as MigrationSafetyError).results.map(r => r.name)).toEqual(['002_bad']);

    // Not even the safe migration before it ran
    const tables = await driver.query<{ name: string }>("SELECT name FROM sqlite_master WHERE name = 'widgets'");
    expect(tables.rows).toHaveLength(0);
    expect((await driver.query('SELECT * FROM _migrations')).rows).toHaveLength(0);
  });

  it("safety: 'block' lets warnings through and an axil:allow comment unblocks", async () => {
    const db = await memoryDb();
    const driver = db.getDriver();
    await driver.query('CREATE TABLE accounts (id INTEGER PRIMARY KEY, name TEXT, legacy TEXT)');
    writeMigrations({
      '001_drop.js': `exports.up = async (db) => { await db.query('ALTER TABLE accounts DROP COLUMN legacy') }; exports.down = async () => {}`,
      '002_rename.js': `exports.up = async (db) => { await db.query('-- axil:allow rename-column\\nALTER TABLE accounts RENAME COLUMN name TO full_name') }; exports.down = async () => {}`
    });
    await quietly(() => new MigrationRunner(driver, dir, { safety: 'block' }).up());
    const cols = await driver.query<{ name: string }>('PRAGMA table_info(accounts)');
    expect(cols.rows.map(r => r.name)).toEqual(['id', 'full_name']);
  });

  it("safety: 'warn' prints findings and still runs; 'off' (default) does not check", async () => {
    const logs: string[] = [];
    const log = console.log;
    console.log = (...args: unknown[]) => { logs.push(args.join(' ')); };
    try {
      const db = await memoryDb();
      const driver = db.getDriver();
      await driver.query('CREATE TABLE accounts (id INTEGER PRIMARY KEY, name TEXT)');
      writeMigrations({
        '001_rename.js': `exports.up = async (db) => { await db.query('ALTER TABLE accounts RENAME COLUMN name TO full_name') }; exports.down = async () => {}`
      });
      await quietly(() => new MigrationRunner(driver, dir, { safety: 'warn' }).up());
      expect(logs.join('\n')).toMatch(/rename-column/);
      const cols = await driver.query<{ name: string }>('PRAGMA table_info(accounts)');
      expect(cols.rows.map(r => r.name)).toContain('full_name');

      logs.length = 0;
      const db2 = await memoryDb();
      await db2.getDriver().query('CREATE TABLE accounts (id INTEGER PRIMARY KEY, name TEXT)');
      await quietly(() => new MigrationRunner(db2.getDriver(), dir).up());
      expect(logs.join('\n')).not.toMatch(/Migration safety/);
    } finally {
      console.log = log;
    }
  });

  it('postgres: transaction = false migrations skip the wrapping transaction and CONCURRENTLY passes the check', async () => {
    writeMigrations({
      '001_idx.js': `
        exports.transaction = false
        exports.up = async (db) => { await db.query('CREATE INDEX CONCURRENTLY idx_users_email ON users (email)') }
        exports.down = async (db) => { await db.query('DROP INDEX CONCURRENTLY idx_users_email') }
      `,
      '002_idx_in_tx.js': `
        exports.up = async (db) => { await db.query('CREATE INDEX CONCURRENTLY idx_users_name ON users (name)') }
        exports.down = async () => {}
      `
    });
    const driver = recordingDriver([], 'postgres');
    let transactions = 0;
    (driver as unknown as { transaction: unknown }).transaction = async (work: (trx: unknown) => Promise<unknown>) => {
      transactions++;
      return work(driver);
    };
    const runner = new MigrationRunner(driver, dir, { tableSizes: { users: 10 } });
    const results = await runner.check();
    expect(results[0].findings).toEqual([]);
    expect(results[1].findings.map(f => f.rule)).toEqual(['concurrently-in-transaction']);

    rmSync(join(dir, '002_idx_in_tx.js'));
    await quietly(() => runner.up());
    expect(transactions).toBe(0);
    expect(driver.queries.map(q => q.sql)).toContain('CREATE INDEX CONCURRENTLY idx_users_email ON users (email)');
  });
});
