/**
 * AxilJS CLI — argument parsing and per-command help.
 *
 * Dependency-free flag parser used by every subcommand:
 *   --flag            boolean true
 *   --no-flag         boolean false
 *   --flag=value      string value
 *   --flag value      string value (string flags only)
 *   -y                short alias
 *   --                everything after is positional
 *
 * `--help` / `-h` is recognised for every command. Unknown flags raise an
 * ArgError that names the closest known flag.
 */

import { c, cmd, gradient, muted, sym } from './ui'
import { TEMPLATES, TEMPLATE_IDS, TEMPLATE_CATEGORIES } from './templates'

// ============================================================================
// TYPES
// ============================================================================

export interface FlagSpec {
  name:        string
  alias?:      string
  type:        'boolean' | 'string'
  description: string
  values?:     string[]
  valueName?:  string
}

export interface CommandSpec {
  name:        string
  aliases?:    string[]
  usage:       string
  summary:     string
  flags:       FlagSpec[]
  details?:    string[]
  examples?:   string[]
}

export interface ParsedArgs {
  positionals: string[]
  flags:       Record<string, string | boolean>
  help:        boolean
}

export class ArgError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ArgError'
  }
}

// ============================================================================
// PARSER
// ============================================================================

export function parseArgs(
  argv: string[],
  flags: FlagSpec[],
  command = ''
): ParsedArgs {
  const result: ParsedArgs = { positionals: [], flags: {}, help: false }
  const byName  = new Map(flags.map(f => [f.name, f]))
  const byAlias = new Map(flags.filter(f => f.alias).map(f => [f.alias as string, f]))

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]

    if (arg === '--') {
      result.positionals.push(...argv.slice(i + 1))
      break
    }

    if (arg === '--help' || arg === '-h') {
      result.help = true
      continue
    }

    if (arg.startsWith('--')) {
      const eq      = arg.indexOf('=')
      const rawName = eq === -1 ? arg.slice(2) : arg.slice(2, eq)
      const inline  = eq === -1 ? undefined : arg.slice(eq + 1)

      let spec = byName.get(rawName)
      let negated = false

      if (!spec && rawName.startsWith('no-')) {
        const base = byName.get(rawName.slice(3))
        if (base && base.type === 'boolean' && inline === undefined) {
          spec = base
          negated = true
        }
      }

      if (!spec) throw unknownFlag(`--${rawName}`, flags, command)

      if (spec.type === 'boolean') {
        if (negated) { result.flags[spec.name] = false; continue }
        if (inline === undefined) { result.flags[spec.name] = true; continue }
        const v = inline.toLowerCase()
        if (['true', '1', 'yes'].includes(v))       result.flags[spec.name] = true
        else if (['false', '0', 'no'].includes(v))  result.flags[spec.name] = false
        else throw new ArgError(`Flag --${spec.name} is a switch and does not take a value (got "${inline}").`)
        continue
      }

      let value = inline
      if (value === undefined) {
        const next = argv[i + 1]
        if (next === undefined || (next.startsWith('-') && next !== '-')) {
          throw new ArgError(`Flag --${spec.name} requires a value${spec.values ? ` (${spec.values.join(' | ')})` : ''}.`)
        }
        value = next
        i++
      }
      checkValue(spec, value)
      result.flags[spec.name] = value
      continue
    }

    if (arg.startsWith('-') && arg.length > 1 && !/^-\d/.test(arg)) {
      const spec = byAlias.get(arg.slice(1))
      if (!spec) throw unknownFlag(arg, flags, command)

      if (spec.type === 'boolean') {
        result.flags[spec.name] = true
        continue
      }

      const next = argv[i + 1]
      if (next === undefined || next.startsWith('-')) {
        throw new ArgError(`Flag ${arg} requires a value.`)
      }
      checkValue(spec, next)
      result.flags[spec.name] = next
      i++
      continue
    }

    result.positionals.push(arg)
  }

  return result
}

