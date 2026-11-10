/**
 * axil migrate [up|down|status]
 * Runs the @axiljs/orm MigrationRunner against the project's database.
 *
 * Connection settings (from the environment, after loading <cwd>/.env —
 * variables already set in the environment win):
 *   DB_DRIVER           sqlite | postgres | mysql   (optional, inferred otherwise)
 *   DATABASE_URL        postgres://… / postgresql://… / mysql://…
 *   DATABASE_FILENAME   SQLite file path (DB_FILE is accepted as an alias)
 *
 * These are the same variables the scaffolded src/db/connection.ts reads.
 * @axiljs/orm (and the DB driver) are resolved from the project first.
 */

import { existsSync, readdirSync } from 'fs'
import Module from 'module'
import { delimiter, isAbsolute, join, relative, resolve } from 'path'

import * as ui from '../ui'
import { loadEnvIntoProcess } from '../utils/env'

export type MigrateAction = 'up' | 'down' | 'status'

export const MIGRATE_ACTIONS: MigrateAction[] = ['up', 'down', 'status']

export interface MigrateOptions {
  // Project directory (default: process.cwd())
  cwd?: string
  // Migrations directory, absolute or relative to cwd (default: see resolveMigrationsDir)
  dir?: string
  // Environment to read the connection from (default: process.env after loading .env)
  env?: Record<string, string | undefined>
}

export interface DbConnectionConfig {
  driver:    'sqlite' | 'postgres' | 'mysql'
  url?:      string
  filename?: string
}

/** Build an ORM connection config from env vars; throws with guidance when missing. */
export function resolveDbConfig(env: Record<string, string | undefined>, cwd: string): DbConnectionConfig {
  const explicit = env.DB_DRIVER?.trim().toLowerCase()
  const url      = env.DATABASE_URL?.trim() || undefined
  const file     = (env.DATABASE_FILENAME || env.DB_FILE)?.trim() || undefined

  let driver: DbConnectionConfig['driver'] | undefined

  if (explicit) {
    const map: Record<string, DbConnectionConfig['driver']> = {
      sqlite: 'sqlite', sqlite3: 'sqlite',
      postgres: 'postgres', postgresql: 'postgres', pg: 'postgres',
      mysql: 'mysql', mariadb: 'mysql'
    }
    driver = map[explicit]
    if (!driver) {
      throw new Error(`Unsupported DB_DRIVER "${env.DB_DRIVER}". Use sqlite, postgres or mysql.`)
    }
  } else if (url) {
    if (/^postgres(ql)?:/i.test(url)) driver = 'postgres'
    else if (/^(mysql|mariadb):/i.test(url)) driver = 'mysql'
    else if (/^(sqlite|file):/i.test(url)) driver = 'sqlite'
  } else if (file) {
    driver = 'sqlite'
  }

  if (!driver) {
    throw new Error(
      'No database configured.\n' +
      '  Set one of these in .env (or the environment):\n' +
      '    DATABASE_URL=postgres://user:pass@localhost:5432/db\n' +
      '    DATABASE_URL=mysql://user:pass@localhost:3306/db\n' +
      '    DATABASE_FILENAME=./dev.db          (SQLite)\n' +
      '  Optionally force the driver with DB_DRIVER=sqlite|postgres|mysql.'
    )
  }

  if (driver === 'sqlite') {
    let filename = file
    if (!filename && url) filename = url.replace(/^(sqlite|file):(\/\/)?/i, '')
    filename = filename || './dev.db'
    if (filename !== ':memory:' && !isAbsolute(filename)) filename = resolve(cwd, filename)
    return { driver, filename }
  }

  if (!url) {
    throw new Error(`DB_DRIVER=${driver} requires DATABASE_URL to be set.`)
  }
  return { driver, url }
}

function hasMigrationFiles(dir: string, ext: RegExp): boolean {
  return existsSync(dir) && readdirSync(dir).some(f => ext.test(f) && !f.endsWith('.d.ts'))
}

