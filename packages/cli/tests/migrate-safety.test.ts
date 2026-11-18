import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { spawnSync } from 'child_process'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from 'fs'
import { createRequire } from 'module'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

import { migrate, parseTableSizes, readProjectMigrationSettings } from '../src/commands/migrate'
import { parseArgs, findCommand } from '../src/args'

// The real @axiljs/orm (committed dist) and better-sqlite3 from the workspace
const requireFromCli = createRequire(join(__dirname, '..', 'package.json'))
const Database = requireFromCli('better-sqlite3')

const CLI = resolve(__dirname, '..', 'src', 'cli.ts')
const TSX = resolve(__dirname, '..', '..', '..', 'node_modules', 'tsx', 'dist', 'cli.mjs')

let dir: string
let logs: string[]

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'axil-migrate-safety-'))
  mkdirSync(join(dir, 'src', 'migrations'), { recursive: true })
  logs = []
  vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { logs.push(a.join(' ')) })
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { logs.push(a.join(' ')) })
})

afterEach(() => {
  vi.restoreAllMocks()
  rmSync(dir, { recursive: true, force: true })
})

const env = (): Record<string, string> => ({ DATABASE_FILENAME: join(dir, 'app.db') })
const text = (): string => logs.join('\n').replace(/\x1b\[[0-9;]*m/g, '')

/** A CommonJS migration whose up() runs the given SQL statements. */
function migration(name: string, statements: string[]): void {
  writeFileSync(join(dir, 'src', 'migrations', `${name}.js`), [
    'exports.up = async (db) => {',
    ...statements.map(sql => `  await db.query(${JSON.stringify(sql)})`),
    '}',
    'exports.down = async () => {}',
    ''
  ].join('\n'))
}

function tables(): string[] {
  const file = join(dir, 'app.db')
  if (!existsSync(file)) return []
  const db = new Database(file, { readonly: true })
  try {
    return db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((r: any) => r.name)
  } finally {
    db.close()
  }
}

const SAFE = ['CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT)']
const RENAME = ['ALTER TABLE users RENAME TO people']

describe('axil migrate --check', () => {
  it('passes (exit 0) on a safe migration and never creates the database', async () => {
    migration('001_create_users', SAFE)
    const r = await migrate('check', { cwd: dir, env: env() })

    expect(r.exitCode).toBe(0)
    expect(r.check?.ok).toBe(true)
    expect(r.check?.counts).toMatchObject({ migrations: 1, error: 0 })
    expect(r.check?.migrations[0]).toMatchObject({ name: '001_create_users', file: 'src/migrations/001_create_users.js', statements: 1 })
    expect(existsSync(join(dir, 'app.db'))).toBe(false)
    expect(text()).toContain('001_create_users')
    expect(text()).toContain('Safe to migrate')
  })

  it('fails (exit 1) on a dangerous migration and reports the finding on the rail', async () => {
    migration('001_create_users', SAFE)
    migration('002_rename_users', RENAME)
    const r = await migrate('check', { cwd: dir, env: env() })

    expect(r.exitCode).toBe(1)
    expect(r.check?.ok).toBe(false)
    const finding = r.check?.migrations.find(m => m.name === '002_rename_users')?.findings[0]
    expect(finding).toMatchObject({ rule: 'rename-table', severity: 'error', table: 'users' })
    expect(finding?.fix).toBeTruthy()

    const out = text()
    expect(out).toContain('002_rename_users')
    expect(out).toContain('rename-table')
    expect(out).toContain('Fix:')
    expect(out).toMatch(/1 error in 1 migration/)
    expect(tables()).toEqual([])
  })

  it('--json prints only a JSON report', async () => {
    migration('001_create_users', SAFE)
    migration('002_rename_users', RENAME)
    const r = await migrate('check', { cwd: dir, env: env(), json: true })

    expect(r.exitCode).toBe(1)
    expect(logs).toHaveLength(1)
    const report = JSON.parse(logs[0])
    expect(report).toMatchObject({
      ok: false,
      driver: 'sqlite',
      scope: 'pending',
      offline: true,
      counts: { migrations: 2, error: 1 }
    })
    expect(report.migrations.map((m: any) => m.name)).toEqual(['001_create_users', '002_rename_users'])
    expect(Object.keys(report.migrations[1].findings[0]).sort())
      .toEqual(['fix', 'message', 'rule', 'severity', 'statement', 'table'])
  })

  it('honours "-- axil:allow <rule>" comments', async () => {
    migration('001_create_users', SAFE)
    migration('002_rename_users', [`-- axil:allow rename-table\n${RENAME[0]}`])
    const r = await migrate('check', { cwd: dir, env: env() })

    expect(r.exitCode).toBe(0)
    expect(r.check?.counts.findings).toBe(0)
  })

  it('checks only pending migrations unless --all', async () => {
    migration('001_create_users', SAFE)
    migration('002_rename_users', RENAME)
    expect((await migrate('up', { cwd: dir, env: env() })).exitCode).toBe(0)
    expect(tables()).toContain('people')

    const pending = await migrate('check', { cwd: dir, env: env() })
    expect(pending.exitCode).toBe(0)
    expect(pending.check?.counts.migrations).toBe(0)
    expect(text()).toContain('No pending migrations to check')

    const all = await migrate('check', { cwd: dir, env: env(), all: true })
    expect(all.exitCode).toBe(1)
    expect(all.check?.scope).toBe('all')
    expect(all.check?.counts.migrations).toBe(2)
  })

  it('--large-table escalates size-sensitive findings', async () => {
    migration('001_backfill', ['UPDATE users SET name = lower(name)'])

    const small = await migrate('check', { cwd: dir, env: env() })
    expect(small.check?.migrations[0].findings[0]).toMatchObject({ rule: 'update-without-where', severity: 'warning' })
    expect(small.exitCode).toBe(0)

    const large = await migrate('check', { cwd: dir, env: env(), largeTables: ['users=2m'] })
    expect(large.check?.migrations[0].findings[0]).toMatchObject({ rule: 'update-without-where', severity: 'error' })
    expect(large.exitCode).toBe(1)
  })
})

describe('axil migrate up --safety', () => {
  it('block refuses to run anything while an error finding remains', async () => {
    migration('001_create_users', SAFE)
    migration('002_rename_users', RENAME)
    const r = await migrate('up', { cwd: dir, env: env(), safety: 'block' })

    expect(r.exitCode).toBe(1)
    expect(r.check?.counts.error).toBe(1)
    expect(tables()).not.toContain('users')
    expect(tables()).not.toContain('people')
    expect(text()).toContain('nothing was run')
  })

  it('warn prints the findings and migrates', async () => {
    migration('001_create_users', SAFE)
    migration('002_rename_users', RENAME)
    const r = await migrate('up', { cwd: dir, env: env(), safety: 'warn' })

    expect(r.exitCode).toBe(0)
    expect(r.check?.counts.error).toBe(1)
    expect(tables()).toContain('people')
    expect(text()).toContain('rename-table')
    expect(text()).toContain('Migrate done')
  })

  it('reads the default mode from package.json "axil.migrationSafety"', async () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'app', axil: { migrationSafety: 'block' } }))
    migration('001_create_users', SAFE)
    migration('002_rename_users', RENAME)

    expect((await migrate('up', { cwd: dir, env: env() })).exitCode).toBe(1)
    expect(tables()).not.toContain('people')

    // An explicit option wins over the project default
    expect((await migrate('up', { cwd: dir, env: env(), safety: 'off' })).exitCode).toBe(0)
    expect(tables()).toContain('people')
  })
})

