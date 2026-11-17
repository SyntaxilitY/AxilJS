/**
 * Migration Runner.
 * Manages database schema changes.
 * Supports PostgreSQL, MySQL, and SQLite parameter styles.
 */

import { readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { BaseDriver, TransactionContext } from '../connection/base-driver'
import { analyzeMigration, MigrationFinding, SqlDialect } from './safety'

export interface Migration {
  up(db: TransactionContext): Promise<void>
  down(db: TransactionContext): Promise<void>
  /**
   * Set to `false` to run this migration outside a transaction. Needed for
   * statements PostgreSQL refuses inside a transaction block, such as
   * CREATE INDEX CONCURRENTLY. Export it as `export const transaction = false`.
   */
  transaction?: boolean
}

/** `off`: no check (default). `warn`: print findings. `block`: also refuse to run when any finding is an error. */
export type MigrationSafetyMode = 'off' | 'warn' | 'block'

export interface MigrationRunnerOptions {
  /** Run the migration safety check before `up()`. Default `off` */
  safety?: MigrationSafetyMode
  /** Approximate row counts by table; lock-duration findings escalate for large tables */
  tableSizes?: Record<string, number>
  /** Row count above which findings escalate. Default 1,000,000 */
  largeTableThreshold?: number
  /** Current column types (`table.column` → type), used to recognise safe type widenings */
  columnTypes?: Record<string, string>
  /** Rule ids to skip */
  ignore?: string[]
}

export interface MigrationCheckResult {
  /** Migration name (file name without extension) */
  name: string
  /** Absolute path of the migration file */
  file: string
  /** SQL captured from `up()` */
  statements: string[]
  findings: MigrationFinding[]
}

export interface MigrationCheckOptions {
  /** Check every migration file, not only pending ones */
  all?: boolean
}

/** Thrown by `MigrationRunner#up()` in `block` mode when a pending migration has error findings. */
export class MigrationSafetyError extends Error {
  readonly results: MigrationCheckResult[]

  constructor(results: MigrationCheckResult[]) {
    const lines = results.flatMap(r => r.findings
      .filter(f => f.severity === 'error')
      .map(f => `  ${r.name}: [${f.rule}] ${f.message}`))
    super(
      `Migration safety check blocked ${results.length} migration(s); nothing was run.\n${lines.join('\n')}\n` +
      'Fix the statements, or mark an intended one with "-- axil:allow <rule>".'
    )
    this.name    = 'MigrationSafetyError'
    this.results = results
  }
}

const emptyResult = () => ({ rows: [], affectedRows: 0 })

/**
 * A stand-in for the database that records SQL, executes nothing and
 * answers every query with no rows.
 */
function recordingContext(captured: string[], driver: string): TransactionContext {
  const target: Record<string, unknown> = {
    config: { driver },
    async query(sql: unknown) {
      if (typeof sql === 'string') captured.push(sql)
      return emptyResult()
    }
  }
  const proxy = new Proxy(target, {
    get(t, prop) {
      if (typeof prop === 'symbol' || prop === 'then') return undefined
      if (prop in t) return t[prop]
      return async () => emptyResult()
    }
  }) as unknown as TransactionContext
  target.transaction = async (work: (trx: TransactionContext) => Promise<unknown>) => work(proxy)
  return proxy
}

function toDialect(driver: string): SqlDialect | undefined {
  return driver === 'postgres' || driver === 'mysql' || driver === 'sqlite' ? driver : undefined
}

/** Standalone form of `runner.check()` */
export function checkMigrations(runner: MigrationRunner, options?: MigrationCheckOptions): Promise<MigrationCheckResult[]> {
  return runner.check(options)
}

interface MigrationRecord {
  id: number
  name: string
  batch: number
  executed_at: string
}

export class MigrationRunner {
  private driver: BaseDriver
  private migrationsDir: string
  private driverType: string
  private options: MigrationRunnerOptions

  constructor(driver: BaseDriver, migrationsDir?: string, options: MigrationRunnerOptions = {}) {
    this.driver        = driver
    this.migrationsDir = migrationsDir || join(process.cwd(), 'src', 'migrations')
    this.driverType    = (driver as any).config?.driver || 'sqlite'
    this.options       = options
  }

  private loadMigration(filePath: string, fn: 'up' | 'down' = 'up'): Migration {
    const mod = require(filePath)
    // Support both `export function up` and `export default { up, down }`
    return mod && typeof mod[fn] !== 'function' && mod.default ? mod.default : mod
  }

  /**
   * Run each migration's `up()` against a recording driver (nothing is
   * executed, every query returns no rows) and analyze the captured SQL for
   * statements that lock or rewrite tables or break deployed code.
   * Checks pending migrations unless `all` is set.
   */
  async check(options: MigrationCheckOptions = {}): Promise<MigrationCheckResult[]> {
    const files = this.getMigrationFiles()
    let executed = new Set<string>()
    if (!options.all) {
      try {
        executed = new Set((await this.getExecutedMigrations()).map(m => m.name))
      } catch {
        // No _migrations table yet: every migration is pending
      }
    }
    return this.checkFiles(files.filter(f => !executed.has(f.replace(/\.(ts|js)$/, ''))))
  }

  private async checkFiles(files: string[]): Promise<MigrationCheckResult[]> {
    const dialect = toDialect(this.driverType)
    const results: MigrationCheckResult[] = []

    for (const file of files) {
      const name       = file.replace(/\.(ts|js)$/, '')
      const filePath   = join(this.migrationsDir, file)
      const statements: string[] = []
      const failures: MigrationFinding[] = []
      let inTransaction = true

      try {
        const migration = this.loadMigration(filePath)
        inTransaction = migration.transaction !== false
        if (typeof migration.up !== 'function') throw new Error('it does not export an up() function')
        await migration.up(recordingContext(statements, this.driverType))
      } catch (error) {
        failures.push({
          rule:      'dynamic-analysis-failed',
          severity:  'info',
          statement: '',
          message:   `Could not analyze ${name} dynamically: ${(error as Error)?.message ?? String(error)}. ` +
            `Only the ${statements.length} statement(s) captured before the error were checked.`,
          fix:       'The check runs up() against a recording driver that returns no rows. Guard code that reads query ' +
            'results (rows[0]?.id), or review this migration by hand.'
        })
      }

      const findings = dialect
        ? analyzeMigration(statements, {
            dialect,
            inTransaction,
            tableSizes:          this.options.tableSizes,
            largeTableThreshold: this.options.largeTableThreshold,
            columnTypes:         this.options.columnTypes,
            ignore:              this.options.ignore
          })
        : []
      results.push({ name, file: filePath, statements, findings: [...findings, ...failures] })
    }
    return results
  }

  private printFindings(results: MigrationCheckResult[]): void {
    const all = results.flatMap(r => r.findings.map(f => ({ name: r.name, f })))
    if (all.length === 0) {
      console.log('\x1b[32m[AxilJS ORM]\x1b[0m Migration safety: no findings.')
      return
    }
    console.log(`\n\x1b[33m[AxilJS ORM]\x1b[0m Migration safety: ${all.length} finding(s)\n`)
    for (const { name, f } of all) {
      const color = f.severity === 'error' ? '\x1b[31m' : f.severity === 'warning' ? '\x1b[33m' : '\x1b[36m'
      console.log(`  ${color}${f.severity.toUpperCase()}\x1b[0m ${name} [${f.rule}]${f.lock ? ` lock: ${f.lock}` : ''}`)
      if (f.statement) {
        console.log(`    ${f.statement.length > 160 ? f.statement.slice(0, 157) + '...' : f.statement}`)
      }
      console.log(`    ${f.message}`)
      console.log(`    Fix: ${f.fix}\n`)
    }
  }

  /** Parameter placeholder: $1 for postgres, ? for others */
  private p(index: number): string {
    return this.driverType === 'postgres' ? `$${index}` : '?'
  }

  private async ensureMigrationsTable(): Promise<void> {
    if (this.driverType === 'postgres') {
      await this.driver.query(`
        CREATE TABLE IF NOT EXISTS _migrations (
          id          SERIAL PRIMARY KEY,
          name        VARCHAR(255) NOT NULL UNIQUE,
          batch       INTEGER NOT NULL,
          executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `)
    } else if (this.driverType === 'mysql') {
      await this.driver.query(`
        CREATE TABLE IF NOT EXISTS _migrations (
          id          INTEGER AUTO_INCREMENT PRIMARY KEY,
          name        VARCHAR(255) NOT NULL UNIQUE,
          batch       INTEGER NOT NULL,
          executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `)
    } else {
      await this.driver.query(`
        CREATE TABLE IF NOT EXISTS _migrations (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          name        VARCHAR(255) NOT NULL UNIQUE,
          batch       INTEGER NOT NULL,
          executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `)
    }
  }

  private getMigrationFiles(): string[] {
    if (!existsSync(this.migrationsDir)) return []
    // Skip declaration files and keep one file per migration name
    // (x.ts + x.js side by side would otherwise run twice in one batch)
    const seen = new Set<string>()
    return readdirSync(this.migrationsDir)
      .filter(f => (f.endsWith('.ts') || f.endsWith('.js')) && !f.endsWith('.d.ts'))
      .sort()
      .filter(f => {
        const name = f.replace(/\.(ts|js)$/, '')
        if (seen.has(name)) return false
        seen.add(name)
        return true
      })
  }

  private async getExecutedMigrations(): Promise<MigrationRecord[]> {
    const result = await this.driver.query<MigrationRecord>(
      'SELECT * FROM _migrations ORDER BY id ASC'
    )
    return result.rows
  }

  async up(): Promise<void> {
    await this.ensureMigrationsTable()

    const files    = this.getMigrationFiles()
    const executed = await this.getExecutedMigrations()
    const executedNames = new Set(executed.map(m => m.name))

    const pending = files.filter(f => {
      const name = f.replace(/\.(ts|js)$/, '')
      return !executedNames.has(name)
    })

    if (pending.length === 0) {
      console.log('\x1b[32m[AxilJS ORM]\x1b[0m All migrations up to date.')
      return
    }

    const lastBatch = executed.length > 0
      ? Math.max(...executed.map(m => m.batch))
      : 0
    const batch = lastBatch + 1

    const safety = this.options.safety ?? 'off'
    if (safety !== 'off') {
      const results = await this.checkFiles(pending)
      this.printFindings(results)
      if (safety === 'block') {
        const blocked = results.filter(r => r.findings.some(f => f.severity === 'error'))
        if (blocked.length > 0) throw new MigrationSafetyError(blocked)
      }
    }

    console.log(
      `\n\x1b[36m[AxilJS ORM]\x1b[0m Running ${pending.length} migrations (batch ${batch})...\n`
    )

    for (const file of pending) {
      const name     = file.replace(/\.(ts|js)$/, '')
      const filePath = join(this.migrationsDir, file)

      process.stdout.write(`  Migrating: ${name}... `)

      try {
        const migration = this.loadMigration(filePath)
        const run = async (db: TransactionContext) => {
          await migration.up(db)
          await db.query(
            `INSERT INTO _migrations (name, batch) VALUES (${this.p(1)}, ${this.p(2)})`,
            [name, batch]
          )
        }
        if (migration.transaction === false) await run(this.driver)
        else await this.driver.transaction(run)

        console.log('\x1b[32mdone\x1b[0m')
      } catch (error) {
        console.log('\x1b[31mFAILED\x1b[0m')
        throw new Error(
          `Migration failed: ${name}\n${(error as Error).message}`
        )
      }
    }

    console.log(
      `\n\x1b[32m✓\x1b[0m ${pending.length} migrations completed.\n`
    )
  }

  async down(): Promise<void> {
    await this.ensureMigrationsTable()

    const executed = await this.getExecutedMigrations()

    if (executed.length === 0) {
      console.log('\x1b[33m[AxilJS ORM]\x1b[0m Nothing to roll back.')
      return
    }

    const lastBatch = Math.max(...executed.map(m => m.batch))
    const toRollback = executed
      .filter(m => m.batch === lastBatch)
      .reverse()

    console.log(
      `\n\x1b[33m[AxilJS ORM]\x1b[0m Rolling back batch ${lastBatch}...\n`
    )

    for (const migration of toRollback) {
      const filePath = join(this.migrationsDir, `${migration.name}.ts`)
      const jsPath   = join(this.migrationsDir, `${migration.name}.js`)
      const path     = existsSync(filePath) ? filePath : jsPath

      process.stdout.write(`  Rolling back: ${migration.name}... `)

      try {
        const mig = this.loadMigration(path, 'down')
        const run = async (db: TransactionContext) => {
          await mig.down(db)
          await db.query(
            `DELETE FROM _migrations WHERE name = ${this.p(1)}`,
            [migration.name]
          )
        }
        if (mig.transaction === false) await run(this.driver)
        else await this.driver.transaction(run)

        console.log('\x1b[32mdone\x1b[0m')
      } catch (error) {
        console.log('\x1b[31mFAILED\x1b[0m')
        throw error
      }
    }

    console.log('\n\x1b[32m✓\x1b[0m Rollback complete.\n')
  }

  async status(): Promise<void> {
    await this.ensureMigrationsTable()

    const files   = this.getMigrationFiles()
    const executed = await this.getExecutedMigrations()
    const executedMap = new Map(executed.map(m => [m.name, m]))

    console.log('\n\x1b[36m[AxilJS ORM]\x1b[0m Migration Status:\n')

    for (const file of files) {
      const name   = file.replace(/\.(ts|js)$/, '')
      const record = executedMap.get(name)

      const status = record
        ? `\x1b[32m✓ Ran\x1b[0m (batch ${record.batch})`
        : '\x1b[33m○ Pending\x1b[0m'

      console.log(`  ${status}  ${name}`)
    }

    console.log('')
  }
}