/**
 * Pick the migrations directory:
 *   1. `dir` when given
 *   2. src/migrations — unless Node cannot load .ts files (no type stripping)
 *      and dist/migrations has compiled .js migrations
 *   3. dist/migrations when src/migrations does not exist
 */
export function resolveMigrationsDir(cwd: string, dir?: string): string {
  if (dir) return isAbsolute(dir) ? dir : resolve(cwd, dir)

  const src  = join(cwd, 'src', 'migrations')
  const dist = join(cwd, 'dist', 'migrations')
  const canLoadTs = !!(process.features as any)?.typescript

  if (hasMigrationFiles(src, /\.ts$/) && !canLoadTs && hasMigrationFiles(dist, /\.js$/)) return dist
  if (!existsSync(src) && existsSync(dist)) return dist
  return src
}

/** Load @axiljs/orm from the project first, then from the CLI's own install. */
function loadOrm(cwd: string): { orm: any; fromProject: boolean } {
  const id = '@axiljs/orm'
  let fromProject: string | null = null
  try { fromProject = require.resolve(id, { paths: [cwd] }) } catch {}
  if (fromProject) return { orm: require(fromProject), fromProject: true }

  try {
    return { orm: require(require.resolve(id)), fromProject: false }
  } catch {
    throw new Error(`Cannot find module "${id}". Install it in your project: npm install ${id}`)
  }
}

const MIGRATE_SUMMARIES: Record<MigrateAction, string> = {
  up:     'Apply pending migrations',
  down:   'Roll back the last batch',
  status: 'Show migration status'
}

/**
 * Print migration status as a table. Uses the runner's (TS-private, but
 * runtime-accessible) helpers so the CLI controls the layout; falls back to
 * the ORM's own status() output on an ORM build without them.
 */
async function printStatus(runner: any): Promise<void> {
  if (
    typeof runner.ensureMigrationsTable !== 'function' ||
    typeof runner.getMigrationFiles !== 'function' ||
    typeof runner.getExecutedMigrations !== 'function'
  ) {
    await runner.status()
    return
  }

  await runner.ensureMigrationsTable()
  const files: string[] = runner.getMigrationFiles()
  const executed: Array<{ name: string; batch: number }> = await runner.getExecutedMigrations()
  const byName = new Map(executed.map(m => [m.name, m]))

  if (files.length === 0) {
    ui.warn('No migration files found.')
    return
  }

  let ran = 0
  ui.table(files.map(file => {
    const name   = file.replace(/\.(ts|js)$/, '')
    const record = byName.get(name)
    if (record) ran++
    return record
      ? [ui.c.green(`${ui.sym.tick} Ran`), name, ui.muted(`batch ${record.batch}`)]
      : [ui.c.yellow(`${ui.sym.bullet} Pending`), name, '']
  }), { gap: 2 })

  ui.line()
  ui.info(`${ran} ran, ${files.length - ran} pending`)
}