function checkValue(spec: FlagSpec, value: string): void {
  if (spec.values && !spec.values.includes(value)) {
    throw new ArgError(
      `Invalid value "${value}" for --${spec.name}. Expected one of: ${spec.values.join(', ')}.`
    )
  }
}

function unknownFlag(flag: string, flags: FlagSpec[], command: string): ArgError {
  const candidates = flags.flatMap(f => [`--${f.name}`, ...(f.alias ? [`-${f.alias}`] : [])])
  const best = closest(flag, candidates)
  const hint = best ? ` Did you mean ${best}?` : ''
  const cmd  = command ? `axil ${command} --help` : 'axil --help'
  return new ArgError(`Unknown flag '${flag}'.${hint} Run '${cmd}' to see available options.`)
}

/** Closest candidate within an edit distance of 3 (or null). */
export function closest(input: string, candidates: string[]): string | null {
  let best: string | null = null
  let bestDist = Infinity
  for (const c of candidates) {
    const d = levenshtein(input, c)
    if (d < bestDist) { bestDist = d; best = c }
  }
  return bestDist <= 3 ? best : null
}

function levenshtein(a: string, b: string): number {
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]
    dp[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1))
      prev = tmp
    }
  }
  return dp[b.length]
}

// ============================================================================
// COMMAND SPECS
// ============================================================================

