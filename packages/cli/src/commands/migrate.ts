/**
 * axil migrate [up|down|status|check]
 * Runs the @axiljs/orm MigrationRunner against the project's database.
 *
 * `check` (also `--check`) runs the ORM's migration safety analysis over
 * pending migrations (every migration with `all`) without executing them and
 * reports statements that lock or rewrite tables or break deployed code.
 * `up` runs the same check first when the safety mode is `warn` or `block`
 * (option, else package.json "axil": { "migrationSafety": … }, else off).
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

import { existsSync, readdirSync, readFileSync } from 'fs'
import Module from 'module'
import { delimiter, isAbsolute, join, relative, resolve } from 'path'

import * as ui from '../ui'
import { loadEnvIntoProcess } from '../utils/env'

export type MigrateAction = 'up' | 'down' | 'status' | 'check'

export const MIGRATE_ACTIONS: MigrateAction[] = ['up', 'down', 'status', 'check']

/** `off`: no check. `warn`: report findings, then migrate. `block`: refuse to migrate on any error finding. */
export type MigrationSafetyMode = 'off' | 'warn' | 'block'

export const SAFETY_MODES: MigrationSafetyMode[] = ['off', 'warn', 'block']

export interface MigrateOptions {
  // Project directory (default: process.cwd())
  cwd?: string
  // Migrations directory, absolute or relative to cwd (default: see resolveMigrationsDir)
  dir?: string
  // Environment to read the connection from (default: process.env after loading .env)
  env?: Record<string, string | undefined>
  // `up` only: safety check before migrating (default: package.json axil.migrationSafety, else off)
  safety?: MigrationSafetyMode
  // `check` only: analyze every migration, not only pending ones
  all?: boolean
  // `check` only: print the report as JSON on stdout (no other output)
  json?: boolean
  // Approximate row counts: ["users=4200000", "orders=18m"] or { users: 4200000 }
  largeTables?: string | string[] | Record<string, number>
}

export interface MigrationFindingReport {
  rule:      string
  severity:  'error' | 'warning' | 'info'
  table?:    string
  lock?:     string
  statement: string
  message:   string
  fix:       string
}

export interface MigrationCheckReport {
  name:       string
  // Project-relative path of the migration file
  file:       string
  // Number of SQL statements captured from up()
  statements: number
  findings:   MigrationFindingReport[]
}

export interface MigrationCheckSummary {
  // false when any finding is an error
  ok:      boolean
  driver:  DbConnectionConfig['driver']
  // Which migrations were analyzed
  scope:   'pending' | 'all'
  // true when no database was reachable and every migration was treated as pending
  offline: boolean
  counts:  { migrations: number; findings: number; error: number; warning: number; info: number }
  migrations: MigrationCheckReport[]
}

export interface MigrateResult {
  // 1 when `check` found errors or `up --safety=block` refused to run, else 0
  exitCode: number
  // The safety report (`check`, and `up` with safety warn/block)
  check?: MigrationCheckSummary
}

export interface DbConnectionConfig {
  driver:    'sqlite' | 'postgres' | 'mysql'
  url?:      string
  filename?: string
}

const DRIVER_ALIASES: Record<string, DbConnectionConfig['driver']> = {
  sqlite: 'sqlite', sqlite3: 'sqlite',
  postgres: 'postgres', postgresql: 'postgres', pg: 'postgres',
  mysql: 'mysql', mariadb: 'mysql'
}

