/**
 * axil generate <module|controller|service|entity|migration> <name>
 * Scaffolds files using the same templates and layout as `axil create`.
 *
 *   module      src/modules/<name>/controllers/<name>.controller.ts
 *               src/modules/<name>/services/<name>.service.ts
 *               src/migrations/<NNN>_create_<table>.ts   (database projects)
 *   controller  src/modules/<name>/controllers/<name>.controller.ts
 *   service     src/modules/<name>/services/<name>.service.ts
 *   entity      src/modules/<name>/entities/<name>.entity.ts
 *   migration   src/migrations/<NNN>_<name>.ts
 *
 * Existing files are skipped with a warning unless `force` is set.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'

import {
  Database,
  DATABASES,
  ProjectOptions,
  resourceNames,
  toSnake,
  generateResourceController,
  generateResourceService,
  generateEntity,
  generateCreateTableMigration,
  generateEmptyMigration
} from './create'
import * as ui from '../ui'

export type GeneratorKind = 'module' | 'controller' | 'service' | 'entity' | 'migration'

export const GENERATOR_KINDS: GeneratorKind[] = ['module', 'controller', 'service', 'entity', 'migration']

export interface GenerateOptions {
  // Overwrite existing files (default: false — existing files are skipped)
  force?: boolean
  // Project directory (default: process.cwd())
  cwd?:   string
  // Database used by the templates (default: detected from package.json)
  db?:    Database
  // Protect list routes with authenticate() (default: detected from package.json)
  auth?:  boolean
  // Suppress console output (default: false)
  silent?: boolean
}

export interface GenerateResult {
  created: string[]
  skipped: string[]
}

/** Infer database + auth from the project's package.json dependencies. */
export function detectProjectOptions(cwd: string): ProjectOptions {
  const options: ProjectOptions = {
    database:         'none',
    includeAuth:      false,
    includeAI:        false,
    includeWebsocket: false,
    includeQueue:     false
  }

  const pkgPath = join(cwd, 'package.json')
  if (!existsSync(pkgPath)) return options

  let pkg: any
  try { pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) } catch { return options }
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }

  if (deps['@axiljs/orm']) {
    if (deps['pg'])                  options.database = 'postgres'
    else if (deps['mysql2'])         options.database = 'mysql'
    else if (deps['better-sqlite3']) options.database = 'sqlite'
  }
  options.includeAuth      = !!deps['@axiljs/auth']
  options.includeAI        = !!deps['@axiljs/ai']
  options.includeWebsocket = !!deps['@axiljs/websocket']
  options.includeQueue     = !!deps['@axiljs/queue']
  return options
}

/** Next zero-padded migration number in `dir` ("001" when empty). */
export function nextMigrationNumber(dir: string): string {
  let max = 0
  if (existsSync(dir)) {
    for (const f of readdirSync(dir)) {
      const m = /^(\d+)[_-]/.exec(f)
      if (m) max = Math.max(max, Number(m[1]))
    }
  }
  return String(max + 1).padStart(3, '0')
}

export async function generate(
  kind: string,
  name: string,
  opts: GenerateOptions = {}
): Promise<GenerateResult> {
  if (!GENERATOR_KINDS.includes(kind as GeneratorKind)) {
    throw new Error(
      `Unknown generator "${kind}". Expected one of: ${GENERATOR_KINDS.join(', ')}.`
    )
  }
  if (!name) {
    throw new Error(`Please provide a name. Usage: axil generate ${kind} <name>`)
  }
  if (opts.db !== undefined && !DATABASES.includes(opts.db)) {
    throw new Error(`Invalid database "${opts.db}". Expected one of: ${DATABASES.join(', ')}.`)
  }

  const started = Date.now()
  const cwd     = opts.cwd || process.cwd()
  const options = detectProjectOptions(cwd)
  if (opts.db !== undefined)   options.database    = opts.db
  if (opts.auth !== undefined) options.includeAuth = opts.auth

  const files: Array<{ rel: string; content: string }> = []
  const migrationsDir = join(cwd, 'src', 'migrations')

  if (kind === 'migration') {
    const base = toSnake(name)
    if (!base) throw new Error(`Invalid migration name "${name}".`)
    const existing = findExistingMigration(migrationsDir, base)
    const migName = existing ?? `${nextMigrationNumber(migrationsDir)}_${base}`
    files.push({ rel: `src/migrations/${migName}.ts`, content: generateEmptyMigration(migName) })
  } else {
    const n   = resourceNames(name)
    const mod = `src/modules/${n.file}`

    if (kind === 'module' || kind === 'controller') {
      files.push({ rel: `${mod}/controllers/${n.file}.controller.ts`, content: generateResourceController(options, n) })
    }
    if (kind === 'module' || kind === 'service') {
      files.push({ rel: `${mod}/services/${n.file}.service.ts`, content: generateResourceService(options, n) })
    }
    if (kind === 'entity') {
      files.push({ rel: `${mod}/entities/${n.file}.entity.ts`, content: generateEntity(n) })
    }
    if (kind === 'module' && options.database !== 'none') {
      const base     = `create_${n.table}`
      const existing = findExistingMigration(migrationsDir, base)
      const migName  = existing ?? `${nextMigrationNumber(migrationsDir)}_${base}`
      files.push({
        rel:     `src/migrations/${migName}.ts`,
        content: generateCreateTableMigration(options.database, migName, n.table)
      })
    }
  }

  const result: GenerateResult = { created: [], skipped: [] }
  const quiet = opts.silent === true
  const rows: string[][] = []

  if (!quiet) ui.title('generate', `${kind} ${ui.c.bold(name)}`)

  for (const f of files) {
    const abs = join(cwd, f.rel)
    if (existsSync(abs) && !opts.force) {
      result.skipped.push(f.rel)
      rows.push([ui.c.yellow('skip'), ui.path(f.rel), ui.muted('(already exists — use --force to overwrite)')])
      continue
    }
    const existed = existsSync(abs)
    mkdirSync(dirname(abs), { recursive: true })
    writeFileSync(abs, f.content, 'utf8')
    result.created.push(f.rel)
    rows.push([ui.c.green(existed ? 'replace' : 'create'), ui.path(f.rel)])
  }

  if (quiet) return result

  ui.table(rows, { gap: 2 })

  if (kind === 'module' || kind === 'controller') {
    const n = resourceNames(name)
    const svc = `src/modules/${n.file}/services/${n.file}.service.ts`
    if (kind === 'controller' && !existsSync(join(cwd, svc))) {
      ui.line()
      ui.warn(`The controller imports ${svc}`, `create it with: axil g service ${name}`)
    }
    ui.section(`Register it in ${ui.path('src/main.ts')}:`)
    ui.line(`  ${ui.cmd(`import { ${n.className}Controller } from './modules/${n.file}/controllers/${n.file}.controller.js'`)}`)
    ui.line(`  ${ui.cmd(`new ${n.className}Controller().register(app)`)}`)
  }
  if (result.created.some(f => f.startsWith('src/migrations/'))) {
    ui.line()
    ui.info(`Apply it with ${ui.cmd('axil migrate')}`)
  }

  const summary = `${result.created.length} file(s) written` +
    (result.skipped.length ? `, ${result.skipped.length} skipped` : '')
  ui.done(summary, started)

  return result
}

/** Reuse "<NNN>_<base>.ts" if a migration with that base name already exists. */
function findExistingMigration(dir: string, base: string): string | null {
  if (!existsSync(dir)) return null
  for (const f of readdirSync(dir)) {
    const m = /^(\d+_(.+))\.ts$/.exec(f)
    if (m && m[2] === base) return m[1]
  }
  return null
}