export const COMMANDS: CommandSpec[] = [
  {
    name:    'create',
    usage:   'axil create [name] [options]',
    summary: 'Create a new AxilJS project',
    flags: [
      { name: 'template',     alias: 't', type: 'string', valueName: 'name', values: TEMPLATE_IDS, description: 'Start from a ready-made app (see Templates below)' },
      { name: 'yes',          alias: 'y', type: 'boolean', description: 'Accept defaults for every option not given as a flag (no prompts)' },
      { name: 'db',           type: 'string', valueName: 'driver', values: ['none', 'sqlite', 'postgres', 'mysql'], description: 'Database driver (default: none)' },
      { name: 'auth',         type: 'boolean', description: 'Include JWT + RBAC auth (default: on; --no-auth to disable)' },
      { name: 'ai',           type: 'boolean', description: 'Include the AI platform (default: off)' },
      { name: 'ws',           type: 'boolean', description: 'Include WebSocket support (default: off)' },
      { name: 'queue',        type: 'boolean', description: 'Include Queue and Scheduler (default: off)' },
      { name: 'skip-install', type: 'boolean', description: 'Do not run npm install' },
      { name: 'force',        type: 'boolean', description: 'Allow creating into an existing non-empty directory' }
    ],
    details: [
      'On a terminal, `axil create` asks for anything not given: the name, then a template',
      'picker (↑↓ move, ←→ category, space/enter pick, / search), then a confirmation.',
      'Without a TTY (CI, pipes) or with --yes, defaults are used and a name is required.',
      'A --template sets its own stack, so it cannot be combined with --db/--auth/--ai/--ws/--queue.',
      '',
      'Templates:',
      ...TEMPLATE_CATEGORIES.flatMap(cat => {
        const inCat = TEMPLATES.filter(t => t.category === cat)
        return inCat.length ? [`  ${cat}`, ...inCat.map(t => `    ${t.id.padEnd(18)}${t.summary}`)] : []
      })
    ],
    examples: [
      'axil create my-api',
      'axil create my-api --yes',
      'axil create my-api --db=sqlite --auth --ws --skip-install',
      'axil create my-api -y --db postgres --no-auth --queue',
      'axil create shop --template rest-api',
      'axil create chat -t realtime-chat --skip-install'
    ]
  },
  {
    name:    'generate',
    aliases: ['g'],
    usage:   'axil generate <module|controller|service|entity|migration> <name> [options]',
    summary: 'Generate a module, controller, service, entity or migration',
    flags: [
      { name: 'force', type: 'boolean', description: 'Overwrite files that already exist' },
      { name: 'db',    type: 'string', valueName: 'driver', values: ['none', 'sqlite', 'postgres', 'mysql'], description: 'Database driver for templates (default: detected from package.json)' },
      { name: 'auth',  type: 'boolean', description: 'Protect the list route with authenticate() (default: detected from package.json)' }
    ],
    details: [
      'Files follow the layout produced by `axil create`:',
      '  module      src/modules/<name>/controllers/<name>.controller.ts',
      '              src/modules/<name>/services/<name>.service.ts',
      '              src/migrations/<NNN>_create_<table>.ts (when a database is configured)',
      '  controller  src/modules/<name>/controllers/<name>.controller.ts',
      '  service     src/modules/<name>/services/<name>.service.ts',
      '  entity      src/modules/<name>/entities/<name>.entity.ts',
      '  migration   src/migrations/<NNN>_<name>.ts',
      'Existing files are never overwritten (skipped with a warning) unless --force is given.'
    ],
    examples: [
      'axil generate module products',
      'axil g controller orders',
      'axil g entity product',
      'axil g migration add_price_to_products'
    ]
  },
  {
    name:    'migrate',
    usage:   'axil migrate [up|down|status] [options]',
    summary: 'Run database migrations (@axiljs/orm MigrationRunner)',
    flags: [
      { name: 'dir', type: 'string', valueName: 'path', description: 'Migrations directory (default: src/migrations)' }
    ],
    details: [
      'Loads .env from the project directory (existing environment variables win).',
      'Connection settings:',
      '  DB_DRIVER           sqlite | postgres | mysql (optional; inferred otherwise)',
      '  DATABASE_URL        postgres://… or mysql://… connection string',
      '  DATABASE_FILENAME   SQLite file (DB_FILE is accepted as an alias)',
      'Migrations default to src/migrations (.ts needs Node >= 22.18 type stripping);',
      'when Node cannot load .ts files and dist/migrations exists, dist/migrations is used.'
    ],
    examples: [
      'axil migrate',
      'axil migrate status',
      'axil migrate down',
      'axil migrate up --dir=dist/migrations'
    ]
  },
  {
    name:    'run',
    usage:   'axil run [options]',
    summary: 'Start the development server with hot reload + Studio',
    flags: [],
    details: [
      'Compiles with tsc --incremental, runs dist/main.js and restarts on changes in src/.',
      'Studio starts on PORT + 1 (PORT is read from .env, default 3000).'
    ],
    examples: ['axil run']
  },
  {
    name:    'build',
    usage:   'axil build',
    summary: 'Compile TypeScript for production',
    flags: [],
    examples: ['axil build']
  },
  {
    name:    'install',
    aliases: ['i'],
    usage:   'axil install [packages…] [options]',
    summary: 'Install packages (delegates to npm)',
    flags: [
      { name: 'dev', alias: 'D', type: 'boolean', description: 'Save as devDependency' }
    ],
    examples: ['axil install', 'axil install @axiljs/queue', 'axil install -D @axiljs/testing']
  },
  {
    name:    'test',
    usage:   'axil test [pattern]',
    summary: 'Run *.test.ts / *.spec.ts files with @axiljs/testing',
    flags: [],
    examples: ['axil test', 'axil test users']
  },
  {
    name:    'deploy',
    usage:   'axil deploy [options]',
    summary: 'Generate Docker + Kubernetes manifests (deploy/) and .dockerignore',
    flags: [
      { name: 'port',     type: 'string', valueName: 'n', description: 'Container port (default: 3000)' },
      { name: 'replicas', type: 'string', valueName: 'n', description: 'Kubernetes replicas (default: 3)' },
      { name: 'force',    type: 'boolean', description: 'Overwrite existing files without warnings (incl. .dockerignore)' }
    ],
    details: [
      'Existing deploy/ files are overwritten with a warning (as before).',
      '.dockerignore is created only when missing (or replaced with --force).'
    ],
    examples: ['axil deploy', 'axil deploy --port=8080 --replicas=2', 'axil deploy --force']
  },
  {
    name:    'capacity',
    aliases: ['cap'],
    usage:   'axil capacity [options]',
    summary: 'Check whether this machine / deployment can carry the scaling target',
    flags: [
      { name: 'init',           type: 'boolean', description: 'Write a starter axil.scaling.json' },
      { name: 'url',            type: 'string', valueName: 'url', description: 'Measure your own running route instead of a hello-world calibration' },
      { name: 'server-workers', type: 'string', valueName: 'n', description: 'Workers the server behind --url runs (default: 1)' },
      { name: 'duration',       type: 'string', valueName: 's', description: 'Measurement length in seconds (default: 5)' },
      { name: 'connections',    type: 'string', valueName: 'n', description: 'Concurrent keep-alive connections (default: 128)' },
      { name: 'json',           type: 'boolean', description: 'Print the full report as JSON (exit 1 when it fails)' },
      { name: 'force',          type: 'boolean', description: 'With --init, overwrite an existing file' }
    ],
    details: [
      'Reads axil.scaling.json (target, vertical, horizontal). Without --url it measures one',
      '@axiljs/core worker on this machine: a framework ceiling, real routes are slower.',
      'With several workers or instances it also scans src/ for in-memory state that breaks.'
    ],
    examples: [
      'axil capacity --init',
      'axil capacity',
      'axil capacity --url http://localhost:3000/api/users --server-workers 8',
      'axil capacity --json > capacity.json'
    ]
  },
  {
    name:    'doctor',
    usage:   'axil doctor',
    summary: 'Diagnose project issues',
    flags: [],
    examples: ['axil doctor']
  },
  {
    name:    'decorator',
    aliases: ['dec'],
    usage:   'axil decorator <list|info|search|check|graph|categories> [args]',
    summary: 'Inspect semantic decorators',
    flags: [
      { name: 'category', type: 'string', valueName: 'cat', description: 'Filter `list` by category (use --category=<cat>)' }
    ],
    examples: [
      'axil decorator list',
      'axil decorator list --category=Security',
      'axil decorator info tDatabase',
      'axil decorator search cache'
    ]
  }
]