/** Build an ORM connection config from env vars; throws with guidance when missing. */
export function resolveDbConfig(env: Record<string, string | undefined>, cwd: string): DbConnectionConfig {
  const explicit = env.DB_DRIVER?.trim().toLowerCase()
  const url      = env.DATABASE_URL?.trim() || undefined
  const file     = (env.DATABASE_FILENAME || env.DB_FILE)?.trim() || undefined

  let driver: DbConnectionConfig['driver'] | undefined

  if (explicit) {
    driver = DRIVER_ALIASES[explicit]
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

/**
 * Parse `--large-table` values into the runner's tableSizes.
 * Each entry is `name=rows`; several may be comma-separated. Rows accept
 * underscores and a k / m / b suffix: `users=4_200_000`, `orders=18m`.
 */
export function parseTableSizes(input: string | string[] | Record<string, number> | undefined): Record<string, number> {
  if (!input) return {}
  if (!Array.isArray(input) && typeof input === 'object') {
    const out: Record<string, number> = {}
    for (const [name, rows] of Object.entries(input)) {
      if (typeof rows !== 'number' || !Number.isFinite(rows) || rows < 0) {
        throw new Error(`Invalid row count for table "${name}": ${String(rows)}.`)
      }
      out[name] = rows
    }
    return out
  }

  const out: Record<string, number> = {}
  const entries = (Array.isArray(input) ? input : [input])
    .flatMap(v => v.split(','))
    .map(v => v.trim())
    .filter(Boolean)

  for (const entry of entries) {
    const m = /^([A-Za-z_][\w$.]*)\s*=\s*(\d[\d_]*(?:\.\d+)?)\s*([kmb])?$/i.exec(entry)
    if (!m) {
      throw new Error(`Invalid --large-table "${entry}". Expected <table>=<rows>, e.g. users=4200000 or orders=18m.`)
    }
    const scale = { k: 1e3, m: 1e6, b: 1e9 }[(m[3] || '').toLowerCase() as 'k' | 'm' | 'b'] ?? 1
    out[m[1]] = Math.round(Number(m[2].replace(/_/g, '')) * scale)
  }
  return out
}

export interface ProjectMigrationSettings {
  safety?:     MigrationSafetyMode
  tableSizes?: Record<string, number>
}

/**
 * Project defaults from package.json:
 *   "axil": { "migrationSafety": "warn", "migrationTableSizes": { "users": 4200000 } }
 */
export function readProjectMigrationSettings(cwd: string): ProjectMigrationSettings {
  const file = join(cwd, 'package.json')
  if (!existsSync(file)) return {}

  let pkg: any
  try { pkg = JSON.parse(readFileSync(file, 'utf8')) } catch { return {} }
  const axil = pkg && typeof pkg.axil === 'object' && pkg.axil ? pkg.axil : {}
  const settings: ProjectMigrationSettings = {}

  if (axil.migrationSafety !== undefined) {
    if (!SAFETY_MODES.includes(axil.migrationSafety)) {
      throw new Error(
        `Invalid "axil.migrationSafety" in package.json: ${JSON.stringify(axil.migrationSafety)}. ` +
        `Expected one of: ${SAFETY_MODES.join(', ')}.`
      )
    }
    settings.safety = axil.migrationSafety
  }
  if (axil.migrationTableSizes !== undefined) {
    settings.tableSizes = parseTableSizes(axil.migrationTableSizes)
  }
  return settings
}

/**
 * Connection config for `check`. With DB_DRIVER set but no DATABASE_URL the
 * check still runs offline (every migration is treated as pending), so CI can
 * gate migrations without a database.
 */
function resolveCheckConfig(env: Record<string, string | undefined>, cwd: string): DbConnectionConfig & { offline?: boolean } {
  try {
    return resolveDbConfig(env, cwd)
  } catch (error) {
    const driver = DRIVER_ALIASES[env.DB_DRIVER?.trim().toLowerCase() || '']
    if (driver) return { driver, offline: true }
    throw error
  }
}

/** Driver stand-in for an offline check: reads fail, so the runner treats every migration as pending. */
function offlineDriver(driver: string): unknown {
  return {
    config: { driver },
    async query(): Promise<never> { throw new Error('offline') }
  }
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
  status: 'Show migration status',
  check:  'Check migrations for locking and breaking changes'
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

export async function migrate(action: string = 'up', opts: MigrateOptions = {}): Promise<MigrateResult> {
  if (!MIGRATE_ACTIONS.includes(action as MigrateAction)) {
    throw new Error(`Unknown migrate action "${action}". Expected one of: ${MIGRATE_ACTIONS.join(', ')}.`)
  }
  if (opts.safety !== undefined && !SAFETY_MODES.includes(opts.safety)) {
    throw new Error(`Invalid safety mode "${opts.safety}". Expected one of: ${SAFETY_MODES.join(', ')}.`)
  }

  const started = Date.now()
  const isCheck = action === 'check'
  // --json: nothing but the JSON report on stdout
  const quiet   = isCheck && opts.json === true
  if (!quiet) ui.title('migrate', MIGRATE_SUMMARIES[action as MigrateAction])

  const cwd = opts.cwd || process.cwd()
  let env = opts.env
  if (!env) {
    loadEnvIntoProcess(cwd)
    env = process.env
  }

  const settings   = readProjectMigrationSettings(cwd)
  const tableSizes = { ...settings.tableSizes, ...parseTableSizes(opts.largeTables) }
  const safety     = action === 'up' ? (opts.safety ?? settings.safety ?? 'off') : 'off'

  const config: DbConnectionConfig & { offline?: boolean } = isCheck ? resolveCheckConfig(env, cwd) : resolveDbConfig(env, cwd)
  const dir    = resolveMigrationsDir(cwd, opts.dir)

  if (!existsSync(dir)) {
    throw new Error(`Migrations directory not found: ${dir}`)
  }

  const { orm, fromProject } = loadOrm(cwd)
  const { createConnection, MigrationRunner } = orm
  if (typeof createConnection !== 'function' || typeof MigrationRunner !== 'function') {
    throw new Error('The installed @axiljs/orm does not export createConnection/MigrationRunner.')
  }
  if ((isCheck || safety !== 'off') && typeof MigrationRunner.prototype?.check !== 'function') {
    throw new Error('The installed @axiljs/orm has no migration safety check. Upgrade it: npm install @axiljs/orm@latest')
  }

  // A check never creates a database: a missing SQLite file means every migration is pending
  let offline = isCheck && (
    config.offline === true ||
    opts.all === true ||
    (config.driver === 'sqlite' && !!config.filename && config.filename !== ':memory:' && !existsSync(config.filename))
  )

  if (!quiet) {
    const sizes = Object.entries(tableSizes)
    ui.keyValue([
      ['Driver',     config.driver],
      ...(config.filename ? [['Database', ui.path(shortPath(cwd, config.filename))] as [string, string]] : []),
      ['Migrations', ui.path(shortPath(cwd, dir))],
      ...(safety !== 'off' ? [['Safety', safety] as [string, string]] : []),
      ...(sizes.length
        ? [['Large tables', sizes.map(([t, n]) => `${t} ${ui.muted(`(${n.toLocaleString('en-US')} rows)`)}`).join(', ')] as [string, string]]
        : [])
    ])
    ui.line()
  }

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

  let connection: any = null
  try {
    if (!offline) {
      try {
        connection = await withOrmOutput<any>(() => createConnection(
          { driver: config.driver, url: config.url, filename: config.filename },
          `axil-migrate-${Date.now()}`
        ), !quiet)
      } catch (error) {
        if (!isCheck) throw error
        offline = true
        if (!quiet) {
          ui.warn('Could not connect to the database', `${(error as Error)?.message ?? String(error)}; checking every migration`)
        }
      }
    }

    const driver = connection ? connection.getDriver() : offlineDriver(config.driver)
    const runner = new MigrationRunner(driver, dir, Object.keys(tableSizes).length ? { tableSizes } : undefined)

    if (isCheck) {
      const results = await withOrmOutput<any[]>(() => runner.check({ all: opts.all === true }), !quiet)
      const summary = summarizeCheck(results, cwd, config.driver, opts.all === true ? 'all' : 'pending', offline)

      if (quiet) {
        console.log(JSON.stringify(summary, null, 2))
        return { exitCode: summary.ok ? 0 : 1, check: summary }
      }

      renderCheck(summary)
      if (summary.ok) {
        ui.done(summary.counts.findings ? 'No blocking findings' : 'Safe to migrate', started)
      } else {
        ui.failed(
          `${plural(summary.counts.error, 'error')} in ${plural(summary.migrations.filter(hasError).length, 'migration')}`,
          'Fix the statements, or mark an intended one with "-- axil:allow <rule>".'
        )
      }
      return { exitCode: summary.ok ? 0 : 1, check: summary }
    }

    let check: MigrationCheckSummary | undefined
    if (action === 'up' && safety !== 'off') {
      const results = await withOrmOutput<any[]>(() => runner.check())
      check = summarizeCheck(results, cwd, config.driver, 'pending', false)
      renderCheck(check, 'Safety check')
      if (safety === 'block' && !check.ok) {
        ui.failed(
          `Blocked: ${plural(check.counts.error, 'error')} in ` +
          `${plural(check.migrations.filter(hasError).length, 'migration')}; nothing was run`,
          'Fix the statements, or mark an intended one with "-- axil:allow <rule>".'
        )
        return { exitCode: 1, check }
      }
      ui.section('Migrate')
    }

    try {
      if (action === 'up')     await withOrmOutput(() => runner.up())
      if (action === 'down')   await withOrmOutput(() => runner.down())
      if (action === 'status') await printStatus(runner)
    } catch (error) {
      // An ORM that blocked on its own: MigrationSafetyError carries the results
      if ((error as Error)?.name === 'MigrationSafetyError' && Array.isArray((error as any).results)) {
        check = summarizeCheck((error as any).results, cwd, config.driver, 'pending', false)
        renderCheck(check, 'Safety check')
        ui.failed(
          'Blocked by the migration safety check; nothing was run',
          'Fix the statements, or mark an intended one with "-- axil:allow <rule>".'
        )
        return { exitCode: 1, check }
      }
      throw error
    }
    if (action !== 'status') ui.done(action === 'up' ? 'Migrate done' : 'Rollback done', started)
    else ui.line()
    return check ? { exitCode: 0, check } : { exitCode: 0 }
  } finally {
    if (connection) {
      try { await withOrmOutput(() => connection.disconnect(), !quiet) } catch {}
    }
    if (patchPaths) {
      if (prevNodePath === undefined) delete process.env.NODE_PATH
      else process.env.NODE_PATH = prevNodePath
      ;(Module as any)._initPaths?.()
    }
  }
}

const SEVERITY_ORDER: Record<MigrationFindingReport['severity'], number> = { error: 0, warning: 1, info: 2 }

const hasError = (m: MigrationCheckReport): boolean => m.findings.some(f => f.severity === 'error')

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/** Turn MigrationRunner#check() results into the CLI report (errors first, project-relative paths). */
export function summarizeCheck(
  results: any[],
  cwd: string,
  driver: DbConnectionConfig['driver'],
  scope: 'pending' | 'all',
  offline: boolean
): MigrationCheckSummary {
  const counts = { migrations: results.length, findings: 0, error: 0, warning: 0, info: 0 }

  const migrations: MigrationCheckReport[] = results.map(r => {
    const raw: any[] = Array.isArray(r.findings) ? r.findings : []
    const findings = raw
      .map((f, i): { f: MigrationFindingReport; i: number } => ({
        i,
        f: {
          rule:      String(f.rule),
          severity:  f.severity === 'error' || f.severity === 'warning' ? f.severity : 'info',
          ...(f.table ? { table: String(f.table) } : {}),
          ...(f.lock ? { lock: String(f.lock) } : {}),
          statement: String(f.statement ?? ''),
          message:   String(f.message ?? ''),
          fix:       String(f.fix ?? '')
        }
      }))
      .sort((a, b) => SEVERITY_ORDER[a.f.severity] - SEVERITY_ORDER[b.f.severity] || a.i - b.i)
      .map(x => x.f)

    for (const f of findings) {
      counts.findings++
      counts[f.severity]++
    }
    return {
      name:       String(r.name),
      file:       shortPath(cwd, String(r.file ?? r.name)).replace(/\\/g, '/'),
      statements: Array.isArray(r.statements) ? r.statements.length : 0,
      findings
    }
  })

  return { ok: counts.error === 0, driver, scope, offline, counts, migrations }
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text
}

/** Findings on the rail, grouped by migration file. */
function renderCheck(summary: MigrationCheckSummary, heading = 'Migration safety'): void {
  ui.section(heading)
  if (summary.offline) {
    ui.info('No database reachable', 'every migration is treated as pending')
  }
  if (summary.migrations.length === 0) {
    ui.info(summary.scope === 'all' ? 'No migration files found' : 'No pending migrations to check')
    return
  }

  for (const m of summary.migrations) {
    if (m.findings.length === 0) {
      ui.success(m.name, `${plural(m.statements, 'statement')}, no findings`)
      continue
    }
    ui.line()
    ui.step(ui.c.bold(m.name), `${m.file}  ${plural(m.findings.length, 'finding')}`)
    for (const f of m.findings) {
      const where = [f.table && `table ${f.table}`, f.lock && `lock ${f.lock}`]
        .filter(Boolean)
        .join(`  ${ui.sym.dot}  `)
      const label = `${f.severity.padEnd(7)} ${f.rule}`
      if (f.severity === 'error')        ui.problem(label, where)
      else if (f.severity === 'warning') ui.warn(label, where)
      else                               ui.info(label, where)
      ui.detail(f.message)
      if (f.fix) ui.detail(`Fix: ${f.fix}`)
      if (f.statement) ui.detail(`SQL: ${truncate(f.statement, 140)}`)
    }
  }

  const { counts } = summary
  ui.line()
  const parts = [
    counts.error   ? ui.c.red(plural(counts.error, 'error'))        : ui.muted('0 errors'),
    counts.warning ? ui.c.yellow(plural(counts.warning, 'warning')) : ui.muted('0 warnings'),
    counts.info    ? ui.c.blue(`${counts.info} info`)               : ui.muted('0 info')
  ]
  ui.line(`${plural(counts.migrations, 'migration')} checked  ${ui.muted(ui.sym.dot)}  ${parts.join(ui.muted(', '))}`)
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
 * With `render` false the output is discarded (`migrate check --json`).
 */
async function withOrmOutput<T>(fn: () => Promise<T>, render = true): Promise<T> {
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
    if (render) for (const raw of buffer.split('\n')) renderOrmLine(ui.stripAnsi(raw).trim())
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