describe('migration safety options', () => {
  it('parseTableSizes accepts repeated, comma-separated and suffixed values', () => {
    expect(parseTableSizes(['users=4200000', 'orders=18m,events=1_500k', 'public.logs=2.5b'])).toEqual({
      users: 4_200_000, orders: 18_000_000, events: 1_500_000, 'public.logs': 2_500_000_000
    })
    expect(parseTableSizes(undefined)).toEqual({})
    expect(() => parseTableSizes('users')).toThrow(/Expected <table>=<rows>/)
    expect(() => parseTableSizes('users=many')).toThrow(/Invalid --large-table/)
  })

  it('readProjectMigrationSettings validates package.json', () => {
    expect(readProjectMigrationSettings(dir)).toEqual({})
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ axil: { migrationSafety: 'warn', migrationTableSizes: { users: 10 } } }))
    expect(readProjectMigrationSettings(dir)).toEqual({ safety: 'warn', tableSizes: { users: 10 } })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ axil: { migrationSafety: 'loud' } }))
    expect(() => readProjectMigrationSettings(dir)).toThrow(/Invalid "axil.migrationSafety"/)
  })

  it('--large-table may be repeated on the command line', () => {
    const spec = findCommand('migrate')!
    const parsed = parseArgs(['--check', '--large-table', 'users=1m', '--large-table=orders=2m'], spec.flags, 'migrate')
    expect(parsed.flags).toEqual({ check: true, 'large-table': 'users=1m,orders=2m' })
  })
})

describe('axil binary: migrate --check', () => {
  function axil(...args: string[]): { code: number | null; out: string; err: string } {
    const r = spawnSync(process.execPath, [TSX, CLI, ...args], {
      cwd: dir,
      encoding: 'utf8',
      input: '',
      timeout: 60000,
      env: { ...process.env, NO_COLOR: '1', DATABASE_FILENAME: join(dir, 'app.db'), DATABASE_URL: '', DB_DRIVER: '' }
    })
    return { code: r.status, out: r.stdout || '', err: r.stderr || '' }
  }

  it('exits 1 with errors, 0 without, and keeps --json output pure', () => {
    migration('001_create_users', SAFE)
    const ok = axil('migrate', '--check')
    expect(ok.code).toBe(0)

    migration('002_rename_users', RENAME)
    const bad = axil('migrate', 'check', '--json')
    expect(bad.code).toBe(1)
    expect(JSON.parse(bad.out).counts.error).toBe(1)

    const misuse = axil('migrate', 'down', '--safety=block')
    expect(misuse.code).toBe(1)
    expect(misuse.err).toContain('--safety only applies')
  })
})