export function findCommand(name: string | undefined): CommandSpec | undefined {
  if (!name) return undefined
  return COMMANDS.find(c => c.name === name || c.aliases?.includes(name))
}

// ============================================================================
// HELP FORMATTING
// ============================================================================

export function formatCommandHelp(spec: CommandSpec): string {
  const lines: string[] = []
  const heading = (text: string): void => {
    lines.push('')
    lines.push(`  ${c.bold(text)}`)
  }

  lines.push('')
  lines.push(`  ${gradient(`${sym.logo} axil ${spec.name}`)}  ${muted(spec.summary)}`)
  if (spec.aliases?.length) {
    lines.push(`    ${muted(`Alias: ${spec.aliases.map(a => `axil ${a}`).join(', ')}`)}`)
  }

  heading('Usage:')
  lines.push(`    ${muted('$')} ${cmd(spec.usage)}`)

  heading('Options:')
  const rows = spec.flags.map(f => {
    const value = f.type === 'string' ? `=<${f.valueName || 'value'}>` : ''
    const left  = (f.alias ? `-${f.alias}, ` : '    ') + `--${f.name}${value}`
    return [left, f.description + (f.values ? muted(` [${f.values.join('|')}]`) : '')]
  })
  rows.push(['-h, --help', 'Show this help'])
  const col = Math.max(...rows.map(r => r[0].length)) + 3
  for (const [l, r] of rows) lines.push(`    ${cmd(l.padEnd(col))}${r}`)

  if (spec.details?.length) {
    heading('Details:')
    for (const d of spec.details) lines.push(`    ${d}`)
  }

  if (spec.examples?.length) {
    heading('Examples:')
    for (const e of spec.examples) lines.push(`    ${muted('$')} ${e}`)
  }

  lines.push('')
  return lines.join('\n')
}