export async function migrate(action: string = 'up', opts: MigrateOptions = {}): Promise<void> {
  if (!MIGRATE_ACTIONS.includes(action as MigrateAction)) {
    throw new Error(`Unknown migrate action "${action}". Expected one of: ${MIGRATE_ACTIONS.join(', ')}.`)
  }

  const started = Date.now()
  ui.title('migrate', MIGRATE_SUMMARIES[action as MigrateAction])

  const cwd = opts.cwd || process.cwd()
  let env = opts.env
  if (!env) {
    loadEnvIntoProcess(cwd)
    env = process.env
  }

  const config = resolveDbConfig(env, cwd)
  const dir    = resolveMigrationsDir(cwd, opts.dir)

  if (!existsSync(dir)) {
    throw new Error(`Migrations directory not found: ${dir}`)
  }

  const { orm, fromProject } = loadOrm(cwd)
  const { createConnection, MigrationRunner } = orm
  if (typeof createConnection !== 'function' || typeof MigrationRunner !== 'function') {
    throw new Error('The installed @axiljs/orm does not export createConnection/MigrationRunner.')
  }

  ui.keyValue([
    ['Driver',     config.driver],
    ...(config.filename ? [['Database', ui.path(shortPath(cwd, config.filename))] as [string, string]] : []),
    ['Migrations', ui.path(shortPath(cwd, dir))]
  ])
  ui.line()

  // When @axiljs/orm did not come from the project, its require() of
  // pg/mysql2/better-sqlite3 would not search the project's node_modules:
  // expose them through NODE_PATH for the duration of the run.
  const projectModules = join(cwd, 'node_modules')
  const prevNodePath   = process.env.NODE_PATH
  const patchPaths     = !fromProject && existsSync(projectModules)
  if (patchPaths) {
    process.env.NODE_PATH = [projectModules, prevNodePath].filter(Boolean).join(delimiter)
    ;(Module as any)._initPaths?.()
  }

  const connection = await withOrmOutput<any>(() => createConnection(
    { driver: config.driver, url: config.url, filename: config.filename },
    `axil-migrate-${Date.now()}`
  ))

  try {
    const runner = new MigrationRunner(connection.getDriver(), dir)
    if (action === 'up')     await withOrmOutput(() => runner.up())
    if (action === 'down')   await withOrmOutput(() => runner.down())
    if (action === 'status') await printStatus(runner)
    if (action !== 'status') ui.done(action === 'up' ? 'Migrate done' : 'Rollback done', started)
    else ui.line()
  } finally {
    try { await withOrmOutput(() => connection.disconnect()) } catch {}
    if (patchPaths) {
      if (prevNodePath === undefined) delete process.env.NODE_PATH
      else process.env.NODE_PATH = prevNodePath
      ;(Module as any)._initPaths?.()
    }
  }
}

/** Project-relative path for display; absolute when outside the project. */
function shortPath(cwd: string, target: string): string {
  const rel = relative(cwd, resolve(cwd, target))
  return rel && !rel.startsWith('..') && !isAbsolute(rel) ? rel : target
}

/**
 * Run an @axiljs/orm call with its console output captured, then re-print
 * it on the CLI rail (the ORM writes its own coloured lines and partial
 * "Migrating: x... done" writes, which would otherwise break the layout).
 */
async function withOrmOutput<T>(fn: () => Promise<T>): Promise<T> {
  const original = process.stdout.write
  let buffer = ''
  process.stdout.write = ((chunk: any, ...rest: any[]) => {
    buffer += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')
    const cb = rest.find(a => typeof a === 'function')
    if (cb) cb()
    return true
  }) as typeof process.stdout.write

  try {
    return await fn()
  } finally {
    process.stdout.write = original
    for (const raw of buffer.split('\n')) renderOrmLine(ui.stripAnsi(raw).trim())
  }
}

function renderOrmLine(line: string): void {
  if (!line) return
  let m: RegExpExecArray | null
  if ((m = /^Migrating: (.+?)\.\.\.\s*done$/.exec(line)))    return ui.success(m[1])
  if ((m = /^Rolling back: (.+?)\.\.\.\s*done$/.exec(line))) return ui.success(`Rolled back ${m[1]}`)
  if ((m = /^(?:Migrating|Rolling back): (.+?)\.\.\.\s*FAILED$/.exec(line))) {
    return ui.line(ui.c.red(`${ui.rail.error} ${m[1]} failed`))
  }
  if ((m = /Running (\d+) migrations? \(batch (\d+)\)/.exec(line))) {
    return ui.step(`${m[1]} pending`, `batch ${m[2]}`)
  }
  if ((m = /Rolling back batch (\d+)/.exec(line))) {
    return ui.step(`Rolling back batch ${m[1]}`)
  }
  if (/All migrations up to date/.test(line)) return ui.info('Nothing to migrate', 'all migrations are up to date')
  if (/Nothing to roll back/.test(line))      return ui.info('Nothing to roll back')
  // Connection banners and completion summaries are already shown by the CLI
  if (/connected|disconnected|migrations completed|Rollback complete/i.test(line)) return
  ui.detail(line)
}
